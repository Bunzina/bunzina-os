import { z } from 'zod';
import type { Envelope } from '@/infrastructure/messaging/envelope';
import {
  buildChargeCommand,
  buildIssueQuoteCommand,
  buildStartDiagnosticCommand,
  buildStartExecutionCommand,
} from './commands';
import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import { SagaStatus } from '@/domain/saga/types/saga-status';
import { SagaStep } from '@/domain/saga/types/saga-step';
import { Price } from '@/domain/core/value-objects/price';
import { AutoPartItem } from '@/domain/service-order/entities/auto-part-item';
import { ServiceItem } from '@/domain/service-order/entities/service-item';
import { ServiceOrder } from '@/domain/service-order/entities/service-order';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { Quote } from '@/domain/service-order/value-objects/quote';

export type SagaCommandPublisher = (command: Envelope) => Promise<void>;

const diagnosticCompletedSchema = z.object({
  serviceOrderId: z.uuid(),
  diagnosedItems: z.object({
    services: z.array(
      z.object({
        serviceId: z.uuid(),
        description: z.string(),
        priceCents: z.number().nonnegative(),
      }),
    ),
    autoParts: z.array(
      z.object({
        autoPartId: z.uuid(),
        description: z.string(),
        quantity: z.number().int().positive(),
        unitPriceCents: z.number().nonnegative(),
      }),
    ),
  }),
});

const quoteIssuedSchema = z.object({
  serviceOrderId: z.uuid(),
  quoteId: z.uuid(),
  servicesTotalCents: z.number().nonnegative(),
  autoPartsTotalCents: z.number().nonnegative(),
});

const quoteApprovedSchema = z.object({
  serviceOrderId: z.uuid(),
  quoteId: z.uuid(),
  approvedAt: z.iso.datetime(),
});

const paymentConfirmedSchema = z.object({
  serviceOrderId: z.uuid(),
  paymentId: z.uuid(),
  amountCents: z.number().nonnegative(),
  paidAt: z.iso.datetime(),
});

const executionCompletedSchema = z.object({
  serviceOrderId: z.uuid(),
  completedItems: z.array(
    z.object({
      serviceId: z.uuid(),
      finishedAt: z.iso.datetime(),
      executionTimeMs: z.number().nonnegative(),
    }),
  ),
  completedAt: z.iso.datetime(),
});

export class SagaOrchestrator {
  constructor(
    private readonly sagaRepository: SagaInstanceRepository,
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly publishCommand: SagaCommandPublisher,
  ) {}

  async start(
    order: ServiceOrder,
    causationId?: string,
  ): Promise<SagaInstance> {
    const saga = new SagaInstance({
      serviceOrderId: order.id!,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.DIAGNOSTIC,
    });
    const inDiagnostic = this.withOrderStatus(
      order,
      ServiceOrderStatus.IN_DIAGNOSTIC,
    );

    await this.sagaRepository.create(saga);
    await this.serviceOrderRepository.update(inDiagnostic);
    await this.publishCommand(
      buildStartDiagnosticCommand(inDiagnostic, causationId),
    );

    return saga;
  }

  async handle(envelope: Envelope): Promise<void> {
    const saga = await this.sagaRepository.findByServiceOrderId(
      envelope.correlationId,
    );
    if (!saga) {
      throw new Error(`Saga not found: ${envelope.correlationId}`);
    }

    switch (envelope.eventType) {
      case 'evt.workshop.diagnostic-completed':
        await this.handleDiagnosticCompleted(envelope, saga);
        return;
      case 'evt.billing.quote-issued':
        await this.handleQuoteIssued(envelope, saga);
        return;
      case 'evt.billing.quote-approved':
        await this.handleQuoteApproved(envelope, saga);
        return;
      case 'evt.billing.payment-confirmed':
        await this.handlePaymentConfirmed(envelope, saga);
        return;
      case 'evt.workshop.execution-completed':
        await this.handleExecutionCompleted(envelope, saga);
        return;
      default:
        throw new Error(`Unsupported saga event: ${envelope.eventType}`);
    }
  }

  private async handleDiagnosticCompleted(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    const data = diagnosticCompletedSchema.parse(envelope.data);
    const order = await this.requireOrder(saga.serviceOrderId);
    const diagnosedOrder = this.withDiagnosticItems(order, data);
    const awaitingApproval = this.withOrderStatus(
      diagnosedOrder,
      ServiceOrderStatus.AWAITING_APPROVAL,
    );

    saga.completeStep(SagaStep.DIAGNOSTIC, SagaStep.QUOTE);
    await this.serviceOrderRepository.update(awaitingApproval);
    await this.sagaRepository.update(saga);
    await this.publishCommand(
      buildIssueQuoteCommand(awaitingApproval, envelope.eventId),
    );
  }

  private async handleQuoteIssued(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    const data = quoteIssuedSchema.parse(envelope.data);
    const order = await this.requireOrder(saga.serviceOrderId);
    const updatedOrder = new ServiceOrder({
      ...order,
      quote: new Quote({
        servicesTotal: data.servicesTotalCents / 100,
        autoPartsTotal: data.autoPartsTotalCents / 100,
      }),
      updatedAt: new Date(),
    });

    saga.setQuote(data.quoteId);
    await this.serviceOrderRepository.update(updatedOrder);
    await this.sagaRepository.update(saga);
  }

  private async handleQuoteApproved(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    const data = quoteApprovedSchema.parse(envelope.data);
    const order = await this.requireOrder(saga.serviceOrderId);
    saga.setQuote(data.quoteId);
    saga.completeStep(SagaStep.QUOTE, SagaStep.PAYMENT);

    const awaitingPayment = new ServiceOrder({
      ...order,
      status: ServiceOrderStatus.AWAITING_PAYMENT,
      approvedAt: new Date(data.approvedAt),
      updatedAt: new Date(),
    });

    await this.serviceOrderRepository.update(awaitingPayment);
    await this.sagaRepository.update(saga);
    await this.publishCommand(
      buildChargeCommand({
        order: awaitingPayment,
        quoteId: data.quoteId,
        causationId: envelope.eventId,
      }),
    );
  }

  private async handlePaymentConfirmed(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    const data = paymentConfirmedSchema.parse(envelope.data);
    const order = await this.requireOrder(saga.serviceOrderId);
    saga.setPayment(data.paymentId, data.amountCents);
    saga.completeStep(SagaStep.PAYMENT, SagaStep.EXECUTION);

    const inExecution = new ServiceOrder({
      ...order,
      status: ServiceOrderStatus.IN_EXECUTION,
      paidAt: new Date(data.paidAt),
      startedAt: new Date(),
      updatedAt: new Date(),
    });

    await this.serviceOrderRepository.update(inExecution);
    await this.sagaRepository.update(saga);
    await this.publishCommand(
      buildStartExecutionCommand(inExecution, envelope.eventId),
    );
  }

  private async handleExecutionCompleted(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    const data = executionCompletedSchema.parse(envelope.data);
    const order = await this.requireOrder(saga.serviceOrderId);
    const completedItems = new Map(
      data.completedItems.map((item) => [item.serviceId, item]),
    );
    const serviceItems = order.serviceItems.map((item) => {
      const completed = completedItems.get(item.serviceId);
      if (!completed) return item;

      return new ServiceItem({
        ...item,
        isCompleted: true,
        finishedAt: new Date(completed.finishedAt),
        executionTimeMs: completed.executionTimeMs,
        updatedAt: new Date(),
      });
    });
    const completedOrder = new ServiceOrder({
      ...order,
      status: ServiceOrderStatus.COMPLETED,
      serviceItems,
      completedAt: new Date(data.completedAt),
      updatedAt: new Date(),
    });

    saga.completeStep(SagaStep.EXECUTION, SagaStep.EXECUTION);
    saga.complete();
    await this.serviceOrderRepository.update(completedOrder);
    await this.sagaRepository.update(saga);
  }

  private async requireOrder(serviceOrderId: string): Promise<ServiceOrder> {
    const order = await this.serviceOrderRepository.findById(serviceOrderId);
    if (!order) throw new Error(`Service order not found: ${serviceOrderId}`);
    return order;
  }

  private withOrderStatus(
    order: ServiceOrder,
    status: ServiceOrderStatus,
  ): ServiceOrder {
    return new ServiceOrder({ ...order, status, updatedAt: new Date() });
  }

  private withDiagnosticItems(
    order: ServiceOrder,
    data: z.infer<typeof diagnosticCompletedSchema>,
  ): ServiceOrder {
    const serviceItems = data.diagnosedItems.services.map(
      (item) =>
        new ServiceItem({
          serviceId: item.serviceId,
          description: item.description,
          price: new Price(item.priceCents / 100),
        }),
    );
    const autoPartItems = data.diagnosedItems.autoParts.map(
      (item) =>
        new AutoPartItem({
          autoPartId: item.autoPartId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: new Price(item.unitPriceCents / 100),
          totalPrice: new Price((item.unitPriceCents * item.quantity) / 100),
        }),
    );

    return new ServiceOrder({
      ...order,
      serviceItems,
      autoPartItems,
      quote: new Quote({
        servicesTotal: serviceItems.reduce(
          (total, item) => total + item.price.value,
          0,
        ),
        autoPartsTotal: autoPartItems.reduce(
          (total, item) => total + (item.totalPrice?.value ?? 0),
          0,
        ),
      }),
      updatedAt: new Date(),
    });
  }
}
