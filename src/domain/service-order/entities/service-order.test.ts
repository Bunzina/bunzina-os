import { describe, expect, test } from 'bun:test';
import { Price } from '@/domain/core/value-objects/price';
import { AutoPartItem } from './auto-part-item';
import { ServiceItem } from './service-item';
import { ServiceOrder } from './service-order';
import { ServiceOrderStatus } from '../types/service-order-status';
import { Quote } from '../value-objects/quote';

describe('service order', () => {
  test('should initialize the aggregate with the supplied data', () => {
    const serviceItem = new ServiceItem({
      serviceId: 'service-id',
      price: new Price(100),
    });
    const autoPartItem = new AutoPartItem({
      autoPartId: 'auto-part-id',
      quantity: 2,
      unitPrice: new Price(50),
      totalPrice: new Price(100),
    });
    const order = new ServiceOrder({
      customerId: 'customer-id',
      vehicleId: 'vehicle-id',
      status: ServiceOrderStatus.RECEIVED,
      serviceItems: [serviceItem],
      autoPartItems: [autoPartItem],
      quote: new Quote({ servicesTotal: 100, autoPartsTotal: 100 }),
    });

    expect(order).toEqual({
      id: expect.any(String),
      customerId: 'customer-id',
      vehicleId: 'vehicle-id',
      status: ServiceOrderStatus.RECEIVED,
      serviceItems: [serviceItem],
      autoPartItems: [autoPartItem],
      quote: {
        servicesTotal: 100,
        autoPartsTotal: 100,
        total: 200,
      },
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    } as unknown as ServiceOrder);
  });
});
