import { describe, expect, test } from 'bun:test';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import {
  makeServiceOrder,
  serviceOrderId,
} from '@/test/fixtures/saga-scenario';
import {
  FindServiceOrderByIdUseCase,
  ServiceOrderNotFoundError,
} from './find-by-id';

describe('find service order by id use case', () => {
  test('returns the matching order', async () => {
    const order = makeServiceOrder();
    const repository = {
      findById: async () => order,
    } as unknown as ServiceOrderRepository;

    await expect(
      new FindServiceOrderByIdUseCase(repository).execute(serviceOrderId),
    ).resolves.toBe(order);
  });

  test('throws when the order does not exist', async () => {
    const repository = {
      findById: async () => null,
    } as unknown as ServiceOrderRepository;

    await expect(
      new FindServiceOrderByIdUseCase(repository).execute(serviceOrderId),
    ).rejects.toBeInstanceOf(ServiceOrderNotFoundError);
  });
});
