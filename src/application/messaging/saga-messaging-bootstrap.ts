import logger from '@lucas-pmelo/logger';
import { createSagaEventHandlers } from '@/application/saga/saga-event-handlers';
import { SagaOrchestrator } from '@/application/saga/saga-orchestrator';
import { OutboxCommandPublisher } from './outbox-command-publisher';
import { OutboxWorker } from './outbox-worker';
import { createPostgresIdempotencyGuard } from '@/infrastructure/messaging/postgres-idempotency-guard';
import { startConsumer } from '@/infrastructure/messaging/consumer';
import { db } from '@/infrastructure/configs/database';
import { OutboxRepository } from '@/infrastructure/repositories/outbox/outbox-repository';
import { ProcessedEventRepository } from '@/infrastructure/repositories/saga/processed-event-repository';
import { SagaInstanceRepository } from '@/infrastructure/repositories/saga/saga-instance-repository';
import { ServiceOrderRepository } from '@/infrastructure/repositories/service-order/service-order-repository';

export const startSagaMessaging = async (): Promise<() => void> => {
  const sagaRepository = new SagaInstanceRepository(db);
  const serviceOrderRepository = new ServiceOrderRepository(db);
  const outboxRepository = new OutboxRepository(db);
  const publisher = new OutboxCommandPublisher(outboxRepository);
  const orchestrator = new SagaOrchestrator(
    sagaRepository,
    serviceOrderRepository,
    (command) => publisher.publish(command),
  );
  const processedEvents = new ProcessedEventRepository(db);
  const timeout = new OutboxWorker(outboxRepository).start(
    Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 1000),
  );

  await startConsumer({
    handlers: createSagaEventHandlers(orchestrator),
    isFirstDelivery: createPostgresIdempotencyGuard(
      processedEvents,
      'bunzina-os',
    ),
    bindings: ['evt.billing.*', 'evt.workshop.*'],
  });

  logger.info({ message: 'Saga messaging started' });

  return () => clearInterval(timeout);
};
