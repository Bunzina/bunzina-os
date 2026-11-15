import { describe, expect, test } from 'bun:test';
import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import {
  makeServiceOrder,
  serviceOrderId,
} from '@/test/fixtures/saga-scenario';
import { ServiceOrderMutationConflictError } from './mutation-errors';
import { DeleteServiceOrderUseCase } from './delete';

describe('delete service order use case', () => {
  test('deletes an unprocessed received order', async () => {
    let deletedId = '';
    const repository = {
      findById: async () => makeServiceOrder(ServiceOrderStatus.RECEIVED),
      delete: async (id: string) => {
        deletedId = id;
      },
    } as unknown as ServiceOrderRepository;
    const sagaRepository = {
      findByServiceOrderId: async () => null,
    } as unknown as SagaInstanceRepository;

    await new DeleteServiceOrderUseCase(repository, sagaRepository).execute(
      serviceOrderId,
    );

    expect(deletedId).toBe(serviceOrderId);
  });

  test('refuses to delete an order with a saga', async () => {
    const repository = {
      findById: async () => makeServiceOrder(ServiceOrderStatus.RECEIVED),
    } as unknown as ServiceOrderRepository;
    const sagaRepository = {
      findByServiceOrderId: async () => ({}),
    } as unknown as SagaInstanceRepository;

    await expect(
      new DeleteServiceOrderUseCase(repository, sagaRepository).execute(
        serviceOrderId,
      ),
    ).rejects.toBeInstanceOf(ServiceOrderMutationConflictError);
  });
});
