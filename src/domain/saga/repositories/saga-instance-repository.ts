import type { SagaInstance } from '../entities/saga-instance';

export interface SagaInstanceRepository {
  findByServiceOrderId(serviceOrderId: string): Promise<SagaInstance | null>;
  create(saga: SagaInstance): Promise<SagaInstance>;
  update(saga: SagaInstance): Promise<SagaInstance>;
}
