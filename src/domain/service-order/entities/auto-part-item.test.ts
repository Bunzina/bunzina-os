import { describe, expect, test } from 'bun:test';
import { Price } from '@/domain/core/value-objects/price';
import { AutoPartItem } from './auto-part-item';

describe('auto part item', () => {
  test('should use the unit price when total price is omitted', () => {
    const item = new AutoPartItem({
      autoPartId: 'auto-part-id',
      quantity: 1,
      unitPrice: new Price(50),
    });

    expect(item.totalPrice?.value).toBe(50);
  });

  test('should reject a non-positive quantity', () => {
    expect(
      () =>
        new AutoPartItem({
          autoPartId: 'auto-part-id',
          quantity: 0,
          unitPrice: new Price(50),
        }),
    ).toThrow('Quantity cannot be zero or negative');
  });
});
