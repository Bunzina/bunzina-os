import { describe, expect, test } from 'bun:test';
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
import {
  BufferedSagaObservability,
  PostgresSagaEventProcessor,
} from './postgres-saga-event-processor';

const state: {
  saga: SagaInstance | null;
  order: ReturnType<typeof makeServiceOrder> | null;
  processedEvents: Set<string>;
  commands: Envelope[];
  transactionReferences: unknown[];
  serviceOrderRepositoryUsesExistingTransaction: boolean[];
} = {
  saga: null,
  order: null,
  processedEvents: new Set(),
  commands: [],
  transactionReferences: [],
  serviceOrderRepositoryUsesExistingTransaction: [],
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

const repositories = {
  processedEvents: class {
    constructor(transaction: unknown) {
      recordTransaction(transaction);
    }

    async tryMarkProcessed(eventId: string) {
      if (state.processedEvents.has(eventId)) return false;
      state.processedEvents.add(eventId);
      return true;
    }
  },
  sagas: class {
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

    async create(saga: SagaInstance) {
      return saga;
    }

    async findExpired() {
      return [];
    }
  },
  serviceOrders: class {
    constructor(transaction: unknown, useExistingTransaction: boolean) {
      recordTransaction(transaction);
      state.serviceOrderRepositoryUsesExistingTransaction.push(
        useExistingTransaction,
      );
    }

    async findById() {
      return state.order;
    }

    async update(order: ReturnType<typeof makeServiceOrder>) {
      state.order = order;
      return order;
    }

    async create(order: ReturnType<typeof makeServiceOrder>) {
      return order;
    }

    async findByCustomerDocument() {
      return [];
    }

    async findByParams() {
      return [];
    }

    async delete() {}

    async markDelivered() {
      return true;
    }

    async findServiceItemById() {
      return null;
    }

    async updateServiceItem() {
      return null;
    }

    async findByServiceItemId() {
      return null;
    }
  },
  outbox: class {
    constructor(transaction: unknown) {
      recordTransaction(transaction);
    }

    async enqueue(message: { payload: Envelope }) {
      state.commands.push(message.payload);
    }

    async findPending() {
      return [];
    }

    async markPublished() {}

    async markFailed() {}
  },
};

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

const makeProcessor = () =>
  new PostgresSagaEventProcessor(
    makeDatabase() as never,
    'bunzina-os',
    repositories,
  );

const resetState = (saga?: SagaInstance) => {
  state.saga = saga ?? null;
  state.order = makeServiceOrder();
  state.processedEvents = new Set();
  state.commands = [];
  state.transactionReferences = [];
  state.serviceOrderRepositoryUsesExistingTransaction = [];
};

const assertSingleTransaction = () => {
  expect(state.transactionReferences.length).toBeGreaterThan(0);
  expect(new Set(state.transactionReferences).size).toBe(1);
};

describe('PostgresSagaEventProcessor', () => {
  test('buffers observability records until explicitly flushed', () => {
    const records: string[] = [];
    const observability = new BufferedSagaObservability({
      recordState: () => records.push('state'),
      recordCompensation: (reason) => records.push(`compensation:${reason}`),
      recordTimeout: (step) => records.push(`timeout:${step}`),
      recordOutcome: (_saga, outcome) => records.push(`outcome:${outcome}`),
    });
    const saga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.DIAGNOSTIC,
    });

    observability.recordState(saga);
    observability.recordCompensation('PAYMENT_FAILED');
    observability.recordTimeout(SagaStep.DIAGNOSTIC);
    observability.recordOutcome(saga, 'compensated');

    expect(records).toEqual([]);
    observability.flush();
    expect(records).toEqual([
      'state',
      'compensation:PAYMENT_FAILED',
      'timeout:DIAGNOSTIC',
      'outcome:compensated',
    ]);
  });

  test('processes event state and commands in the same transaction as idempotency', async () => {
    const saga = new SagaInstance({
      serviceOrderId,
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.DIAGNOSTIC,
    });
    resetState(saga);
    state.order = makeServiceOrder(ServiceOrderStatus.IN_DIAGNOSTIC);
    const processor = makeProcessor();
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
    expect(state.serviceOrderRepositoryUsesExistingTransaction).toEqual([true]);
    assertSingleTransaction();
  });

  test('rolls back the processed-event claim when orchestration fails', async () => {
    resetState();
    const processor = makeProcessor();
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
    const processor = makeProcessor();
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
    const processor = makeProcessor();

    await expect(
      processor.processTimeout(serviceOrderId, new Date()),
    ).resolves.toBe(true);

    expect(state.saga?.status).toBe(SagaStatus.COMPENSATING);
    expect(state.commands[0]?.eventType).toBe('cmd.workshop.abort');
    assertSingleTransaction();
  });
});
