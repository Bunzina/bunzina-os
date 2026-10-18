import { Entity, type EntityProps } from '@/domain/core/entities/entity';
import type { Price } from '@/domain/core/value-objects/price';

export interface AutoPartItemProps extends EntityProps {
  autoPartId: string;
  quantity: number;
  unitPrice: Price;
  totalPrice?: Price;
  description?: string;
}

export class AutoPartItem extends Entity {
  autoPartId!: string;
  quantity!: number;
  unitPrice!: Price;
  totalPrice?: Price;
  description?: string;

  constructor({ id, ...input }: AutoPartItemProps) {
    super(id);

    if (input.quantity < 1) {
      throw new Error('Quantity cannot be zero or negative');
    }

    input.totalPrice = input.totalPrice ?? input.unitPrice;

    Object.assign(this, input);
  }
}
