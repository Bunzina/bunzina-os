import { describe, expect, test } from 'bun:test';
import { AutoPartItem } from '@/domain/service-order/entities/auto-part-item';
import { ServiceItem } from '@/domain/service-order/entities/service-item';
import type { ServiceOrder } from '@/domain/service-order/entities/service-order';
import { Price } from '@/domain/core/value-objects/price';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import {
  ServiceOrderAutoPartItemMapper,
  ServiceOrderMapper,
  ServiceOrderServiceItemMapper,
} from './service-order-mapper';

describe('service order mapper', () => {
  test('should map snapshots and payment timestamps to the database', () => {
    const createdAt = new Date('2026-10-24T10:00:00.000Z');
    const updatedAt = new Date('2026-10-24T11:00:00.000Z');
    const paidAt = new Date('2026-10-24T12:00:00.000Z');
    const order = {
      id: 'order-id',
      customerId: 'customer-id',
      customerSnapshot: {
        id: 'customer-id',
        name: 'Ana Souza',
        document: '12345678901',
        email: 'ana@example.com',
      },
      vehicleId: 'vehicle-id',
      vehicleSnapshot: { id: 'vehicle-id', plate: 'ABC1D23', model: 'Gol' },
      status: ServiceOrderStatus.AWAITING_PAYMENT,
      serviceItems: [],
      autoPartItems: [],
      quote: { servicesTotal: 100, autoPartsTotal: 50, total: 150 },
      createdAt,
      updatedAt,
      paidAt,
    };

    expect(
      ServiceOrderMapper.toDatabase(order as unknown as ServiceOrder),
    ).toEqual({
      id: 'order-id',
      customer_id: 'customer-id',
      customer_name: 'Ana Souza',
      customer_document: '12345678901',
      customer_email: 'ana@example.com',
      vehicle_id: 'vehicle-id',
      vehicle_plate: 'ABC1D23',
      vehicle_model: 'Gol',
      status: ServiceOrderStatus.AWAITING_PAYMENT,
      quote_services_total: 100,
      quote_auto_parts_total: 50,
      quote_total: 150,
      created_at: createdAt,
      updated_at: updatedAt,
      approved_at: null,
      paid_at: paidAt,
      started_at: null,
      completed_at: null,
      delivered_at: null,
    });
  });

  test('should map service and auto-part items in both directions', () => {
    const serviceItem = new ServiceItem({
      id: 'service-item-id',
      serviceId: 'service-id',
      price: new Price(100),
      description: 'Oil change',
      isCompleted: true,
      finishedAt: new Date('2026-10-24T13:00:00.000Z'),
      executionTimeMs: 1200,
    });
    const autoPartItem = new AutoPartItem({
      id: 'part-item-id',
      autoPartId: 'part-id',
      quantity: 2,
      unitPrice: new Price(50),
      totalPrice: new Price(100),
      description: 'Oil filter',
    });

    const serviceRecord = ServiceOrderServiceItemMapper.toDatabase(
      'order-id',
      serviceItem,
    );
    const autoPartRecord = ServiceOrderAutoPartItemMapper.toDatabase(
      'order-id',
      autoPartItem,
    );

    expect(ServiceOrderServiceItemMapper.toDomain(serviceRecord)).toEqual(
      serviceItem,
    );
    expect(ServiceOrderAutoPartItemMapper.toDomain(autoPartRecord)).toEqual(
      autoPartItem,
    );
  });

  test('should rebuild an order from database records', () => {
    const createdAt = new Date('2026-10-24T10:00:00.000Z');
    const updatedAt = new Date('2026-10-24T11:00:00.000Z');
    const order = ServiceOrderMapper.toDomain(
      {
        id: 'order-id',
        customer_id: 'customer-id',
        customer_name: 'Ana Souza',
        customer_document: '12345678901',
        customer_email: 'ana@example.com',
        vehicle_id: 'vehicle-id',
        vehicle_plate: 'ABC1D23',
        vehicle_model: 'Gol',
        status: ServiceOrderStatus.RECEIVED,
        quote_services_total: 100,
        quote_auto_parts_total: 50,
        quote_total: 150,
        created_at: createdAt,
        updated_at: updatedAt,
        approved_at: null,
        paid_at: null,
        started_at: null,
        completed_at: null,
        delivered_at: null,
      },
      [],
      [],
    );

    expect(order).toEqual({
      id: 'order-id',
      customerId: 'customer-id',
      customerSnapshot: {
        id: 'customer-id',
        name: 'Ana Souza',
        document: '12345678901',
        email: 'ana@example.com',
      },
      vehicleId: 'vehicle-id',
      vehicleSnapshot: {
        id: 'vehicle-id',
        plate: 'ABC1D23',
        model: 'Gol',
      },
      status: ServiceOrderStatus.RECEIVED,
      serviceItems: [],
      autoPartItems: [],
      quote: { servicesTotal: 100, autoPartsTotal: 50, total: 150 },
      createdAt,
      updatedAt,
    } as unknown as ServiceOrder);
  });
});
