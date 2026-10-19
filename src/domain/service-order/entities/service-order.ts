import { Entity, type EntityProps } from '@/domain/core/entities/entity';
import type { ServiceOrderStatus } from '../types/service-order-status';
import type { Quote } from '../value-objects/quote';
import type { AutoPartItem } from './auto-part-item';
import type { ServiceItem } from './service-item';

export interface ServiceOrderProps extends EntityProps {
  customerId: string;
  vehicleId: string;
  status: ServiceOrderStatus;
  serviceItems: ServiceItem[];
  autoPartItems: AutoPartItem[];
  quote: Quote;
  createdAt?: Date;
  updatedAt?: Date;
  approvedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  deliveredAt?: Date;
}

export class ServiceOrder extends Entity {
  customerId!: string;
  vehicleId!: string;
  status!: ServiceOrderStatus;
  serviceItems!: ServiceItem[];
  autoPartItems!: AutoPartItem[];
  quote!: Quote;
  createdAt!: Date;
  updatedAt!: Date;
  approvedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  deliveredAt?: Date;

  constructor({ id, ...input }: ServiceOrderProps) {
    super(id);

    input.createdAt = input.createdAt ?? new Date();
    input.updatedAt = input.updatedAt ?? new Date();

    Object.assign(this, input);
  }
}
