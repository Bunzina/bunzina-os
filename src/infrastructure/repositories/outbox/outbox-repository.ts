import type { SQL } from 'bun';
import type {
  OutboxMessage,
  OutboxRepository as OutboxRepositoryPort,
} from '@/domain/messaging/outbox-repository';
import type { Envelope } from '@/infrastructure/messaging/envelope';

type OutboxDbRecord = {
  id: string;
  event_type: string;
  payload: Envelope;
  attempts: number;
};

export class OutboxRepository implements OutboxRepositoryPort {
  constructor(private readonly client: SQL) {}

  async enqueue(message: OutboxMessage): Promise<void> {
    await this.client`
      INSERT INTO bunzina.outbox_messages (
        id,
        aggregate_type,
        aggregate_id,
        event_type,
        payload,
        headers
      ) VALUES (
        ${message.id},
        'service_order',
        ${message.payload.correlationId},
        ${message.eventType},
        ${JSON.stringify(message.payload)},
        ${JSON.stringify({ traceparent: message.payload.traceparent })}
      )
    `;
  }

  async findPending(limit: number): Promise<OutboxMessage[]> {
    const records = await this.client<OutboxDbRecord[]>`
      SELECT id, event_type, payload, attempts
      FROM bunzina.outbox_messages
      WHERE published_at IS NULL
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;

    return records.map((record) => ({
      id: record.id,
      eventType: record.event_type,
      payload:
        typeof record.payload === 'string'
          ? (JSON.parse(record.payload) as Envelope)
          : record.payload,
      attempts: record.attempts,
    }));
  }

  async markPublished(id: string): Promise<void> {
    await this.client`
      UPDATE bunzina.outbox_messages
      SET published_at = NOW(), last_error = NULL
      WHERE id = ${id}
    `;
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.client`
      UPDATE bunzina.outbox_messages
      SET attempts = attempts + 1, last_error = ${error}
      WHERE id = ${id}
    `;
  }
}
