import { Price } from '@/domain/core/value-objects/price';
import { AutoPartItem } from '@/domain/service-order/entities/auto-part-item';
import { ServiceItem } from '@/domain/service-order/entities/service-item';
import { ServiceOrder } from '@/domain/service-order/entities/service-order';
import type { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { Quote } from '@/domain/service-order/value-objects/quote';
import type {
  ServiceOrderAutoPartItemDbSchema,
  ServiceOrderDbSchema,
  ServiceOrderServiceItemDbSchema,
} from '../dtos/service-order-db-schema';

export const ServiceOrderServiceItemMapper = {
  toDatabase(
    serviceOrderId: string,
    item: ServiceItem,
  ): ServiceOrderServiceItemDbSchema {
    return {
      id: item.id!,
      service_order_id: serviceOrderId,
      service_id: item.serviceId,
      price: item.price.value,
      description: item.description ?? null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      is_completed: item.isCompleted,
      finished_at: item.finishedAt ?? null,
      execution_time_ms: item.executionTimeMs ?? null,
    };
  },

  toDomain(record: ServiceOrderServiceItemDbSchema): ServiceItem {
    return new ServiceItem({
      id: record.id,
      serviceId: record.service_id,
      price: new Price(Number(record.price)),
      description: record.description ?? undefined,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      isCompleted: record.is_completed,
      finishedAt: record.finished_at ?? undefined,
      executionTimeMs: record.execution_time_ms ?? undefined,
    });
  },
};

export const ServiceOrderAutoPartItemMapper = {
  toDatabase(
    serviceOrderId: string,
    item: AutoPartItem,
  ): ServiceOrderAutoPartItemDbSchema {
    return {
      id: item.id!,
      service_order_id: serviceOrderId,
      auto_part_id: item.autoPartId,
      quantity: item.quantity,
      unit_price: item.unitPrice.value,
      total_price: item.totalPrice?.value ?? null,
      description: item.description ?? null,
    };
  },

  toDomain(record: ServiceOrderAutoPartItemDbSchema): AutoPartItem {
    return new AutoPartItem({
      id: record.id,
      autoPartId: record.auto_part_id,
      quantity: record.quantity,
      unitPrice: new Price(Number(record.unit_price)),
      totalPrice:
        record.total_price === null
          ? undefined
          : new Price(Number(record.total_price)),
      description: record.description ?? undefined,
    });
  },
};

export const ServiceOrderMapper = {
  toDatabase(order: ServiceOrder): ServiceOrderDbSchema {
    return {
      id: order.id!,
      customer_id: order.customerId,
      customer_name: order.customerSnapshot?.name ?? '',
      customer_document: order.customerSnapshot?.document ?? '',
      customer_email: order.customerSnapshot?.email ?? null,
      vehicle_id: order.vehicleId,
      vehicle_plate: order.vehicleSnapshot?.plate ?? '',
      vehicle_model: order.vehicleSnapshot?.model ?? null,
      status: order.status,
      quote_services_total: order.quote.servicesTotal,
      quote_auto_parts_total: order.quote.autoPartsTotal,
      quote_total: order.quote.total,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
      approved_at: order.approvedAt ?? null,
      paid_at: order.paidAt ?? null,
      started_at: order.startedAt ?? null,
      completed_at: order.completedAt ?? null,
      delivered_at: order.deliveredAt ?? null,
    };
  },

  toDomain(
    record: ServiceOrderDbSchema,
    serviceItems: ServiceOrderServiceItemDbSchema[],
    autoPartItems: ServiceOrderAutoPartItemDbSchema[],
  ): ServiceOrder {
    return new ServiceOrder({
      id: record.id,
      customerId: record.customer_id,
      customerSnapshot: {
        id: record.customer_id,
        name: record.customer_name,
        document: record.customer_document,
        email: record.customer_email ?? undefined,
      },
      vehicleId: record.vehicle_id,
      vehicleSnapshot: {
        id: record.vehicle_id,
        plate: record.vehicle_plate,
        model: record.vehicle_model ?? undefined,
      },
      status: record.status as ServiceOrderStatus,
      serviceItems: serviceItems.map(ServiceOrderServiceItemMapper.toDomain),
      autoPartItems: autoPartItems.map(ServiceOrderAutoPartItemMapper.toDomain),
      quote: new Quote({
        servicesTotal: Number(record.quote_services_total),
        autoPartsTotal: Number(record.quote_auto_parts_total),
      }),
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      approvedAt: record.approved_at ?? undefined,
      paidAt: record.paid_at ?? undefined,
      startedAt: record.started_at ?? undefined,
      completedAt: record.completed_at ?? undefined,
      deliveredAt: record.delivered_at ?? undefined,
    });
  },
};
