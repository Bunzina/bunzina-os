import type { CatalogService } from '@/application/ports/catalog-service';
import { Price } from '@/domain/core/value-objects/price';
import { AutoPartItem } from '@/domain/service-order/entities/auto-part-item';
import { ServiceItem } from '@/domain/service-order/entities/service-item';
import { ServiceOrder } from '@/domain/service-order/entities/service-order';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { Quote } from '@/domain/service-order/value-objects/quote';

export interface CreateServiceOrderInput {
  customerId: string;
  vehicleId: string;
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
}

export class CreateServiceOrderUseCase {
  constructor(
    private readonly repository: ServiceOrderRepository,
    private readonly catalog: CatalogService,
  ) {}

  async execute(input: CreateServiceOrderInput): Promise<ServiceOrder> {
    const [customerSnapshot, vehicleSnapshot] = await Promise.all([
      this.catalog.getCustomer(input.customerId),
      this.catalog.getVehicle(input.vehicleId),
    ]);

    for (const item of input.serviceItems ?? []) {
      await this.catalog.assertServiceExists(item.serviceId);
    }

    for (const item of input.autoPartItems ?? []) {
      await this.catalog.assertAutoPartExists(item.autoPartId);
    }

    const serviceItems = (input.serviceItems ?? []).map(
      (item) =>
        new ServiceItem({
          serviceId: item.serviceId,
          price: new Price(item.price),
          description: item.description,
        }),
    );
    const autoPartItems = (input.autoPartItems ?? []).map((item) => {
      const unitPrice = new Price(item.unitPrice);

      return new AutoPartItem({
        autoPartId: item.autoPartId,
        quantity: item.quantity,
        unitPrice,
        totalPrice: new Price(unitPrice.value * item.quantity),
        description: item.description,
      });
    });

    const quote = new Quote({
      servicesTotal: serviceItems.reduce(
        (total, item) => total + item.price.value,
        0,
      ),
      autoPartsTotal: autoPartItems.reduce(
        (total, item) => total + (item.totalPrice?.value ?? 0),
        0,
      ),
    });
    const order = new ServiceOrder({
      customerId: input.customerId,
      customerSnapshot,
      vehicleId: input.vehicleId,
      vehicleSnapshot,
      status: ServiceOrderStatus.RECEIVED,
      serviceItems,
      autoPartItems,
      quote,
    });

    await this.repository.create(order);
    return order;
  }
}
