import { describe, expect, test } from 'bun:test';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import type { ServiceOrder } from '@/domain/service-order/entities/service-order';
import { FindServiceOrdersByCustomerDocumentUseCase } from './find-by-customer-document';

describe('find service orders by customer document', () => {
  test('queries using the customer document snapshot', async () => {
    const orders: ServiceOrder[] = [];
    let requestedDocument = '';
    const repository = {
      findByCustomerDocument: async (document: string) => {
        requestedDocument = document;
        return orders;
      },
    } as unknown as ServiceOrderRepository;

    const result = await new FindServiceOrdersByCustomerDocumentUseCase(
      repository,
    ).execute('12345678901');

    expect(requestedDocument).toBe('12345678901');
    expect(result).toBe(orders);
  });
});
