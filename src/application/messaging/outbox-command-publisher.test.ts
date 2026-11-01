import { describe, expect, test } from 'bun:test';
import { OutboxCommandPublisher } from './outbox-command-publisher';
import type { Envelope } from '@/infrastructure/messaging/envelope';
import type {
  OutboxMessage,
  OutboxRepository,
} from '@/domain/messaging/outbox-repository';

describe('outbox command publisher', () => {
  test('should enqueue the complete command envelope', async () => {
    const messages: unknown[] = [];
    const publisher = new OutboxCommandPublisher({
      enqueue: async (message: OutboxMessage) => {
        messages.push(message);
      },
    } as unknown as OutboxRepository);
    const command = {
      eventId: '11111111-1111-4111-8111-111111111111',
      eventType: 'cmd.billing.charge',
      eventVersion: 1,
      occurredAt: '2026-10-31T12:00:00.000Z',
      correlationId: '22222222-2222-4222-8222-222222222222',
      producer: 'bunzina-os',
      data: { serviceOrderId: '22222222-2222-4222-8222-222222222222' },
    } as Envelope;

    await publisher.publish(command);

    expect(messages).toEqual([
      {
        id: command.eventId,
        eventType: command.eventType,
        payload: command,
        attempts: 0,
      },
    ]);
  });
});
