import { describe, expect, test } from 'bun:test';
import type { Envelope } from '@/infrastructure/messaging/envelope';
import type { SagaOrchestrator } from './saga-orchestrator';
import {
  createSagaEventHandlers,
  SAGA_EVENT_TYPES,
} from './saga-event-handlers';

describe('saga event handlers', () => {
  test('routes every saga event, including failure and compensation events', async () => {
    const received: Envelope[] = [];
    const orchestrator = {
      handle: async (envelope: Envelope) => {
        received.push(envelope);
      },
    };
    const handlers = createSagaEventHandlers(
      orchestrator as unknown as SagaOrchestrator,
    );
    const envelope = { eventType: 'evt.billing.payment-refunded' } as Envelope;

    await handlers['evt.billing.payment-refunded'](envelope);

    expect(Object.keys(handlers).sort()).toEqual([...SAGA_EVENT_TYPES].sort());
    expect(received).toEqual([envelope]);
  });
});
