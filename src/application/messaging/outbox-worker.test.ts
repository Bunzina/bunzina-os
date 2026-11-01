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
});
