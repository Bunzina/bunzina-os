import type { Envelope } from '@/infrastructure/messaging/envelope';
import type { OutboxRepository } from '@/domain/messaging/outbox-repository';

export class OutboxCommandPublisher {
  constructor(private readonly repository: OutboxRepository) {}

  async publish(command: Envelope): Promise<void> {
    await this.repository.enqueue({
      id: command.eventId,
      eventType: command.eventType,
      payload: command,
      attempts: 0,
    });
  }
}
