import { describe, expect, it } from 'bun:test';
import { context, propagation, trace } from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { buildEnvelope, envelopeSchema, parseEnvelope } from './envelope';

new NodeTracerProvider().register({
  propagator: new W3CTraceContextPropagator(),
});
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

const validData = { serviceOrderId: crypto.randomUUID() };

describe('buildEnvelope', () => {
  it('produces an envelope that satisfies the shared schema', () => {
    const envelope = buildEnvelope({
      eventType: 'evt.billing.quote-issued',
      correlationId: crypto.randomUUID(),
      data: validData,
    });

    expect(() => envelopeSchema.parse(envelope)).not.toThrow();
    expect(envelope.eventVersion).toBe(1);
  });

  it('keeps the causation id when the message continues a chain', () => {
    const causationId = crypto.randomUUID();

    const envelope = buildEnvelope({
      eventType: 'cmd.billing.charge',
      correlationId: crypto.randomUUID(),
      data: validData,
      causationId,
    });

    expect(envelope.causationId).toBe(causationId);
  });

  it('omits the causation id on the first message of a chain', () => {
    const envelope = buildEnvelope({
      eventType: 'evt.os.order-created',
      correlationId: crypto.randomUUID(),
      data: validData,
    });

    expect(envelope.causationId).toBeUndefined();
  });

  it('copies the active W3C trace context into the envelope', () => {
    const activeContext = trace.setSpanContext(context.active(), {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: 1,
      isRemote: false,
    });

    const envelope = context.with(activeContext, () =>
      buildEnvelope({
        eventType: 'cmd.billing.issue-quote',
        correlationId: crypto.randomUUID(),
        data: validData,
      }),
    );

    expect(envelope.traceparent).toBe(
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    );
  });
});

describe('parseEnvelope', () => {
  it('rejects an event type outside the cmd/evt convention', () => {
    const envelope = {
      ...buildEnvelope({
        eventType: 'evt.billing.quote-issued',
        correlationId: crypto.randomUUID(),
        data: validData,
      }),
      eventType: 'QuoteIssued',
    };

    expect(() => parseEnvelope(envelope)).toThrow();
  });

  it('rejects a correlation id that is not a service order id', () => {
    const envelope = {
      ...buildEnvelope({
        eventType: 'evt.billing.quote-issued',
        correlationId: crypto.randomUUID(),
        data: validData,
      }),
      correlationId: 'not-a-uuid',
    };

    expect(() => parseEnvelope(envelope)).toThrow();
  });

  it('accepts a message that carries the traceparent', () => {
    const envelope = {
      ...buildEnvelope({
        eventType: 'evt.billing.quote-issued',
        correlationId: crypto.randomUUID(),
        data: validData,
      }),
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    };

    expect(parseEnvelope(envelope).traceparent).toBeDefined();
  });
});
