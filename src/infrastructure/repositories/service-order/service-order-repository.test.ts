import { describe, expect, test } from 'bun:test';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { makeServiceOrder } from '@/test/fixtures/saga-scenario';
import { makeMockSql } from '@/test/fixtures/mock-sql';
import {
  ServiceOrderMapper,
  ServiceOrderServiceItemMapper,
} from './mappers/service-order-mapper';
import { ServiceOrderRepository } from './service-order-repository';

const serviceOrder = makeServiceOrder();
const serviceOrderRecord = ServiceOrderMapper.toDatabase(serviceOrder);
const serviceItemRecord = ServiceOrderServiceItemMapper.toDatabase(
  serviceOrder.id!,
  serviceOrder.serviceItems[0]!,
);

describe('service order repository', () => {
  test('creates orders with their items in a transaction', async () => {
    const { client, queries } = makeMockSql();

    await expect(
      new ServiceOrderRepository(client).create(serviceOrder),
    ).resolves.toBe(serviceOrder);

    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain('INSERT INTO bunzina.service_orders');
  });

  test('finds an order by id with its items or returns null', async () => {
    const found = makeMockSql([[serviceOrderRecord], [], []]);
    const repository = new ServiceOrderRepository(found.client);

    await expect(repository.findById(serviceOrder.id!)).resolves.toMatchObject({
      id: serviceOrder.id,
      customerSnapshot: serviceOrder.customerSnapshot,
    });

    const missing = makeMockSql([[]]);
    await expect(
      new ServiceOrderRepository(missing.client).findById(serviceOrder.id!),
    ).resolves.toBeNull();
  });

  test('finds orders by customer document and handles empty results', async () => {
    const found = makeMockSql([[serviceOrderRecord], [], []]);
    const repository = new ServiceOrderRepository(found.client);

    await expect(
      repository.findByCustomerDocument('12345678901'),
    ).resolves.toHaveLength(1);
    expect(found.queries[0]).toContain('customer_document = ?');

    const empty = makeMockSql([[]]);
    await expect(
      new ServiceOrderRepository(empty.client).findByCustomerDocument(
        '12345678901',
      ),
    ).resolves.toEqual([]);
  });

  test('lists with and without optional filters', async () => {
    const filtered = makeMockSql([
      [],
      [],
      [],
      [],
      [],
      [serviceOrderRecord],
      [],
      [],
    ]);
    await expect(
      new ServiceOrderRepository(filtered.client).findByParams({
        page: 2,
        limit: 10,
        customerId: serviceOrder.customerId,
        vehicleId: serviceOrder.vehicleId,
        status: ServiceOrderStatus.RECEIVED,
        startCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
        endCreatedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ).resolves.toHaveLength(1);

    const unfiltered = makeMockSql([[], [], [], [], [], []]);
    await expect(
      new ServiceOrderRepository(unfiltered.client).findByParams({
        page: 1,
        limit: 20,
      }),
    ).resolves.toEqual([]);
  });

  test('updates the order and replaces its items', async () => {
    const { client, queries } = makeMockSql();

    await expect(
      new ServiceOrderRepository(client, true).update(serviceOrder),
    ).resolves.toBe(serviceOrder);

    expect(queries).toHaveLength(5);
    expect(queries[0]).toContain('UPDATE bunzina.service_orders');
    expect(queries[1]).toContain(
      'DELETE FROM bunzina.service_order_service_items',
    );
  });

  test('deletes orders and atomically marks completed orders delivered', async () => {
    const { client, queries } = makeMockSql([
      [],
      [{ id: serviceOrder.id }],
      [],
    ]);
    const repository = new ServiceOrderRepository(client);

    await repository.delete(serviceOrder.id!);
    await expect(
      repository.markDelivered(serviceOrder.id!, new Date()),
    ).resolves.toBe(true);
    await expect(
      repository.markDelivered(serviceOrder.id!, new Date()),
    ).resolves.toBe(false);

    expect(queries[0]).toContain('DELETE FROM bunzina.service_orders');
    expect(queries[1]).toContain("status = 'COMPLETED'");
  });

  test('finds and updates service items', async () => {
    const { client } = makeMockSql([
      [serviceItemRecord],
      [],
      [serviceItemRecord],
      [],
    ]);
    const repository = new ServiceOrderRepository(client);

    await expect(
      repository.findServiceItemById(serviceItemRecord.id),
    ).resolves.toMatchObject({ id: serviceItemRecord.id });
    await expect(
      repository.findServiceItemById(serviceItemRecord.id),
    ).resolves.toBeNull();
    await expect(
      repository.updateServiceItem(serviceOrder.serviceItems[0]!),
    ).resolves.toMatchObject({ id: serviceItemRecord.id });
    await expect(
      repository.updateServiceItem(serviceOrder.serviceItems[0]!),
    ).resolves.toBeNull();
  });

  test('finds an order by service item id or returns null', async () => {
    const found = makeMockSql([
      [{ service_order_id: serviceOrder.id }],
      [serviceOrderRecord],
      [],
      [],
      [],
    ]);
    await expect(
      new ServiceOrderRepository(found.client).findByServiceItemId(
        serviceItemRecord.id,
      ),
    ).resolves.toMatchObject({ id: serviceOrder.id });

    const missing = makeMockSql([[]]);
    await expect(
      new ServiceOrderRepository(missing.client).findByServiceItemId(
        serviceItemRecord.id,
      ),
    ).resolves.toBeNull();
  });
});
