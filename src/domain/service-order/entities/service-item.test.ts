import { describe, expect, test } from 'bun:test';
import { Price } from '@/domain/core/value-objects/price';
import { ServiceItem } from './service-item';

describe('service item', () => {
  test('should initialize execution fields', () => {
    const item = new ServiceItem({
      serviceId: 'service-id',
      price: new Price(100),
    });

    expect(item).toEqual({
      id: expect.any(String),
      serviceId: 'service-id',
      price: { value: 100 },
      isCompleted: false,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    } as unknown as ServiceItem);
  });
});
