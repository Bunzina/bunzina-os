import type { CatalogService } from '@/application/ports/catalog-service';
import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import { Price } from '@/domain/core/value-objects/price';
import { AutoPartItem } from '@/domain/service-order/entities/auto-part-item';
import { ServiceItem } from '@/domain/service-order/entities/service-item';
import { ServiceOrder } from '@/domain/service-order/entities/service-order';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { Quote } from '@/domain/service-order/value-objects/quote';
import { ServiceOrderNotFoundError } from './find-by-id';
import { ServiceOrderMutationConflictError } from './mutation-errors';

export type UpdateServiceOrderInput = {
  id: string;
  serviceItems?: Array<{
    serviceId: string;
    price: number;
    description?: string;
  }>;
  autoPartItems?: Array<{
    autoPartId: string;
    quantity: number;
    unitPrice: number;
    description?: string;
  }>;
};

export class UpdateServiceOrderUseCase {
  constructor(
    private readonly repository: ServiceOrderRepository,
    private readonly sagaRepository: SagaInstanceRepository,
    private readonly catalog: CatalogService,
  ) {}

  async execute(input: UpdateServiceOrderInput): Promise<ServiceOrder> {
    const order = await this.repository.findById(input.id);
    if (!order) throw new ServiceOrderNotFoundError();

    const saga = await this.sagaRepository.findByServiceOrderId(input.id);
    if (saga || order.status !== ServiceOrderStatus.RECEIVED) {
      throw new ServiceOrderMutationConflictError(
        'Service order cannot be updated after its saga has started',
      );
    }

    for (const serviceId of new Set(
      (input.serviceItems ?? []).map((item) => item.serviceId),
    )) {
      await this.catalog.assertServiceExists(serviceId);
    }
    for (const autoPartId of new Set(
      (input.autoPartItems ?? []).map((item) => item.autoPartId),
    )) {
      await this.catalog.assertAutoPartExists(autoPartId);
    }

    const serviceItems = input.serviceItems
      ? input.serviceItems.map(
          (item) =>
            new ServiceItem({
              serviceId: item.serviceId,
              price: new Price(item.price),
              description: item.description,
            }),
        )
      : order.serviceItems;
    const autoPartItems = input.autoPartItems
      ? input.autoPartItems.map((item) => {
          const unitPrice = new Price(item.unitPrice);
          return new AutoPartItem({
            autoPartId: item.autoPartId,
            quantity: item.quantity,
            unitPrice,
            totalPrice: new Price(unitPrice.value * item.quantity),
            description: item.description,
          });
        })
      : order.autoPartItems;

    if (serviceItems.length + autoPartItems.length === 0) {
      throw new ServiceOrderMutationConflictError(
        'A service order must contain at least one item',
      );
    }

    const updated = new ServiceOrder({
      id: order.id,
      customerId: order.customerId,
      customerSnapshot: order.customerSnapshot,
      vehicleId: order.vehicleId,
      vehicleSnapshot: order.vehicleSnapshot,
      status: order.status,
      serviceItems,
      autoPartItems,
      quote: new Quote({
        servicesTotal: serviceItems.reduce(
          (total, item) => total + item.price.value,
          0,
        ),
        autoPartsTotal: autoPartItems.reduce(
          (total, item) => total + (item.totalPrice?.value ?? 0),
          0,
        ),
      }),
      createdAt: order.createdAt,
      updatedAt: new Date(),
      approvedAt: order.approvedAt,
      paidAt: order.paidAt,
      startedAt: order.startedAt,
      completedAt: order.completedAt,
      deliveredAt: order.deliveredAt,
    });

    return this.repository.update(updated);
  }
}
