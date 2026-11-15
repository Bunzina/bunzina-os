import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { ServiceOrderNotFoundError } from './find-by-id';
import { ServiceOrderMutationConflictError } from './mutation-errors';

export class DeleteServiceOrderUseCase {
  constructor(
    private readonly repository: ServiceOrderRepository,
    private readonly sagaRepository: SagaInstanceRepository,
  ) {}

  async execute(id: string): Promise<void> {
    const order = await this.repository.findById(id);
    if (!order) throw new ServiceOrderNotFoundError();

    const saga = await this.sagaRepository.findByServiceOrderId(id);
    if (saga || order.status !== ServiceOrderStatus.RECEIVED) {
      throw new ServiceOrderMutationConflictError(
        'Service order cannot be deleted after its saga has started',
      );
    }

    await this.repository.delete(id);
  }
}
