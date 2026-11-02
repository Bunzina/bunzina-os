import { describe, expect, spyOn, test } from 'bun:test';
import logger from '@lucas-pmelo/logger';
import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import { SagaStatus } from '@/domain/saga/types/saga-status';
import { SagaStep } from '@/domain/saga/types/saga-step';
import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import type { SagaOrchestrator } from './saga-orchestrator';
import { SagaTimeoutWorker } from './saga-timeout-worker';

describe('saga timeout worker', () => {
  test('should poll expired sagas from its interval callback', () => {
    const originalSetInterval = globalThis.setInterval;
    let poll: (() => void) | undefined;
    let repositoryCalls = 0;
    const timer = originalSetInterval(() => {}, 60_000);

    globalThis.setInterval = ((callback: Parameters<typeof setInterval>[0]) => {
      poll = callback as () => void;
      return timer;
    }) as typeof setInterval;

    const repository = {
      findExpired: async () => {
        repositoryCalls += 1;
        return [];
      },
    } as unknown as SagaInstanceRepository;
    const worker = new SagaTimeoutWorker(repository, {} as SagaOrchestrator);

    try {
      expect(worker.start(60_000)).toBe(timer);
      poll?.();
      expect(repositoryCalls).toBe(1);
    } finally {
      globalThis.setInterval = originalSetInterval;
      clearInterval(timer);
    }
  });

  test('should compensate every expired saga once', async () => {
    const saga = new SagaInstance({
      serviceOrderId: '11111111-1111-4111-8111-111111111111',
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.PAYMENT,
    });
    const handled: SagaInstance[] = [];
    const repository = {
      findExpired: async () => [saga],
    } as unknown as SagaInstanceRepository;
    const orchestrator = {
      handleTimeout: async (value: SagaInstance) => {
        handled.push(value);
      },
    } as unknown as SagaOrchestrator;

    const count = await new SagaTimeoutWorker(repository, orchestrator).runOnce(
      new Date('2026-10-25T12:00:00.000Z'),
    );

    expect(count).toBe(1);
    expect(handled).toEqual([saga]);
  });

  test('should continue handling expired sagas when one handler fails', async () => {
    const expiredSagas = [
      new SagaInstance({
        serviceOrderId: '11111111-1111-4111-8111-111111111111',
        status: SagaStatus.RUNNING,
        currentStep: SagaStep.PAYMENT,
      }),
      new SagaInstance({
        serviceOrderId: '22222222-2222-4222-8222-222222222222',
        status: SagaStatus.RUNNING,
        currentStep: SagaStep.EXECUTION,
      }),
    ];
    const handled: SagaInstance[] = [];
    const repository = {
      findExpired: async () => expiredSagas,
    } as unknown as SagaInstanceRepository;
    const worker = new SagaTimeoutWorker(
      repository,
      {} as SagaOrchestrator,
      async (saga) => {
        handled.push(saga);
        if (saga === expiredSagas[0]) throw new Error('compensation failed');
      },
    );

    const count = await worker.runOnce(new Date('2026-10-25T12:00:00.000Z'));

    expect(count).toBe(2);
    expect(handled).toEqual(expiredSagas);
  });

  test('should log polling errors from the interval callback', async () => {
    const originalSetInterval = globalThis.setInterval;
    let poll: (() => void) | undefined;
    const timer = originalSetInterval(() => {}, 60_000);
    const errorSpy = spyOn(logger, 'error');

    globalThis.setInterval = ((callback: Parameters<typeof setInterval>[0]) => {
      poll = callback as () => void;
      return timer;
    }) as typeof setInterval;

    const repository = {
      findExpired: async () => {
        throw new Error('database unavailable');
      },
    } as unknown as SagaInstanceRepository;
    const worker = new SagaTimeoutWorker(repository, {} as SagaOrchestrator);

    try {
      worker.start(60_000);
      poll?.();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(errorSpy).toHaveBeenCalledWith({
        message: 'Failed to poll expired sagas',
        error: 'database unavailable',
      });
    } finally {
      globalThis.setInterval = originalSetInterval;
      clearInterval(timer);
      errorSpy.mockRestore();
    }
  });
});
