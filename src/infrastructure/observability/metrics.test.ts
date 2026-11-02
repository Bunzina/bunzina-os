import { describe, expect, it } from 'bun:test';
import {
  createHttpMetrics,
  getMetrics,
  normalizeRoute,
  sagaObservability,
} from './metrics';
import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import { SagaStatus } from '@/domain/saga/types/saga-status';
import { SagaStep } from '@/domain/saga/types/saga-step';

describe('normalizeRoute', () => {
  it('keeps a static path as it is', () => {
    expect(normalizeRoute('/health')).toBe('/health');
  });

  it('falls back to the root for an empty path', () => {
    expect(normalizeRoute('')).toBe('/');
  });
});

describe('createHttpMetrics', () => {
  it('records a finished request under its method and status', async () => {
    const metrics = createHttpMetrics();
    const request = new Request('http://localhost/health');

    metrics.start(request);
    metrics.finish(request, 200);

    const exposed = await getMetrics();

    expect(exposed).toContain('http_requests_total');
    expect(exposed).toContain('status_code="200"');
  });

  it('defaults to 200 when the status is not a usable number', async () => {
    const metrics = createHttpMetrics();
    const request = new Request('http://localhost/ready');

    metrics.start(request);
    metrics.finish(request, undefined);

    expect(await getMetrics()).toContain('route="/ready"');
  });

  it('records a request that was never started', async () => {
    const metrics = createHttpMetrics();
    const request = new Request('http://localhost/metrics-less');

    metrics.finish(request, 500);

    expect(await getMetrics()).toContain('status_code="500"');
  });
});

describe('saga observability metrics', () => {
  it('records state, compensation, timeout and terminal duration metrics', async () => {
    const saga = new SagaInstance({
      serviceOrderId: crypto.randomUUID(),
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.DIAGNOSTIC,
    });

    sagaObservability.recordState(saga);
    sagaObservability.recordCompensation('TIMEOUT');
    sagaObservability.recordTimeout(SagaStep.EXECUTION);
    sagaObservability.recordOutcome(saga, 'compensated');

    const exposed = await getMetrics();

    expect(exposed).toContain('bunzina_os_saga_states_total');
    expect(exposed).toContain('bunzina_os_saga_compensations_total');
    expect(exposed).toContain('bunzina_os_saga_timeouts_total');
    expect(exposed).toContain('bunzina_os_saga_duration_seconds');
    expect(exposed).toContain('bunzina_os_saga_outcomes_total');
  });
});

describe('normalizeRoute com identificadores', () => {
  it('colapsa um uuid no caminho para :id', () => {
    expect(
      normalizeRoute('/service-orders/0193f2a1-4c7e-7000-8000-000000000001'),
    ).toBe('/service-orders/:id');
  });

  it('colapsa todos os uuids de um caminho aninhado', () => {
    const path =
      '/service-orders/0193f2a1-4c7e-7000-8000-000000000001' +
      '/items/0193f2a1-4c7e-7000-8000-000000000002';

    expect(normalizeRoute(path)).toBe('/service-orders/:id/items/:id');
  });
});
