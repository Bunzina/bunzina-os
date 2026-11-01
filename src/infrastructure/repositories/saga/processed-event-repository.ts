import type { SQL } from 'bun';
import type { ProcessedEventRepository as ProcessedEventRepositoryPort } from '@/domain/saga/repositories/processed-event-repository';

export class ProcessedEventRepository implements ProcessedEventRepositoryPort {
  constructor(private readonly client: SQL) {}

  async tryMarkProcessed(eventId: string, consumer: string): Promise<boolean> {
    const [record] = await this.client<{ event_id: string }[]>`
      INSERT INTO bunzina.processed_events (event_id, consumer)
      VALUES (${eventId}, ${consumer})
      ON CONFLICT (event_id, consumer) DO NOTHING
      RETURNING event_id
    `;

    return Boolean(record);
  }
}
