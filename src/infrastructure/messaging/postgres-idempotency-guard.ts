import type { ProcessedEventRepository } from '@/domain/saga/repositories/processed-event-repository';
import type { IdempotencyGuard } from './consumer';

export const createPostgresIdempotencyGuard =
  (repository: ProcessedEventRepository, consumer: string): IdempotencyGuard =>
  (eventId: string): Promise<boolean> =>
    repository.tryMarkProcessed(eventId, consumer);
