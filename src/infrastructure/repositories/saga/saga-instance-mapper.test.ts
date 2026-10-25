import { describe, expect, test } from 'bun:test';
import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import { SagaStatus } from '@/domain/saga/types/saga-status';
import { SagaStep } from '@/domain/saga/types/saga-step';
import { SagaInstanceMapper } from './saga-instance-mapper';

describe('saga instance mapper', () => {
  test('should map a saga to database and back', () => {
    const createdAt = new Date('2026-10-25T10:00:00.000Z');
    const updatedAt = new Date('2026-10-25T11:00:00.000Z');
    const deadline = new Date('2026-10-25T12:00:00.000Z');
    const saga = new SagaInstance({
      serviceOrderId: 'order-id',
      status: SagaStatus.COMPENSATING,
      currentStep: SagaStep.PAYMENT,
      completedSteps: [SagaStep.DIAGNOSTIC, SagaStep.QUOTE],
      stepDeadlineAt: deadline,
      lastError: 'TIMEOUT',
      createdAt,
      updatedAt,
    });

    const record = SagaInstanceMapper.toDatabase(saga);

    expect(record).toEqual({
      service_order_id: 'order-id',
      status: SagaStatus.COMPENSATING,
      current_step: SagaStep.PAYMENT,
      completed_steps: [SagaStep.DIAGNOSTIC, SagaStep.QUOTE],
      step_deadline_at: deadline,
      last_error: 'TIMEOUT',
      created_at: createdAt,
      updated_at: updatedAt,
    });
    expect(
      SagaInstanceMapper.toDomain({
        ...record,
        completed_steps: JSON.stringify(record.completed_steps),
      }),
    ).toEqual(saga);
  });
});
