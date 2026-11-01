import { describe, expect, test } from 'bun:test';
import { OutboxWorker } from './outbox-worker';
import type { OutboxRepository } from '@/domain/messaging/outbox-repository';

describe('outbox worker', () => {
  test('should return zero when there are no pending messages', async () => {
    const worker = new OutboxWorker({
      findPending: async () => [],
    } as unknown as OutboxRepository);

    await expect(worker.runOnce()).resolves.toBe(0);
  });

  test('should publish and mark pending messages', async () => {
    const marked: string[] = [];
    const worker = new OutboxWorker(
      {
        findPending: async () => [
          {
            id: 'message-id',
            eventType: 'cmd.billing.charge',
            payload: { eventType: 'cmd.billing.charge' } as never,
            attempts: 0,
          },
        ],
        markPublished: async (id: string) => {
          marked.push(id);
        },
      } as unknown as OutboxRepository,
      20,
      async () => undefined,
    );

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(marked).toEqual(['message-id']);
  });

  test('should record a failed publication and continue', async () => {
    const failures: Array<[string, string]> = [];
    const worker = new OutboxWorker(
      {
        findPending: async () => [
          {
            id: 'message-id',
            eventType: 'cmd.billing.charge',
            payload: { eventType: 'cmd.billing.charge' } as never,
            attempts: 0,
          },
        ],
        markFailed: async (id: string, error: string) => {
          failures.push([id, error]);
        },
      } as unknown as OutboxRepository,
      20,
      async () => {
        throw new Error('broker unavailable');
      },
    );

    await expect(worker.runOnce()).resolves.toBe(1);
    expect(failures).toEqual([['message-id', 'broker unavailable']]);
  });

  test('should start a polling timer', () => {
    const worker = new OutboxWorker({
      findPending: async () => [],
    } as unknown as OutboxRepository);

    const timer = worker.start(60_000);
    clearInterval(timer);

    expect(timer).toBeDefined();
  });
});
