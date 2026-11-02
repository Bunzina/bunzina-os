import type { Envelope } from '@/infrastructure/messaging/envelope';
import type { SagaOrchestrator } from './saga-orchestrator';

export const SAGA_EVENT_TYPES = [
  'evt.workshop.diagnostic-completed',
  'evt.billing.quote-issued',
  'evt.billing.quote-approved',
  'evt.billing.quote-rejected',
  'evt.billing.payment-confirmed',
  'evt.workshop.execution-completed',
  'evt.workshop.diagnostic-failed',
  'evt.billing.payment-failed',
  'evt.workshop.execution-failed',
  'evt.billing.quote-canceled',
  'evt.workshop.execution-aborted',
  'evt.billing.payment-refunded',
] as const;

type SagaEventType = (typeof SAGA_EVENT_TYPES)[number];
type SagaEventHandler = (envelope: Envelope) => Promise<void>;

export const createSagaEventHandlers = (
  orchestrator: SagaOrchestrator,
): Record<SagaEventType, SagaEventHandler> => {
  const handle: SagaEventHandler = (envelope) => orchestrator.handle(envelope);

  return {
    'evt.workshop.diagnostic-completed': handle,
    'evt.billing.quote-issued': handle,
    'evt.billing.quote-approved': handle,
    'evt.billing.quote-rejected': handle,
    'evt.billing.payment-confirmed': handle,
    'evt.workshop.execution-completed': handle,
    'evt.workshop.diagnostic-failed': handle,
    'evt.billing.payment-failed': handle,
    'evt.workshop.execution-failed': handle,
    'evt.billing.quote-canceled': handle,
    'evt.workshop.execution-aborted': handle,
    'evt.billing.payment-refunded': handle,
  } satisfies Record<SagaEventType, SagaEventHandler>;
};
