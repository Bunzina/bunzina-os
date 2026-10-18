import { randomUUIDv7 } from 'bun';

export interface EntityProps {
  id?: string;
}

export abstract class Entity {
  id?: string;

  constructor(id?: string) {
    this.id = id ?? randomUUIDv7();
  }

  equals(entity: Entity): boolean {
    return entity === this || entity.id === this.id;
  }
}
