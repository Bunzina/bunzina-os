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
  quote_id: string | null;
  payment_id: string | null;
  payment_amount_cents: number | null;
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
      quote_id: saga.quoteId ?? null,
      payment_id: saga.paymentId ?? null,
      payment_amount_cents: saga.paymentAmountCents ?? null,
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
      quoteId: record.quote_id ?? undefined,
      paymentId: record.payment_id ?? undefined,
      paymentAmountCents: record.payment_amount_cents ?? undefined,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  },
};
