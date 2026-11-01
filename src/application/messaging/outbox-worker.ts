import logger from '@lucas-pmelo/logger';
import { publish } from '@/infrastructure/messaging/publisher';
import type { OutboxRepository } from '@/domain/messaging/outbox-repository';

export class OutboxWorker {
  constructor(
    private readonly repository: OutboxRepository,
    private readonly batchSize = 20,
  ) {}

  async runOnce(): Promise<number> {
    const messages = await this.repository.findPending(this.batchSize);

    for (const message of messages) {
      try {
        await publish(message.payload);
        await this.repository.markPublished(message.id);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.repository.markFailed(message.id, detail);
        logger.error({
          message: 'Failed to publish outbox message',
          data: { messageId: message.id, eventType: message.eventType, detail },
        });
      }
    }

    return messages.length;
  }

  start(intervalMs = 1000): ReturnType<typeof setInterval> {
    return setInterval(() => {
      void this.runOnce();
    }, intervalMs);
  }
}
