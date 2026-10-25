import { describe, expect, it, mock } from 'bun:test';
import { propagation } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import type { Channel } from 'amqplib';
import { buildEnvelope } from './envelope';
import { publish } from './publisher';

propagation.setGlobalPropagator(new W3CTraceContextPropagator());

const fakeChannel = () => {
  const publishMock = mock(
    (
      _exchange: string,
      _routingKey: string,
      _body: Buffer,
      _options: Record<string, unknown>,
    ) => true,
  );
  return {
    channel: { publish: publishMock } as unknown as Channel,
    publishMock,
  };
};

describe('publish', () => {
  it('uses the event type as the routing key', async () => {
    const { channel, publishMock } = fakeChannel();

    const envelope = buildEnvelope({
      eventType: 'cmd.billing.issue-quote',
      correlationId: crypto.randomUUID(),
      data: {},
    });

    await publish(envelope, channel);

    const [exchange, routingKey] = publishMock.mock.calls[0] ?? [];
    expect(exchange).toBe('bunzina.events');
    expect(routingKey).toBe('cmd.billing.issue-quote');
  });

  it('publishes a persistent message carrying the correlation id', async () => {
    const { channel, publishMock } = fakeChannel();
    const correlationId = crypto.randomUUID();

    await publish(
      buildEnvelope({
        eventType: 'evt.os.order-created',
        correlationId,
        data: {},
      }),
      channel,
    );

    const call = publishMock.mock.calls[0];
    expect(call).toBeDefined();
    const options = call![3];
    expect(options.persistent).toBe(true);
    expect(options.correlationId).toBe(correlationId);
  });

  it('carries the envelope through as JSON', async () => {
    const { channel, publishMock } = fakeChannel();

    const envelope = buildEnvelope({
      eventType: 'evt.billing.quote-issued',
      correlationId: crypto.randomUUID(),
      data: { quoteId: 'abc' },
    });

    await publish(envelope, channel);

    const call = publishMock.mock.calls[0];
    expect(call).toBeDefined();
    const body = call![2];
    const decoded = JSON.parse(body.toString());

    expect(decoded.eventId).toBe(envelope.eventId);
    expect(decoded.data.quoteId).toBe('abc');
  });
});
