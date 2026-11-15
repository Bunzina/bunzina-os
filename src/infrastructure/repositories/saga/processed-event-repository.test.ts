import { describe, expect, test } from 'bun:test';
import { makeMockSql } from '@/test/fixtures/mock-sql';
import { ProcessedEventRepository } from './processed-event-repository';

describe('processed event repository', () => {
  test('returns true when the event claim is inserted', async () => {
    const { client, queries } = makeMockSql([[{ event_id: 'event-1' }]]);

    await expect(
      new ProcessedEventRepository(client).tryMarkProcessed(
        'event-1',
        'bunzina-os',
      ),
    ).resolves.toBe(true);
    expect(queries[0]).toContain('ON CONFLICT (event_id, consumer) DO NOTHING');
  });

  test('returns false when the event was already claimed', async () => {
    const { client } = makeMockSql([[]]);

    await expect(
      new ProcessedEventRepository(client).tryMarkProcessed(
        'event-1',
        'bunzina-os',
      ),
    ).resolves.toBe(false);
  });
});
