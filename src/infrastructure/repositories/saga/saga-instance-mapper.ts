import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import { SagaStatus } from '@/domain/saga/types/saga-status';
import { SagaStep } from '@/domain/saga/types/saga-step';

export interface SagaInstanceDbSchema {
  service_order_id: string;
  status: SagaStatus;
  current_step: SagaStep;
  completed_steps: SagaStep[] | string[] | string;
  step_deadline_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export const SagaInstanceMapper = {
  toDatabase(saga: SagaInstance): SagaInstanceDbSchema {
    return {
      service_order_id: saga.serviceOrderId,
      status: saga.status,
      current_step: saga.currentStep,
      completed_steps: saga.completedSteps,
      step_deadline_at: saga.stepDeadlineAt ?? null,
      last_error: saga.lastError ?? null,
      created_at: saga.createdAt,
      updated_at: saga.updatedAt,
    };
  },

  toDomain(record: SagaInstanceDbSchema): SagaInstance {
    const completedSteps = Array.isArray(record.completed_steps)
      ? record.completed_steps
      : JSON.parse(record.completed_steps);

    return new SagaInstance({
      serviceOrderId: record.service_order_id,
      status: record.status,
      currentStep: record.current_step,
      completedSteps: completedSteps as SagaStep[],
      stepDeadlineAt: record.step_deadline_at ?? undefined,
      lastError: record.last_error ?? undefined,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  },
};
