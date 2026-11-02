import logger from '@lucas-pmelo/logger';
import { publish } from '@/infrastructure/messaging/publisher';
import { outboxPublishFailuresTotal } from '@/infrastructure/observability/metrics';
import type { OutboxRepository } from '@/domain/messaging/outbox-repository';

export type OutboxPublisher = (
  payload: Parameters<typeof publish>[0],
) => Promise<void>;

export class OutboxWorker {
  private running = false;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly batchSize = 20,
    private readonly publishMessage: OutboxPublisher = publish,
  ) {}

  async runOnce(): Promise<number> {
    if (this.running) return 0;

    this.running = true;
    try {
      const messages = await this.repository.findPending(this.batchSize);

      for (const message of messages) {
        try {
          await this.publishMessage(message.payload);
          await this.repository.markPublished(message.id);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          await this.repository.markFailed(message.id, detail);
          outboxPublishFailuresTotal.inc({ event_type: message.eventType });
          logger.error({
            message: 'Failed to publish outbox message',
            messageId: message.id,
            eventType: message.eventType,
            serviceOrderId: message.payload.correlationId,
            eventId: message.payload.eventId,
            causationId: message.payload.causationId,
            detail,
          });
        }
      }

      return messages.length;
    } finally {
      this.running = false;
    }
  }

  start(intervalMs = 1000): ReturnType<typeof setInterval> {
    return setInterval(() => {
      void this.runOnce().catch((error) => {
        logger.error({
          message: 'Failed to poll outbox messages',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, intervalMs);
  }
}
