import { describe, expect, test } from 'bun:test';
import { SagaInstance } from './saga-instance';
import { SagaStatus } from '../types/saga-status';
import { SagaStep } from '../types/saga-step';

describe('saga instance', () => {
  test('should start running and keep completed steps unique', () => {
    const saga = new SagaInstance({
      serviceOrderId: 'order-id',
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.DIAGNOSTIC,
    });

    saga.completeStep(SagaStep.DIAGNOSTIC, SagaStep.QUOTE);
    saga.completeStep(SagaStep.DIAGNOSTIC, SagaStep.PAYMENT);

    expect(saga).toEqual({
      serviceOrderId: 'order-id',
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.PAYMENT,
      completedSteps: [SagaStep.DIAGNOSTIC],
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    } as unknown as SagaInstance);
  });

  test('should move through compensation and terminal states', () => {
    const saga = new SagaInstance({
      serviceOrderId: 'order-id',
      status: SagaStatus.RUNNING,
      currentStep: SagaStep.EXECUTION,
    });

    saga.startCompensation('PART_UNAVAILABLE');
    expect(saga.status).toBe(SagaStatus.COMPENSATING);

    saga.fail('REFUND_FAILED');
    expect(saga).toEqual({
      serviceOrderId: 'order-id',
      status: SagaStatus.FAILED,
      currentStep: SagaStep.EXECUTION,
      completedSteps: [],
      lastError: 'REFUND_FAILED',
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    } as unknown as SagaInstance);

    saga.complete();
    expect(saga.status).toBe(SagaStatus.COMPLETED);
  });
});
