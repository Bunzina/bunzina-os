import type { ServiceItem } from '../entities/service-item';
import type { ServiceOrder } from '../entities/service-order';
import type { ServiceOrderStatus } from '../types/service-order-status';

export interface FindServiceOrdersParams {
  page: number;
  limit: number;
  customerId?: string;
  vehicleId?: string;
  status?: ServiceOrderStatus;
  startCreatedAt?: Date;
  endCreatedAt?: Date;
}

export interface ServiceOrderRepository {
  create(serviceOrder: ServiceOrder): Promise<ServiceOrder>;
  findById(id: string): Promise<ServiceOrder | null>;
  findByParams(params: FindServiceOrdersParams): Promise<ServiceOrder[]>;
  update(serviceOrder: ServiceOrder): Promise<ServiceOrder>;
  delete(id: string): Promise<void>;
  findServiceItemById(id: string): Promise<ServiceItem | null>;
  updateServiceItem(serviceItem: ServiceItem): Promise<ServiceItem | null>;
  findByServiceItemId(serviceItemId: string): Promise<ServiceOrder | null>;
}
