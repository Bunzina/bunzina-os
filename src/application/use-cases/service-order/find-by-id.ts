import type { ServiceOrder } from '@/domain/service-order/entities/service-order';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';

export class ServiceOrderNotFoundError extends Error {
  constructor() {
    super('Service order not found');
    this.name = 'ServiceOrderNotFoundError';
  }
}

export class FindServiceOrderByIdUseCase {
  constructor(private readonly repository: ServiceOrderRepository) {}

  async execute(id: string): Promise<ServiceOrder> {
    const order = await this.repository.findById(id);
    if (!order) throw new ServiceOrderNotFoundError();
    return order;
  }
}
