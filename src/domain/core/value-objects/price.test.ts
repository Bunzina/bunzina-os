import { describe, expect, test } from 'bun:test';
import { Price } from './price';

describe('price', () => {
  test('should keep a non-negative value', () => {
    expect(new Price(42)).toEqual({ value: 42 } as unknown as Price);
  });

  test('should reject negative values', () => {
    expect(() => new Price(-1)).toThrow('Price cannot be negative');
  });
});
