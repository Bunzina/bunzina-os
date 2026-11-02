import { describe, expect, test } from 'bun:test';
import { SagaTimeoutWorker } from './saga-timeout-worker';
import { SagaStatus } from '@/domain/saga/types/saga-status';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import {
  autoPartId,
  paymentId,
  quoteId,
  SagaScenario,
  serviceId,
  serviceOrderId,
} from '@/test/fixtures/saga-scenario';

const diagnosticCompleted = {
  serviceOrderId,
  diagnosedItems: {
    services: [{ serviceId, description: 'Diagnóstico', priceCents: 20000 }],
    autoParts: [
      {
        autoPartId,
        description: 'Filtro',
        quantity: 1,
        unitPriceCents: 6000,
      },
    ],
  },
};

const quoteIssued = {
  serviceOrderId,
  quoteId,
  servicesTotalCents: 20000,
  autoPartsTotalCents: 6000,
};

const quoteApproved = {
  serviceOrderId,
  quoteId,
  approvedAt: '2026-10-25T10:00:00.000Z',
};

const paymentConfirmed = {
  serviceOrderId,
  paymentId,
  amountCents: 26000,
  paidAt: '2026-10-25T10:05:00.000Z',
};

const beginExecution = async (scenario: SagaScenario): Promise<void> => {
  await scenario.start();
  await scenario.send('evt.workshop.diagnostic-completed', diagnosticCompleted);
  await scenario.send('evt.billing.quote-issued', quoteIssued);
  await scenario.send('evt.billing.quote-approved', quoteApproved);
  await scenario.send('evt.billing.payment-confirmed', paymentConfirmed);
};

describe('Saga orchestration BDD scenarios', () => {
  test('Given a new service order, when all participants succeed, then the order completes', async () => {
    const scenario = new SagaScenario();

    await scenario.start();
    await scenario.send(
      'evt.workshop.diagnostic-completed',
      diagnosticCompleted,
    );
    await scenario.send('evt.billing.quote-issued', quoteIssued);
    await scenario.send('evt.billing.quote-approved', quoteApproved);
    await scenario.send('evt.billing.payment-confirmed', paymentConfirmed);
    await scenario.send('evt.workshop.execution-completed', {
      serviceOrderId,
      completedItems: [
        {
          serviceId,
          finishedAt: '2026-10-25T11:00:00.000Z',
          executionTimeMs: 3600000,
        },
      ],
      completedAt: '2026-10-25T11:00:00.000Z',
    });

    expect(scenario.order.status).toBe(ServiceOrderStatus.COMPLETED);
    expect(scenario.saga?.status).toBe(SagaStatus.COMPLETED);
    expect(scenario.commands.map(({ eventType }) => eventType)).toEqual([
      'cmd.workshop.start-diagnostic',
      'cmd.billing.issue-quote',
      'cmd.billing.charge',
      'cmd.workshop.start-execution',
    ]);
  });

  test('Given payment was captured, when execution fails, then the workshop is aborted before billing refunds it', async () => {
    const scenario = new SagaScenario();
    await beginExecution(scenario);

    await scenario.send('evt.workshop.execution-failed', {
      serviceOrderId,
      reason: 'PART_UNAVAILABLE',
      detail: 'The required part is unavailable',
    });
    await scenario.send('evt.workshop.execution-aborted', { serviceOrderId });

    expect(
      scenario.commands.slice(-2).map(({ eventType }) => eventType),
    ).toEqual(['cmd.workshop.abort', 'cmd.billing.refund']);
    expect(scenario.commands.at(-1)?.data).toMatchObject({
      paymentId,
      amountCents: 26000,
    });

    await scenario.send('evt.billing.payment-refunded', {
      serviceOrderId,
      paymentId,
    });

    expect(scenario.order.status).toBe(ServiceOrderStatus.CANCELED);
    expect(scenario.saga?.status).toBe(SagaStatus.FAILED);
  });

  test('Given the customer rejects the quote, when Billing reports it, then the order returns to received without compensation', async () => {
    const scenario = new SagaScenario();
    await scenario.start();
    await scenario.send(
      'evt.workshop.diagnostic-completed',
      diagnosticCompleted,
    );
    await scenario.send('evt.billing.quote-rejected', {
      serviceOrderId,
      quoteId,
      reason: 'CUSTOMER_REQUEST',
      detail: 'The customer declined the proposed service',
      rejectedBy: '12345678901',
    });

    expect(scenario.order.status).toBe(ServiceOrderStatus.RECEIVED);
    expect(scenario.saga?.status).toBe(SagaStatus.COMPLETED);
    expect(scenario.commands.map(({ eventType }) => eventType)).toEqual([
      'cmd.workshop.start-diagnostic',
      'cmd.billing.issue-quote',
    ]);
  });

  test('Given an execution step has expired, when the timeout worker runs, then it starts compensation', async () => {
    const scenario = new SagaScenario();
    await beginExecution(scenario);
    scenario.expireCurrentStep();
    const worker = new SagaTimeoutWorker(
      scenario.sagaRepository,
      scenario.orchestrator,
    );

    const expiredCount = await worker.runOnce(new Date());

    expect(expiredCount).toBe(1);
    expect(scenario.commands.at(-1)?.eventType).toBe('cmd.workshop.abort');
    expect(scenario.saga?.status).toBe(SagaStatus.COMPENSATING);
    expect(scenario.saga?.stepDeadlineAt).toBeUndefined();
  });
});
