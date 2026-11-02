import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EXCHANGE, QUEUE } from './connection';
import { startConsumer } from './consumer';
import type { MessageProcessor } from '@/application/ports/message-processor';
import { buildEnvelope } from './envelope';

const ack = mock(() => {});
const nack = mock(() => {});
const bindQueue = mock(async () => ({}) as never);

let consumeCallback: ((message: unknown) => Promise<void>) | null = null;

const channel = {
  ack,
  nack,
  bindQueue,
  consume: mock(async (_queue: string, callback: never) => {
    consumeCallback = callback as unknown as typeof consumeCallback extends null
      ? never
      : (message: unknown) => Promise<void>;
    return { consumerTag: 'tag' };
  }),
};

const messageFor = (eventType: string) => {
  const envelope = buildEnvelope({
    eventType,
    correlationId: crypto.randomUUID(),
    data: {},
  });

  return {
    envelope,
    message: {
      content: Buffer.from(JSON.stringify(envelope)),
      properties: { type: eventType, headers: {} },
    },
  };
};

const start = async (overrides: {
  eventTypes?: string[];
  processor?: MessageProcessor<ReturnType<typeof buildEnvelope>>;
}) => {
  await startConsumer({
    eventTypes: overrides.eventTypes ?? ['cmd.billing.charge'],
    processor: overrides.processor ?? {
      process: async () => true,
    },
    bindings: ['cmd.billing.*'],
    channel: channel as never,
  });
};

beforeEach(() => {
  ack.mockClear();
  nack.mockClear();
  bindQueue.mockClear();
  consumeCallback = null;
});

describe('startConsumer', () => {
  it('binds the queue to every requested routing pattern', async () => {
    await start({});

    expect(bindQueue).toHaveBeenCalledWith(QUEUE, EXCHANGE, 'cmd.billing.*');
  });

  it('ignores an empty delivery', async () => {
    await start({});
    await consumeCallback?.(null);

    expect(ack).not.toHaveBeenCalled();
    expect(nack).not.toHaveBeenCalled();
  });

  it('runs the handler and acks a first delivery', async () => {
    const processor = mock(async () => true);
    await start({ processor: { process: processor } });

    await consumeCallback?.(messageFor('cmd.billing.charge').message);

    expect(processor).toHaveBeenCalled();
    expect(ack).toHaveBeenCalled();
  });

  it('acks without running orchestration when the event was already processed', async () => {
    const processor = mock(async () => false);
    await start({
      processor: { process: processor },
    });

    await consumeCallback?.(messageFor('cmd.billing.charge').message);

    expect(processor).toHaveBeenCalled();
    expect(ack).toHaveBeenCalled();
  });

  it('dead letters a message nobody handles', async () => {
    const processor = mock(async () => true);
    await start({
      eventTypes: ['cmd.billing.charge'],
      processor: { process: processor },
    });

    await consumeCallback?.(messageFor('cmd.billing.refund').message);

    expect(nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(processor).not.toHaveBeenCalled();
  });

  it('dead letters a message whose processor threw', async () => {
    await start({
      processor: {
        process: async () => {
          throw new Error('boom');
        },
      },
    });

    await consumeCallback?.(messageFor('cmd.billing.charge').message);

    expect(nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('allows a DLQ-redriven event after its failed transaction rolls back', async () => {
    let attempts = 0;
    const process = mock(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary failure');
      return true;
    });

    await start({
      processor: { process },
    });
    const delivery = messageFor('cmd.billing.charge').message;

    await consumeCallback?.(delivery);
    await consumeCallback?.(delivery);

    expect(process).toHaveBeenCalledTimes(2);
    expect(nack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('does not process events outside the registered event types', async () => {
    const process = mock(async () => true);
    await start({
      eventTypes: ['evt.billing.payment-confirmed'],
      processor: { process },
    });

    await consumeCallback?.(messageFor('cmd.billing.refund').message);

    expect(process).not.toHaveBeenCalled();
    expect(nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });

  it('dead letters a message that does not match the envelope', async () => {
    await start({});

    await consumeCallback?.({
      content: Buffer.from(JSON.stringify({ eventType: 'nope' })),
      properties: { type: 'nope', headers: {} },
    });

    expect(nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });
});
