import { describe, expect, test } from 'bun:test';
import { buildEnvelope } from '@/infrastructure/messaging/envelope';
import { makeMockSql } from '@/test/fixtures/mock-sql';
import { OutboxRepository } from './outbox-repository';

describe('outbox repository', () => {
  const message = () => ({
    id: 'outbox-1',
    eventType: 'cmd.billing.issue-quote',
    payload: buildEnvelope({
      eventType: 'cmd.billing.issue-quote',
      correlationId: '11111111-1111-4111-8111-111111111111',
      data: { serviceOrderId: '11111111-1111-4111-8111-111111111111' },
    }),
    attempts: 0,
  });

  test('enqueues an outbox message', async () => {
    const { client, queries } = makeMockSql();

    await new OutboxRepository(client).enqueue(message());

    expect(queries[0]).toContain('INSERT INTO bunzina.outbox_messages');
  });

  test('maps pending records with JSON payloads', async () => {
    const pending = message();
    const { client } = makeMockSql([
      [
        {
          id: pending.id,
          event_type: pending.eventType,
          payload: JSON.stringify(pending.payload),
          attempts: 2,
        },
        {
          id: 'outbox-2',
          event_type: pending.eventType,
          payload: pending.payload,
          attempts: 1,
        },
      ],
    ]);

    const result = await new OutboxRepository(client).findPending(10);

    expect(result).toEqual([
      { ...pending, attempts: 2 },
      {
        id: 'outbox-2',
        eventType: pending.eventType,
        payload: pending.payload,
        attempts: 1,
      },
    ]);
  });

  test('returns an empty list when no messages are pending', async () => {
    const { client } = makeMockSql([[]]);

    await expect(new OutboxRepository(client).findPending(10)).resolves.toEqual(
      [],
    );
  });

  test('marks messages as published or failed', async () => {
    const { client, queries } = makeMockSql();
    const repository = new OutboxRepository(client);

    await repository.markPublished('outbox-1');
    await repository.markFailed('outbox-2', 'broker unavailable');

    expect(queries[0]).toContain('SET published_at = NOW()');
    expect(queries[1]).toContain('SET attempts = attempts + 1');
  });
});
