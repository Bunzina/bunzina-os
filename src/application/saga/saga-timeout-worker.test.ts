import { describe, expect, test } from 'bun:test';
import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import { SagaStatus } from '@/domain/saga/types/saga-status';
import { SagaStep } from '@/domain/saga/types/saga-step';
import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import type { SagaOrchestrator } from './saga-orchestrator';
import { SagaTimeoutWorker } from './saga-timeout-worker';

describe('saga timeout worker', () => {
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
});
