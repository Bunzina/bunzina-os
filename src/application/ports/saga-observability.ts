import type { SagaInstance } from '@/domain/saga/entities/saga-instance';
import type { SagaStep } from '@/domain/saga/types/saga-step';

export type SagaOutcome = 'completed' | 'rejected' | 'compensated';

export interface SagaObservability {
  recordState(saga: SagaInstance): void;
  recordCompensation(reason: string): void;
  recordTimeout(step: SagaStep): void;
  recordOutcome(saga: SagaInstance, outcome: SagaOutcome): void;
}

export const noOpSagaObservability: SagaObservability = {
  recordState: () => undefined,
  recordCompensation: () => undefined,
  recordTimeout: () => undefined,
  recordOutcome: () => undefined,
};
