import { describe, expect, test } from 'bun:test';
import { Entity } from './entity';

class TestEntity extends Entity {}

describe('entity', () => {
  test('should be equal to itself', () => {
    const entity = new TestEntity('entity-id');

    expect(entity.equals(entity)).toBe(true);
  });

  test('should be equal to another entity with the same id', () => {
    const entity = new TestEntity('entity-id');
    const otherEntity = new TestEntity('entity-id');

    expect(entity.equals(otherEntity)).toBe(true);
  });

  test('should not be equal to an entity with another id', () => {
    const entity = new TestEntity('entity-id');
    const otherEntity = new TestEntity('other-id');

    expect(entity.equals(otherEntity)).toBe(false);
  });
});
