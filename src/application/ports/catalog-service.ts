import type {
  CustomerSnapshot,
  VehicleSnapshot,
} from '@/domain/service-order/entities/service-order';

export interface CatalogService {
  getCustomer(id: string): Promise<CustomerSnapshot>;
  getVehicle(id: string): Promise<VehicleSnapshot>;
  assertServiceExists(id: string): Promise<void>;
  assertAutoPartExists(id: string): Promise<void>;
}
