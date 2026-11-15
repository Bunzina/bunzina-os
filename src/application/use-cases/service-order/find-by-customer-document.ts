import type { ServiceOrder } from '@/domain/service-order/entities/service-order';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';

export class FindServiceOrdersByCustomerDocumentUseCase {
  constructor(private readonly repository: ServiceOrderRepository) {}

  execute(document: string): Promise<ServiceOrder[]> {
    return this.repository.findByCustomerDocument(document);
  }
}
