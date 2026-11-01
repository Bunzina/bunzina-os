import { describe, expect, test } from 'bun:test';
import type { Envelope } from '@/infrastructure/messaging/envelope';
import type { SagaOrchestrator } from './saga-orchestrator';
import { createSagaEventHandlers } from './saga-event-handlers';

describe('saga event handlers', () => {
  test('should expose every happy-path event handler', async () => {
    const received: Envelope[] = [];
    const orchestrator = {
      handle: async (envelope: Envelope) => {
        received.push(envelope);
      },
    };
    const handlers = createSagaEventHandlers(
      orchestrator as unknown as SagaOrchestrator,
    );
    const envelope = {
      eventType: 'evt.billing.quote-issued',
    } as Envelope;

    await handlers['evt.billing.quote-issued'](envelope);

    expect(handlers).toEqual({
      'evt.workshop.diagnostic-completed': expect.any(Function),
      'evt.billing.quote-issued': expect.any(Function),
      'evt.billing.quote-approved': expect.any(Function),
      'evt.billing.payment-confirmed': expect.any(Function),
      'evt.workshop.execution-completed': expect.any(Function),
    });
    expect(received).toEqual([envelope]);
  });
});
