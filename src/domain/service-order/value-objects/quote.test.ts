import { describe, expect, test } from 'bun:test';
import { Quote } from './quote';

describe('quote', () => {
  test('should calculate the total', () => {
    const quote = new Quote({ servicesTotal: 120, autoPartsTotal: 80 });

    expect(quote.total).toBe(200);
  });

  test('should reject negative totals', () => {
    expect(() => new Quote({ servicesTotal: -1, autoPartsTotal: 0 })).toThrow(
      'Services total cannot be negative',
    );
    expect(() => new Quote({ servicesTotal: 0, autoPartsTotal: -1 })).toThrow(
      'Auto parts total cannot be negative',
    );
  });
});
