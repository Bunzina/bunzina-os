import { context, propagation, SpanKind, trace } from '@opentelemetry/api';
import type { Channel, ConsumeMessage } from 'amqplib';
import logger from '@lucas-pmelo/logger';
import type { MessageProcessor } from '@/application/ports/message-processor';
import {
  messageHandlingDurationSeconds,
  messagesDeadLetteredTotal,
  messagesConsumedTotal,
} from '../observability/metrics';
import { EXCHANGE, getChannel, QUEUE } from './connection';
import { type Envelope, parseEnvelope } from './envelope';

const tracer = trace.getTracer('messaging');

const metricEventType = (eventType: string, eventTypes: readonly string[]) =>
  eventTypes.includes(eventType) ? eventType : 'unhandled';

type StartInput = {
  eventTypes: readonly string[];
  processor: MessageProcessor<Envelope>;
  bindings: string[];
  channel?: Channel;
};

export const startConsumer = async ({
  eventTypes,
  processor,
  bindings,
  channel: channelOverride,
}: StartInput): Promise<void> => {
  const channel = channelOverride ?? (await getChannel());

  for (const binding of bindings) {
    await channel.bindQueue(QUEUE, EXCHANGE, binding);
  }

  await channel.consume(QUEUE, async (message) => {
    if (!message) {
      return;
    }

    const parentContext = propagation.extract(
      context.active(),
      message.properties.headers ?? {},
    );

    await context.with(parentContext, () => handle(message));
  });

  async function handle(message: ConsumeMessage): Promise<void> {
    let eventType = String(message.properties.type ?? 'unknown');

    await tracer.startActiveSpan(
      `consume ${eventType}`,
      { kind: SpanKind.CONSUMER },
      async (span) => {
        const stopTimer = messageHandlingDurationSeconds.startTimer({
          event_type: metricEventType(eventType, eventTypes),
        });
        let envelope: Envelope | undefined;

        try {
          envelope = parseEnvelope(JSON.parse(message.content.toString()));
          eventType = envelope.eventType;

          if (!eventTypes.includes(envelope.eventType)) {
            messagesConsumedTotal.inc({
              event_type: metricEventType(eventType, eventTypes),
              result: 'unhandled',
            });
            messagesDeadLetteredTotal.inc({
              event_type: metricEventType(eventType, eventTypes),
            });
            channel.nack(message, false, false);
            return;
          }

          const firstDelivery = await processor.process(envelope);

          if (!firstDelivery) {
            messagesConsumedTotal.inc({
              event_type: metricEventType(eventType, eventTypes),
              result: 'duplicate',
            });
            logger.info({
              message: 'duplicate message ignored',
              eventType,
              serviceOrderId: envelope.correlationId,
              eventId: envelope.eventId,
              causationId: envelope.causationId,
            });
            channel.ack(message);
            return;
          }

          messagesConsumedTotal.inc({
            event_type: metricEventType(eventType, eventTypes),
            result: 'success',
          });
          logger.info({
            message: 'message processed',
            eventType,
            serviceOrderId: envelope.correlationId,
            eventId: envelope.eventId,
            causationId: envelope.causationId,
          });
          channel.ack(message);
        } catch (error) {
          logger.error({
            message: 'failed to handle message',
            eventType,
            ...(envelope
              ? {
                  serviceOrderId: envelope.correlationId,
                  eventId: envelope.eventId,
                  causationId: envelope.causationId,
                }
              : {}),
            error: error instanceof Error ? error.message : String(error),
          });

          messagesConsumedTotal.inc({
            event_type: metricEventType(eventType, eventTypes),
            result: 'failure',
          });
          messagesDeadLetteredTotal.inc({
            event_type: metricEventType(eventType, eventTypes),
          });
          channel.nack(message, false, false);
        } finally {
          stopTimer();
          span.end();
        }
      },
    );
  }
};
