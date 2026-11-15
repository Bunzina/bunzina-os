import { describe, expect, test } from 'bun:test';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import { makeServiceOrder } from '@/test/fixtures/saga-scenario';
import { ListServiceOrdersUseCase } from './list';

describe('list service orders use case', () => {
  test('passes filters to the repository', async () => {
    const orders = [makeServiceOrder()];
    const filters = { page: 1, limit: 20 };
    let receivedFilters: typeof filters | undefined;
    const repository = {
      findByParams: async (params: typeof filters) => {
        receivedFilters = params;
        return orders;
      },
    } as unknown as ServiceOrderRepository;

    await expect(
      new ListServiceOrdersUseCase(repository).execute(filters),
    ).resolves.toBe(orders);
    expect(receivedFilters).toEqual(filters);
  });
});
