import { describe, expect, test } from 'bun:test';
import { CreateServiceOrderUseCase } from './create';
import type { CatalogService } from '@/application/ports/catalog-service';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import type { ServiceOrder } from '@/domain/service-order/entities/service-order';

describe('create service order use case', () => {
  test('should validate catalog data and persist snapshots', async () => {
    const catalog: CatalogService = {
      getCustomer: async () => ({
        id: 'customer-id',
        name: 'Ana Souza',
        document: '12345678901',
        email: 'ana@example.com',
      }),
      getVehicle: async () => ({
        id: 'vehicle-id',
        plate: 'ABC1D23',
        model: 'Gol',
      }),
      assertServiceExists: async () => undefined,
      assertAutoPartExists: async () => undefined,
    };
    let persistedOrder:
      | Parameters<ServiceOrderRepository['create']>[0]
      | undefined;
    const repository = {
      create: async (
        order: Parameters<ServiceOrderRepository['create']>[0],
      ) => {
        persistedOrder = order;
        return order;
      },
    } as ServiceOrderRepository;
    const useCase = new CreateServiceOrderUseCase(repository, catalog);

    const order = await useCase.execute({
      customerId: 'customer-id',
      vehicleId: 'vehicle-id',
      serviceItems: [
        { serviceId: 'service-id', price: 150, description: 'Oil change' },
      ],
      autoPartItems: [{ autoPartId: 'part-id', quantity: 2, unitPrice: 50 }],
    });

    expect(order).toEqual({
      id: expect.any(String),
      customerId: 'customer-id',
      customerSnapshot: {
        id: 'customer-id',
        name: 'Ana Souza',
        document: '12345678901',
        email: 'ana@example.com',
      },
      vehicleId: 'vehicle-id',
      vehicleSnapshot: {
        id: 'vehicle-id',
        plate: 'ABC1D23',
        model: 'Gol',
      },
      status: ServiceOrderStatus.RECEIVED,
      serviceItems: [
        {
          id: expect.any(String),
          serviceId: 'service-id',
          price: { value: 150 },
          description: 'Oil change',
          isCompleted: false,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      ],
      autoPartItems: [
        {
          id: expect.any(String),
          autoPartId: 'part-id',
          quantity: 2,
          unitPrice: { value: 50 },
          totalPrice: { value: 100 },
        },
      ],
      quote: { servicesTotal: 150, autoPartsTotal: 100, total: 250 },
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    } as unknown as ServiceOrder);
    expect(persistedOrder).toBe(order);
  });
});
