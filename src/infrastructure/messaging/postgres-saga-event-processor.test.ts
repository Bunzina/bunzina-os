import { describe, expect, mock, test } from 'bun:test';
import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import { SagaStatus } from '@/domain/saga/types/saga-status';
import { SagaStep } from '@/domain/saga/types/saga-step';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import {
  makeServiceOrder,
  paymentId,
  serviceOrderId,
} from '@/test/fixtures/saga-scenario';
import { buildEnvelope, type Envelope } from './envelope';

const state: {
  saga: SagaInstance | null;
  order: ReturnType<typeof makeServiceOrder> | null;
  processedEvents: Set<string>;
  commands: Envelope[];
  transactionReferences: unknown[];
} = {
  saga: null,
  order: null,
  processedEvents: new Set(),
  commands: [],
  transactionReferences: [],
};

const snapshotState = () => ({
  saga: state.saga ? new SagaInstance({ ...state.saga }) : null,
  order: state.order,
  processedEvents: new Set(state.processedEvents),
  commands: [...state.commands],
});

const restoreState = (snapshot: ReturnType<typeof snapshotState>) => {
  state.saga = snapshot.saga;
  state.order = snapshot.order;
  state.processedEvents = snapshot.processedEvents;
  state.commands = snapshot.commands;
};

const recordTransaction = (transaction: unknown) => {
  state.transactionReferences.push(transaction);
};

mock.module(
  '@/infrastructure/repositories/saga/processed-event-repository',
  () => ({
    ProcessedEventRepository: class {
      constructor(transaction: unknown) {
        recordTransaction(transaction);
      }

      async tryMarkProcessed(eventId: string) {
        if (state.processedEvents.has(eventId)) return false;
        state.processedEvents.add(eventId);
        return true;
      }
    },
  }),
);

mock.module(
  '@/infrastructure/repositories/saga/saga-instance-repository',
  () => ({
    SagaInstanceRepository: class {
      constructor(transaction: unknown) {
        recordTransaction(transaction);
      }

      async findByServiceOrderId() {
        return state.saga;
      }

      async claimExpired(_serviceOrderId: string, now: Date) {
        const saga = state.saga;
        if (!saga?.stepDeadlineAt || saga.stepDeadlineAt > now) return null;

        saga.status = SagaStatus.COMPENSATING;
        saga.lastError = 'TIMEOUT';
        saga.clearStepDeadline();
        return saga;
      }

      async update(saga: SagaInstance) {
        state.saga = saga;
        return saga;
      }
    },
  }),
);

mock.module(
  '@/infrastructure/repositories/service-order/service-order-repository',
  () => ({
    ServiceOrderRepository: class {
      constructor(transaction: unknown) {
        recordTransaction(transaction);
      }

      async findById() {
        return state.order;
      }

      async update(order: ReturnType<typeof makeServiceOrder>) {
        state.order = order;
        return order;
      }
    },
  }),
);

mock.module('@/infrastructure/repositories/outbox/outbox-repository', () => ({
  OutboxRepository: class {
    constructor(transaction: unknown) {
      recordTransaction(transaction);
    }

    async enqueue(message: { payload: Envelope }) {
      state.commands.push(message.payload);
    }
  },
}));

const { PostgresSagaEventProcessor } =
  await import('./postgres-saga-event-processor');

const makeDatabase = () => ({
  begin: async (operation: (transaction: unknown) => Promise<void>) => {
    const snapshot = snapshotState();
    state.transactionReferences = [];
    try {
      await operation({ transactionId: crypto.randomUUID() });
    } catch (error) {
      restoreState(snapshot);
      throw error;
    }
  },
});

const resetState = (saga?: SagaInstance) => {
  state.saga = saga ?? null;
  state.order = makeServiceOrder();
  state.processedEvents = new Set();
  state.commands = [];
  state.transactionReferences = [];
};

const assertSingleTransaction = () => {
  expect(state.transactionReferences.length).toBeGreaterThan(0);
  expect(new Set(state.transactionReferences).size).toBe(1);
};

describe('PostgresSagaEventProcessor', () => {
  test('processes event state and commands in the same transaction as idempotency', async () => {
    const saga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.DIAGNOSTIC,
    });
    resetState(saga);
    state.order = makeServiceOrder(ServiceOrderStatus.IN_DIAGNOSTIC);
    const processor = new PostgresSagaEventProcessor(makeDatabase() as never);
    const envelope = buildEnvelope({
      eventType: 'evt.workshop.diagnostic-completed',
      correlationId: serviceOrderId,
      data: {
        serviceOrderId,
        diagnosedItems: {
          services: [
            {
              serviceId: '44444444-4444-4444-8444-444444444444',
              description: 'Diagnosis',
              priceCents: 20000,
            },
          ],
          autoParts: [],
        },
      },
    });

    await expect(processor.process(envelope)).resolves.toBe(true);

    expect(state.processedEvents.has(envelope.eventId)).toBe(true);
    expect(state.order?.status).toBe(ServiceOrderStatus.AWAITING_APPROVAL);
    expect(state.commands[0]?.eventType).toBe('cmd.billing.issue-quote');
    assertSingleTransaction();
  });

  test('rolls back the processed-event claim when orchestration fails', async () => {
    resetState();
    const processor = new PostgresSagaEventProcessor(makeDatabase() as never);
    const envelope = buildEnvelope({
      eventType: 'evt.billing.quote-issued',
      correlationId: serviceOrderId,
      data: {
        serviceOrderId,
        quoteId: '66666666-6666-4666-8666-666666666666',
        servicesTotalCents: 1,
        autoPartsTotalCents: 0,
      },
    });

    await expect(processor.process(envelope)).rejects.toThrow(
      `Saga not found: ${serviceOrderId}`,
    );

    expect(state.processedEvents.has(envelope.eventId)).toBe(false);
    expect(state.commands).toHaveLength(0);
  });

  test('acks a duplicate without repeating orchestration', async () => {
    const saga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.QUOTE,
    });
    resetState(saga);
    const processor = new PostgresSagaEventProcessor(makeDatabase() as never);
    const envelope = buildEnvelope({
      eventType: 'evt.billing.quote-issued',
      correlationId: serviceOrderId,
      data: {
        serviceOrderId,
        quoteId: '66666666-6666-4666-8666-666666666666',
        servicesTotalCents: 1,
        autoPartsTotalCents: 0,
      },
    });
    state.processedEvents.add(envelope.eventId);

    await expect(processor.process(envelope)).resolves.toBe(false);

    expect(state.order?.quote.total).toBe(200);
    expect(state.commands).toHaveLength(0);
  });

  test('claims and compensates an expired saga in one transaction', async () => {
    const saga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.EXECUTION,
      stepDeadlineAt: new Date(0),
      paymentId,
      paymentAmountCents: 26000,
    });
    resetState(saga);
    const processor = new PostgresSagaEventProcessor(makeDatabase() as never);

    await expect(
      processor.processTimeout(serviceOrderId, new Date()),
    ).resolves.toBe(true);

    expect(state.saga?.status).toBe(SagaStatus.COMPENSATING);
    expect(state.commands[0]?.eventType).toBe('cmd.workshop.abort');
    assertSingleTransaction();
  });
});
