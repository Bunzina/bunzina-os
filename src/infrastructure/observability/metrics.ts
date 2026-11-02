import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import type { SagaObservability } from '@/application/ports/saga-observability';
import type { SagaInstance } from '@/domain/saga/entities/saga-instance';
import { failureReasons } from '@/infrastructure/messaging/envelope';

const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'bunzina_os_http_requests_total',
  help: 'Total number of HTTP requests handled by the service.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'bunzina_os_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

export const httpRequestsInFlight = new Gauge({
  name: 'bunzina_os_http_requests_in_flight',
  help: 'Number of HTTP requests currently being handled.',
  registers: [registry],
});

export const messagesPublishedTotal = new Counter({
  name: 'bunzina_os_messages_published_total',
  help: 'Total number of messages published to the broker.',
  labelNames: ['event_type'],
  registers: [registry],
});

export const messagesConsumedTotal = new Counter({
  name: 'bunzina_os_messages_consumed_total',
  help: 'Total number of messages consumed from the broker.',
  labelNames: ['event_type', 'result'],
  registers: [registry],
});

export const messagesDeadLetteredTotal = new Counter({
  name: 'bunzina_os_messages_dead_lettered_total',
  help: 'Total number of consumed messages sent to the dead-letter queue.',
  labelNames: ['event_type'],
  registers: [registry],
});

export const outboxPublishFailuresTotal = new Counter({
  name: 'bunzina_os_outbox_publish_failures_total',
  help: 'Total number of failed outbox publish attempts.',
  labelNames: ['event_type'],
  registers: [registry],
});

export const sagaStatesTotal = new Counter({
  name: 'bunzina_os_saga_states_total',
  help: 'Number of persisted saga states by status and step.',
  labelNames: ['status', 'step'],
  registers: [registry],
});

export const sagaCompensationsTotal = new Counter({
  name: 'bunzina_os_saga_compensations_total',
  help: 'Number of saga compensation attempts by reason.',
  labelNames: ['reason'],
  registers: [registry],
});

export const sagaTimeoutsTotal = new Counter({
  name: 'bunzina_os_saga_timeouts_total',
  help: 'Number of saga step timeouts by step.',
  labelNames: ['step'],
  registers: [registry],
});

export const sagaOutcomesTotal = new Counter({
  name: 'bunzina_os_saga_outcomes_total',
  help: 'Number of terminal saga outcomes.',
  labelNames: ['outcome'],
  registers: [registry],
});

export const sagaDurationSeconds = new Histogram({
  name: 'bunzina_os_saga_duration_seconds',
  help: 'Time from saga creation to its terminal outcome, in seconds.',
  labelNames: ['outcome'],
  buckets: [1, 5, 15, 30, 60, 300, 900, 3600, 86400],
  registers: [registry],
});

const getMetricReason = (reason: string): string =>
  failureReasons.includes(reason as (typeof failureReasons)[number])
    ? reason
    : 'UNKNOWN';

export const sagaObservability: SagaObservability = {
  recordState(saga: SagaInstance) {
    sagaStatesTotal.inc({ status: saga.status, step: saga.currentStep });
  },
  recordCompensation(reason) {
    sagaCompensationsTotal.inc({ reason: getMetricReason(reason) });
  },
  recordTimeout(step) {
    sagaTimeoutsTotal.inc({ step });
  },
  recordOutcome(saga, outcome) {
    sagaOutcomesTotal.inc({ outcome });
    sagaDurationSeconds.observe(
      { outcome },
      Math.max(0, (Date.now() - saga.createdAt.getTime()) / 1000),
    );
  },
};

export const messageHandlingDurationSeconds = new Histogram({
  name: 'bunzina_os_message_handling_duration_seconds',
  help: 'Time spent handling a consumed message, in seconds.',
  labelNames: ['event_type'],
  registers: [registry],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

const getStatusCode = (status: number | string | undefined): string => {
  const statusCode = Number(status);
  return Number.isInteger(statusCode) && statusCode > 0
    ? String(statusCode)
    : '200';
};

const dynamicRoutePatterns: Array<[RegExp, string]> = [];

const UUID_SEGMENT =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export const normalizeRoute = (pathname: string): string => {
  for (const [pattern, route] of dynamicRoutePatterns) {
    if (pattern.test(pathname)) {
      return route;
    }
  }

  return pathname.replace(UUID_SEGMENT, ':id') || '/';
};

const getRequestLabels = (
  request: Request,
  status: number | string | undefined,
) => {
  const url = new URL(request.url);

  return {
    method: request.method,
    route: normalizeRoute(url.pathname),
    status_code: getStatusCode(status),
  };
};

export const createHttpMetrics = () => {
  const requestStartTimes = new WeakMap<Request, number>();

  return {
    start(request: Request) {
      requestStartTimes.set(request, performance.now());
      httpRequestsInFlight.inc();
    },
    finish(request: Request, status: number | string | undefined) {
      const labels = getRequestLabels(request, status);
      const startedAt = requestStartTimes.get(request);
      const durationSeconds = startedAt
        ? (performance.now() - startedAt) / 1000
        : 0;

      httpRequestsTotal.inc(labels);
      httpRequestDurationSeconds.observe(labels, durationSeconds);
      httpRequestsInFlight.dec();
      requestStartTimes.delete(request);
    },
  };
};

export const metricsContentType = 'text/plain; version=0.0.4; charset=utf-8';

export const getMetrics = async (): Promise<string> => registry.metrics();
