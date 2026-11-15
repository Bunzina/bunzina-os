import { describe, expect, test } from 'bun:test';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { StatusDirection } from '@/domain/service-order/state-machines/status-machine';
import {
  makeServiceOrder,
  serviceOrderId,
} from '@/test/fixtures/saga-scenario';
import { ServiceOrderMutationConflictError } from './mutation-errors';
import { DeliverServiceOrderUseCase } from './deliver';

describe('deliver service order use case', () => {
  test('moves a completed order to delivered atomically', async () => {
    const order = makeServiceOrder(ServiceOrderStatus.COMPLETED);
    let deliveryRecorded = false;
    const repository = {
      findById: async () => order,
      markDelivered: async () => {
        deliveryRecorded = true;
        order.status = ServiceOrderStatus.DELIVERED;
        return true;
      },
    } as unknown as ServiceOrderRepository;

    const result = await new DeliverServiceOrderUseCase(repository).execute(
      serviceOrderId,
      StatusDirection.NEXT,
    );

    expect(deliveryRecorded).toBe(true);
    expect(result.status).toBe(ServiceOrderStatus.DELIVERED);
  });

  test('does not allow a manual saga status transition', async () => {
    const repository = {
      findById: async () =>
        makeServiceOrder(ServiceOrderStatus.AWAITING_PAYMENT),
      markDelivered: async () => {
        throw new Error('must not write');
      },
    } as unknown as ServiceOrderRepository;

    await expect(
      new DeliverServiceOrderUseCase(repository).execute(
        serviceOrderId,
        StatusDirection.NEXT,
      ),
    ).rejects.toBeInstanceOf(ServiceOrderMutationConflictError);
  });
});
