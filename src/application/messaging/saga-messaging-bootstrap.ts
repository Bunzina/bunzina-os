import logger from '@lucas-pmelo/logger';
import { SAGA_EVENT_TYPES } from '@/application/saga/saga-event-handlers';
import { SagaOrchestrator } from '@/application/saga/saga-orchestrator';
import { SagaTimeoutWorker } from '@/application/saga/saga-timeout-worker';
import { OutboxCommandPublisher } from './outbox-command-publisher';
import { OutboxWorker } from './outbox-worker';
import { startConsumer } from '@/infrastructure/messaging/consumer';
import { db } from '@/infrastructure/configs/database';
import { OutboxRepository } from '@/infrastructure/repositories/outbox/outbox-repository';
import { SagaInstanceRepository } from '@/infrastructure/repositories/saga/saga-instance-repository';
import { ServiceOrderRepository } from '@/infrastructure/repositories/service-order/service-order-repository';
import { sagaObservability } from '@/infrastructure/observability/metrics';
import { PostgresSagaEventProcessor } from '@/infrastructure/messaging/postgres-saga-event-processor';

export const startSagaMessaging = async (): Promise<() => void> => {
  const sagaRepository = new SagaInstanceRepository(db);
  const serviceOrderRepository = new ServiceOrderRepository(db);
  const outboxRepository = new OutboxRepository(db);
  const publisher = new OutboxCommandPublisher(outboxRepository);
  const orchestrator = new SagaOrchestrator(
    sagaRepository,
    serviceOrderRepository,
    (command) => publisher.publish(command),
    { observability: sagaObservability },
  );
  const eventProcessor = new PostgresSagaEventProcessor(db);
  await startConsumer({
    eventTypes: SAGA_EVENT_TYPES,
    processor: eventProcessor,
    bindings: ['evt.billing.*', 'evt.workshop.*'],
  });

  const outboxTimer = new OutboxWorker(outboxRepository).start(
    Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000),
  );
  const sagaTimeoutTimer = new SagaTimeoutWorker(
    sagaRepository,
    orchestrator,
    (saga, now) =>
      eventProcessor
        .processTimeout(saga.serviceOrderId, now)
        .then(() => undefined),
  ).start(Number(process.env.SAGA_TIMEOUT_POLL_INTERVAL_MS ?? 1000));

  logger.info({ message: 'Saga messaging started' });

  return () => {
    clearInterval(outboxTimer);
    clearInterval(sagaTimeoutTimer);
  };
};
