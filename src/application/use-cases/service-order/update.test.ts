import { describe, expect, test } from 'bun:test';
import type { CatalogService } from '@/application/ports/catalog-service';
import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import type { ServiceOrder } from '@/domain/service-order/entities/service-order';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import {
  autoPartId,
  makeServiceOrder,
  serviceId,
  serviceOrderId,
} from '@/test/fixtures/saga-scenario';
import { ServiceOrderMutationConflictError } from './mutation-errors';
import { UpdateServiceOrderUseCase } from './update';

describe('update service order use case', () => {
  test('updates items and quote before the saga starts', async () => {
    const original = makeServiceOrder();
    let saved: ServiceOrder | undefined;
    const repository = {
      findById: async () => original,
      update: async (order: ServiceOrder) => {
        saved = order;
        return order;
      },
    } as unknown as ServiceOrderRepository;
    const sagaRepository = {
      findByServiceOrderId: async () => null,
    } as unknown as SagaInstanceRepository;
    const catalog: CatalogService = {
      getCustomer: async () => original.customerSnapshot!,
      getVehicle: async () => original.vehicleSnapshot!,
      assertServiceExists: async () => undefined,
      assertAutoPartExists: async () => undefined,
    };

    await new UpdateServiceOrderUseCase(
      repository,
      sagaRepository,
      catalog,
    ).execute({
      id: serviceOrderId,
      serviceItems: [
        {
          serviceId,
          price: 220,
        },
      ],
      autoPartItems: [{ autoPartId, quantity: 2, unitPrice: 30 }],
    });

    expect(saved?.quote.servicesTotal).toBe(220);
    expect(saved?.quote.total).toBe(280);
    expect(saved?.customerSnapshot).toEqual(original.customerSnapshot);
    expect(saved?.serviceItems[0]?.serviceId).toBe(serviceId);
  });

  test('rejects updates after the saga has started', async () => {
    const repository = {
      findById: async () => makeServiceOrder(ServiceOrderStatus.RECEIVED),
    } as unknown as ServiceOrderRepository;
    const sagaRepository = {
      findByServiceOrderId: async () => ({}),
    } as unknown as SagaInstanceRepository;
    const catalog: CatalogService = {
      getCustomer: async () => ({ id: '', name: '', document: '' }),
      getVehicle: async () => ({ id: '', plate: '' }),
      assertServiceExists: async () => undefined,
      assertAutoPartExists: async () => undefined,
    };

    await expect(
      new UpdateServiceOrderUseCase(
        repository,
        sagaRepository,
        catalog,
      ).execute({
        id: serviceOrderId,
        serviceItems: [{ serviceId: 's', price: 10 }],
      }),
    ).rejects.toBeInstanceOf(ServiceOrderMutationConflictError);
  });
});
