import type { Envelope } from '@/infrastructure/messaging/envelope';
import type { SagaOrchestrator } from './saga-orchestrator';

export const createSagaEventHandlers = (orchestrator: SagaOrchestrator) => {
  const handle = (envelope: Envelope): Promise<void> =>
    orchestrator.handle(envelope);

  return {
    'evt.workshop.diagnostic-completed': handle,
    'evt.billing.quote-issued': handle,
    'evt.billing.quote-approved': handle,
    'evt.billing.payment-confirmed': handle,
    'evt.workshop.execution-completed': handle,
  };
};
