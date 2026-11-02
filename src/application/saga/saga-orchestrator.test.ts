import { describe, expect, test } from 'bun:test';
import { Price } from '@/domain/core/value-objects/price';
import { AutoPartItem } from '@/domain/service-order/entities/auto-part-item';
import { ServiceItem } from '@/domain/service-order/entities/service-item';
import { ServiceOrder } from '@/domain/service-order/entities/service-order';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { Quote } from '@/domain/service-order/value-objects/quote';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import { SagaStatus } from '@/domain/saga/types/saga-status';
import { SagaStep } from '@/domain/saga/types/saga-step';
import {
  buildEnvelope,
  type Envelope,
} from '@/infrastructure/messaging/envelope';
import { SagaOrchestrator } from './saga-orchestrator';

const serviceOrderId = '11111111-1111-4111-8111-111111111111';
const customerId = '22222222-2222-4222-8222-222222222222';
const vehicleId = '33333333-3333-4333-8333-333333333333';
const serviceId = '44444444-4444-4444-8444-444444444444';
const autoPartId = '55555555-5555-4555-8555-555555555555';
const quoteId = '66666666-6666-4666-8666-666666666666';
const paymentId = '77777777-7777-4777-8777-777777777777';

const makeOrder = () =>
  new ServiceOrder({
    id: serviceOrderId,
    customerId,
    customerSnapshot: {
      id: customerId,
      name: 'Ana Souza',
      document: '12345678901',
      email: 'ana@example.com',
    },
    vehicleId,
    vehicleSnapshot: { id: vehicleId, plate: 'ABC1D23', model: 'Gol' },
    status: ServiceOrderStatus.RECEIVED,
    serviceItems: [new ServiceItem({ serviceId, price: new Price(150) })],
    autoPartItems: [
      new AutoPartItem({
        autoPartId,
        quantity: 1,
        unitPrice: new Price(50),
        totalPrice: new Price(50),
      }),
    ],
    quote: new Quote({ servicesTotal: 150, autoPartsTotal: 50 }),
  });

const event = <TData extends Record<string, unknown>>(
  eventType: string,
  data: TData,
): Envelope<TData> =>
  buildEnvelope({
    eventType,
    correlationId: serviceOrderId,
    data,
  });

describe('saga orchestrator', () => {
  test('should create a running saga and start diagnostic', async () => {
    const order = makeOrder();
    const createdSagas: SagaInstance[] = [];
    const updatedOrders: ServiceOrder[] = [];
    const commands: Envelope[] = [];
    const sagaRepository: SagaInstanceRepository = {
      findByServiceOrderId: async () => null,
      findExpired: async () => [],
      claimExpired: async () => null,
      create: async (saga) => {
        createdSagas.push(saga);
        return saga;
      },
      update: async (saga) => saga,
    };
    const serviceOrderRepository = {
      update: async (value: ServiceOrder) => {
        updatedOrders.push(value);
        return value;
      },
    } as unknown as ServiceOrderRepository;
    const orchestrator = new SagaOrchestrator(
      sagaRepository,
      serviceOrderRepository,
      async (command) => {
        commands.push(command);
      },
    );

    const saga = await orchestrator.start(order);

    expect(saga).toBe(createdSagas[0]!);
    expect(saga).toEqual({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.DIAGNOSTIC,
      completedSteps: [],
      stepDeadlineAt: expect.any(Date),
      lastError: undefined,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
      quoteId: undefined,
      paymentId: undefined,
      paymentAmountCents: undefined,
    } as unknown as SagaInstance);
    expect(updatedOrders[0]?.status).toBe(ServiceOrderStatus.IN_DIAGNOSTIC);
    expect(commands[0]?.eventType).toBe('cmd.workshop.start-diagnostic');
  });

  test('should execute the complete happy path', async () => {
    let order = makeOrder();
    const saga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.DIAGNOSTIC,
    });
    const commands: Envelope[] = [];
    const sagaRepository: SagaInstanceRepository = {
      findByServiceOrderId: async () => saga,
      findExpired: async () => [],
      claimExpired: async () => null,
      create: async (value) => value,
      update: async (value) => value,
    };
    const serviceOrderRepository = {
      findById: async () => order,
      update: async (value: ServiceOrder) => {
        order = value;
        return value;
      },
    } as unknown as ServiceOrderRepository;
    const orchestrator = new SagaOrchestrator(
      sagaRepository,
      serviceOrderRepository,
      async (command) => {
        commands.push(command);
      },
    );

    await orchestrator.handle(
      event('evt.workshop.diagnostic-completed', {
        serviceOrderId,
        diagnosedItems: {
          services: [
            { serviceId, description: 'Diagnostico', priceCents: 20000 },
          ],
          autoParts: [
            {
              autoPartId,
              description: 'Filtro',
              quantity: 1,
              unitPriceCents: 6000,
            },
          ],
        },
      }),
    );
    expect(commands.at(-1)?.eventType).toBe('cmd.billing.issue-quote');
    expect(order.status).toBe(ServiceOrderStatus.AWAITING_APPROVAL);

    await orchestrator.handle(
      event('evt.billing.quote-issued', {
        serviceOrderId,
        quoteId,
        servicesTotalCents: 20000,
        autoPartsTotalCents: 6000,
      }),
    );
    expect(saga.quoteId).toBe(quoteId);
    expect(order.quote.total).toBe(260);

    await orchestrator.handle(
      event('evt.billing.quote-approved', {
        serviceOrderId,
        quoteId,
        approvedAt: '2026-10-25T10:00:00.000Z',
      }),
    );
    expect(commands.at(-1)?.eventType).toBe('cmd.billing.charge');
    expect(order.status).toBe(ServiceOrderStatus.AWAITING_PAYMENT);

    await orchestrator.handle(
      event('evt.billing.payment-confirmed', {
        serviceOrderId,
        paymentId,
        amountCents: 26000,
        paidAt: '2026-10-25T10:05:00.000Z',
      }),
    );
    expect(commands.at(-1)?.eventType).toBe('cmd.workshop.start-execution');
    expect(order.status).toBe(ServiceOrderStatus.IN_EXECUTION);
    expect(saga.paymentId).toBe(paymentId);

    await orchestrator.handle(
      event('evt.workshop.execution-completed', {
        serviceOrderId,
        completedItems: [
          {
            serviceId,
            finishedAt: '2026-10-25T11:00:00.000Z',
            executionTimeMs: 3600000,
          },
        ],
        completedAt: '2026-10-25T11:00:00.000Z',
      }),
    );

    expect(order).toEqual(
      expect.objectContaining({
        status: ServiceOrderStatus.COMPLETED,
        completedAt: expect.any(Date),
      }),
    );
    expect(saga.status).toBe(SagaStatus.COMPLETED);
    expect(commands.map((command) => command.eventType)).toEqual([
      'cmd.billing.issue-quote',
      'cmd.billing.charge',
      'cmd.workshop.start-execution',
    ]);
  });

  test('should reject an event for an unknown saga', async () => {
    const repository = {
      findByServiceOrderId: async () => null,
    } as unknown as SagaInstanceRepository;
    const orchestrator = new SagaOrchestrator(
      repository,
      {} as ServiceOrderRepository,
      async () => undefined,
    );

    await expect(
      orchestrator.handle(
        event('evt.billing.quote-issued', {
          serviceOrderId,
          quoteId,
          servicesTotalCents: 1,
          autoPartsTotalCents: 1,
        }),
      ),
    ).rejects.toThrow(`Saga not found: ${serviceOrderId}`);
  });

  test('should cancel the quote when payment fails', async () => {
    const order = makeOrder();
    const saga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.PAYMENT,
      quoteId,
    });
    const commands: Envelope[] = [];
    const updatedOrders: ServiceOrder[] = [];
    const sagaRepository = {
      findByServiceOrderId: async () => saga,
      findExpired: async () => [],
      claimExpired: async () => null,
      create: async (value: SagaInstance) => value,
      update: async (value: SagaInstance) => value,
    } as SagaInstanceRepository;
    const serviceOrderRepository = {
      findById: async () => order,
      update: async (value: ServiceOrder) => {
        updatedOrders.push(value);
        return value;
      },
    } as unknown as ServiceOrderRepository;
    const orchestrator = new SagaOrchestrator(
      sagaRepository,
      serviceOrderRepository,
      async (command) => {
        commands.push(command);
      },
    );

    await orchestrator.handle(
      event('evt.billing.payment-failed', {
        serviceOrderId,
        quoteId,
        reason: 'EXPIRED',
        detail: 'PIX expired',
      }),
    );
    expect(commands[0]?.eventType).toBe('cmd.billing.cancel-quote');

    await orchestrator.handle(
      event('evt.billing.quote-canceled', { serviceOrderId, quoteId }),
    );
    expect(saga.status).toBe(SagaStatus.FAILED);
    expect(updatedOrders.at(-1)?.status).toBe(ServiceOrderStatus.CANCELED);
  });

  test('should abort and refund after an execution failure', async () => {
    const order = new ServiceOrder({
      ...makeOrder(),
      status: ServiceOrderStatus.IN_EXECUTION,
    });
    const saga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.EXECUTION,
      paymentId,
      paymentAmountCents: 20000,
    });
    const commands: Envelope[] = [];
    const sagaRepository = {
      findByServiceOrderId: async () => saga,
      findExpired: async () => [],
      claimExpired: async () => null,
      create: async (value: SagaInstance) => value,
      update: async (value: SagaInstance) => value,
    } as SagaInstanceRepository;
    const serviceOrderRepository = {
      findById: async () => order,
      update: async (value: ServiceOrder) => value,
    } as unknown as ServiceOrderRepository;
    const orchestrator = new SagaOrchestrator(
      sagaRepository,
      serviceOrderRepository,
      async (command) => {
        commands.push(command);
      },
    );

    await orchestrator.handle(
      event('evt.workshop.execution-failed', {
        serviceOrderId,
        reason: 'PART_UNAVAILABLE',
        detail: 'Part unavailable',
      }),
    );
    expect(commands[0]?.eventType).toBe('cmd.workshop.abort');

    await orchestrator.handle(
      event('evt.workshop.execution-aborted', { serviceOrderId }),
    );
    expect(commands[1]?.eventType).toBe('cmd.billing.refund');

    await orchestrator.handle(
      event('evt.billing.payment-refunded', { serviceOrderId, paymentId }),
    );
    expect(saga.status).toBe(SagaStatus.FAILED);
  });

  test('should select the right command for each timeout stage', async () => {
    const commands: Envelope[] = [];
    let currentSaga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.EXECUTION,
      paymentId,
      paymentAmountCents: 20000,
    });
    const sagaRepository = {
      findByServiceOrderId: async () => currentSaga,
      findExpired: async () => [],
      claimExpired: async () => null,
      create: async (value: SagaInstance) => value,
      update: async (value: SagaInstance) => {
        currentSaga = value;
        return value;
      },
    } as SagaInstanceRepository;
    const orchestrator = new SagaOrchestrator(
      sagaRepository,
      {} as ServiceOrderRepository,
      async (command) => {
        commands.push(command);
      },
    );

    await orchestrator.handleTimeout(currentSaga);
    expect(commands.at(-1)?.eventType).toBe('cmd.workshop.abort');

    currentSaga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.QUOTE,
      quoteId,
    });
    await orchestrator.handleTimeout(currentSaga);
    expect(commands.at(-1)?.eventType).toBe('cmd.billing.cancel-quote');

    currentSaga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.DIAGNOSTIC,
    });
    await orchestrator.handleTimeout(currentSaga);
    expect(commands.at(-1)?.eventType).toBe('cmd.workshop.abort');

    currentSaga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.DIAGNOSTIC,
    });
    await orchestrator.handle(
      event('evt.workshop.diagnostic-failed', {
        serviceOrderId,
        reason: 'UNREPAIRABLE',
        detail: 'Vehicle cannot be repaired',
      }),
    );
    expect(commands.at(-1)?.eventType).toBe('cmd.workshop.abort');
  });
});
