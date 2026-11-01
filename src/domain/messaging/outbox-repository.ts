import type { Envelope } from '@/infrastructure/messaging/envelope';

export interface OutboxMessage {
  id: string;
  eventType: string;
  payload: Envelope;
  attempts: number;
}

export interface OutboxRepository {
  enqueue(message: OutboxMessage): Promise<void>;
  findPending(limit: number): Promise<OutboxMessage[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}
