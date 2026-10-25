import type { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';

export interface ServiceOrderDbSchema {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_document: string;
  customer_email: string | null;
  vehicle_id: string;
  vehicle_plate: string;
  vehicle_model: string | null;
  status: ServiceOrderStatus;
  quote_services_total: number;
  quote_auto_parts_total: number;
  quote_total: number;
  created_at: Date;
  updated_at: Date;
  approved_at: Date | null;
  paid_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  delivered_at: Date | null;
}

export interface ServiceOrderServiceItemDbSchema {
  id: string;
  service_order_id: string;
  service_id: string;
  price: number;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  is_completed: boolean;
  finished_at: Date | null;
  execution_time_ms: number | null;
}

export interface ServiceOrderAutoPartItemDbSchema {
  id: string;
  service_order_id: string;
  auto_part_id: string;
  quantity: number;
  unit_price: number;
  total_price: number | null;
  description: string | null;
}
