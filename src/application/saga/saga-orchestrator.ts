import { z } from 'zod';
import type { Envelope } from '@/infrastructure/messaging/envelope';
import {
  buildAbortExecutionCommand,
  buildChargeCommand,
  buildCancelQuoteCommand,
  buildIssueQuoteCommand,
  buildRefundCommand,
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

export type SagaTimeouts = {
  diagnosticMs: number;
  quoteMs: number;
  paymentMs: number;
  executionMs: number;
};

const defaultTimeouts: SagaTimeouts = {
  diagnosticMs: 5 * 60 * 1000,
  quoteMs: 24 * 60 * 60 * 1000,
  paymentMs: 30 * 60 * 1000,
  executionMs: 24 * 60 * 60 * 1000,
};

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

const failureSchema = z.object({
  serviceOrderId: z.uuid(),
  reason: z.string().min(1),
  detail: z.string().default(''),
});

const paymentFailedSchema = failureSchema.extend({
  quoteId: z.uuid(),
  paymentId: z.uuid().optional(),
});

const executionFailedSchema = failureSchema;

const quoteCanceledSchema = z.object({
  serviceOrderId: z.uuid(),
  quoteId: z.uuid(),
});

const executionAbortedSchema = z.object({
  serviceOrderId: z.uuid(),
});

const paymentRefundedSchema = z.object({
  serviceOrderId: z.uuid(),
  paymentId: z.uuid(),
});

export class SagaOrchestrator {
  constructor(
    private readonly sagaRepository: SagaInstanceRepository,
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly publishCommand: SagaCommandPublisher,
    private readonly timeouts: SagaTimeouts = defaultTimeouts,
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
    saga.setStepDeadline(new Date(Date.now() + this.timeouts.diagnosticMs));
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
      case 'evt.workshop.diagnostic-failed':
        await this.handleDiagnosticFailed(envelope, saga);
        return;
      case 'evt.billing.payment-failed':
        await this.handlePaymentFailed(envelope, saga);
        return;
      case 'evt.workshop.execution-failed':
        await this.handleExecutionFailed(envelope, saga);
        return;
      case 'evt.billing.quote-canceled':
        await this.handleQuoteCanceled(envelope, saga);
        return;
      case 'evt.workshop.execution-aborted':
        await this.handleExecutionAborted(envelope, saga);
        return;
      case 'evt.billing.payment-refunded':
        await this.handlePaymentRefunded(envelope, saga);
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
    saga.setStepDeadline(new Date(Date.now() + this.timeouts.quoteMs));
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
    saga.setStepDeadline(new Date(Date.now() + this.timeouts.quoteMs));
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
    saga.setStepDeadline(new Date(Date.now() + this.timeouts.paymentMs));

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
    saga.setStepDeadline(new Date(Date.now() + this.timeouts.executionMs));

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
    saga.clearStepDeadline();
    await this.serviceOrderRepository.update(completedOrder);
    await this.sagaRepository.update(saga);
  }

  async handleTimeout(saga: SagaInstance): Promise<void> {
    saga.startCompensation('TIMEOUT');
    saga.clearStepDeadline();
    await this.sagaRepository.update(saga);

    if (saga.currentStep === SagaStep.EXECUTION && saga.paymentId) {
      await this.publishCommand(
        buildAbortExecutionCommand({
          serviceOrderId: saga.serviceOrderId,
          reason: 'TIMEOUT',
          detail: 'Execution step timed out',
        }),
      );
      return;
    }

    if (saga.quoteId) {
      await this.publishCommand(
        buildCancelQuoteCommand({
          serviceOrderId: saga.serviceOrderId,
          quoteId: saga.quoteId,
          reason: 'TIMEOUT',
          detail: 'Saga step timed out',
        }),
      );
      return;
    }

    await this.publishCommand(
      buildAbortExecutionCommand({
        serviceOrderId: saga.serviceOrderId,
        reason: 'TIMEOUT',
        detail: 'Diagnostic step timed out',
      }),
    );
  }

  private async handleDiagnosticFailed(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    const data = failureSchema.parse(envelope.data);
    saga.startCompensation(data.reason);
    saga.clearStepDeadline();
    await this.sagaRepository.update(saga);
    await this.publishCommand(
      buildAbortExecutionCommand({
        serviceOrderId: saga.serviceOrderId,
        reason: data.reason,
        detail: data.detail,
        causationId: envelope.eventId,
      }),
    );
  }

  private async handlePaymentFailed(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    const data = paymentFailedSchema.parse(envelope.data);
    saga.setQuote(data.quoteId);
    saga.startCompensation(data.reason);
    saga.clearStepDeadline();
    await this.sagaRepository.update(saga);
    await this.publishCommand(
      buildCancelQuoteCommand({
        serviceOrderId: saga.serviceOrderId,
        quoteId: data.quoteId,
        reason: data.reason,
        detail: data.detail,
        causationId: envelope.eventId,
      }),
    );
  }

  private async handleExecutionFailed(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    const data = executionFailedSchema.parse(envelope.data);
    saga.startCompensation(data.reason);
    saga.clearStepDeadline();
    await this.sagaRepository.update(saga);
    await this.publishCommand(
      buildAbortExecutionCommand({
        serviceOrderId: saga.serviceOrderId,
        reason: data.reason,
        detail: data.detail,
        causationId: envelope.eventId,
      }),
    );
  }

  private async handleQuoteCanceled(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    quoteCanceledSchema.parse(envelope.data);
    await this.finishCompensation(saga);
  }

  private async handleExecutionAborted(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    executionAbortedSchema.parse(envelope.data);

    if (saga.paymentId && saga.paymentAmountCents !== undefined) {
      await this.publishCommand(
        buildRefundCommand({
          serviceOrderId: saga.serviceOrderId,
          paymentId: saga.paymentId,
          amountCents: saga.paymentAmountCents,
          reason: saga.lastError ?? 'PROVIDER_ERROR',
          detail: 'Execution was aborted during compensation',
          causationId: envelope.eventId,
        }),
      );
      return;
    }

    await this.finishCompensation(saga);
  }

  private async handlePaymentRefunded(
    envelope: Envelope,
    saga: SagaInstance,
  ): Promise<void> {
    paymentRefundedSchema.parse(envelope.data);
    await this.finishCompensation(saga);
  }

  private async finishCompensation(saga: SagaInstance): Promise<void> {
    const order = await this.requireOrder(saga.serviceOrderId);
    const canceledOrder = this.withOrderStatus(
      order,
      ServiceOrderStatus.CANCELED,
    );
    saga.fail(saga.lastError ?? 'COMPENSATED');
    saga.clearStepDeadline();
    await this.serviceOrderRepository.update(canceledOrder);
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
