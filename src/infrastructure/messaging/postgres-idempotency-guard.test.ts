import { describe, expect, test } from 'bun:test';
import { createPostgresIdempotencyGuard } from './postgres-idempotency-guard';

describe('postgres idempotency guard', () => {
  test('should delegate event and consumer to the repository', async () => {
    const calls: string[][] = [];
    const guard = createPostgresIdempotencyGuard(
      {
        tryMarkProcessed: async (eventId, consumer) => {
          calls.push([eventId, consumer]);
          return true;
        },
      },
      'bunzina-os',
    );

    await expect(guard('event-id')).resolves.toBe(true);
    expect(calls).toEqual([['event-id', 'bunzina-os']]);
  });
});
