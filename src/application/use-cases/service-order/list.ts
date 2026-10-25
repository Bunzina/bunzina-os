import type { ServiceOrder } from '@/domain/service-order/entities/service-order';
import type {
  FindServiceOrdersParams,
  ServiceOrderRepository,
} from '@/domain/service-order/repositories/service-order-repository';

export class ListServiceOrdersUseCase {
  constructor(private readonly repository: ServiceOrderRepository) {}

  execute(params: FindServiceOrdersParams): Promise<ServiceOrder[]> {
    return this.repository.findByParams(params);
  }
}
