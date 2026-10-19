import { Entity, type EntityProps } from '@/domain/core/entities/entity';
import type { Price } from '@/domain/core/value-objects/price';

export interface ServiceItemProps extends EntityProps {
  serviceId: string;
  price: Price;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
  isCompleted?: boolean;
  finishedAt?: Date;
  executionTimeMs?: number;
}

export class ServiceItem extends Entity {
  serviceId!: string;
  price!: Price;
  isCompleted!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  description?: string;
  finishedAt?: Date;
  executionTimeMs?: number;

  constructor({ id, ...input }: ServiceItemProps) {
    super(id);

    input.createdAt = input.createdAt ?? new Date();
    input.updatedAt = input.updatedAt ?? new Date();
    input.isCompleted = input.isCompleted ?? false;

    Object.assign(this, input);
  }
}
