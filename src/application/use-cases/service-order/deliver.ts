import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import type { ServiceOrder } from '@/domain/service-order/entities/service-order';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import {
  determineStatusTransition,
  type StatusDirection,
} from '@/domain/service-order/state-machines/status-machine';
import { ServiceOrderNotFoundError } from './find-by-id';
import { ServiceOrderMutationConflictError } from './mutation-errors';

export class DeliverServiceOrderUseCase {
  constructor(private readonly repository: ServiceOrderRepository) {}

  async execute(id: string, direction: StatusDirection): Promise<ServiceOrder> {
    const order = await this.repository.findById(id);
    if (!order) throw new ServiceOrderNotFoundError();

    const targetStatus = determineStatusTransition(order.status, direction);
    if (targetStatus !== ServiceOrderStatus.DELIVERED) {
      throw new ServiceOrderMutationConflictError(
        'Only completed service orders can be delivered',
      );
    }

    const delivered = await this.repository.markDelivered(id, new Date());
    if (!delivered) {
      throw new ServiceOrderMutationConflictError(
        'Service order status changed before delivery could be recorded',
      );
    }

    const updated = await this.repository.findById(id);
    if (!updated) throw new ServiceOrderNotFoundError();
    return updated;
  }
}
