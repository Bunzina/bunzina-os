import type { SQL } from 'bun';
import logger from '@lucas-pmelo/logger';
import type { ServiceItem } from '@/domain/service-order/entities/service-item';
import type { ServiceOrder } from '@/domain/service-order/entities/service-order';
import type {
  FindServiceOrdersParams,
  ServiceOrderRepository as ServiceOrderRepositoryPort,
} from '@/domain/service-order/repositories/service-order-repository';
import type {
  ServiceOrderAutoPartItemDbSchema,
  ServiceOrderDbSchema,
  ServiceOrderServiceItemDbSchema,
} from './dtos/service-order-db-schema';
import {
  ServiceOrderAutoPartItemMapper,
  ServiceOrderMapper,
  ServiceOrderServiceItemMapper,
} from './mappers/service-order-mapper';

export class ServiceOrderRepository implements ServiceOrderRepositoryPort {
  constructor(private readonly client: SQL) {}

  async create(order: ServiceOrder): Promise<ServiceOrder> {
    const record = ServiceOrderMapper.toDatabase(order);
    const serviceItems = order.serviceItems.map((item) =>
      ServiceOrderServiceItemMapper.toDatabase(order.id!, item),
    );
    const autoPartItems = order.autoPartItems.map((item) =>
      ServiceOrderAutoPartItemMapper.toDatabase(order.id!, item),
    );

    await this.client.transaction(async (sql) => {
      await sql`INSERT INTO bunzina.service_orders ${sql(record)}`;
      await this.insertItems(sql, serviceItems, autoPartItems);
    });

    return order;
  }

  async findById(id: string): Promise<ServiceOrder | null> {
    const [record] = await this.client<ServiceOrderDbSchema[]>`
      SELECT * FROM bunzina.service_orders WHERE id = ${id} LIMIT 1
    `;

    if (!record) return null;

    const [serviceItems, autoPartItems] = await Promise.all([
      this.findServiceItems(id),
      this.findAutoPartItems(id),
    ]);

    return ServiceOrderMapper.toDomain(record, serviceItems, autoPartItems);
  }

  async findByParams(params: FindServiceOrdersParams): Promise<ServiceOrder[]> {
    const offset = (params.page - 1) * params.limit;
    const customerId = params.customerId
      ? this.client`AND customer_id = ${params.customerId}`
      : this.client``;
    const vehicleId = params.vehicleId
      ? this.client`AND vehicle_id = ${params.vehicleId}`
      : this.client``;
    const status = params.status
      ? this.client`AND status = ${params.status}`
      : this.client``;
    const startCreatedAt = params.startCreatedAt
      ? this.client`AND created_at >= ${params.startCreatedAt}`
      : this.client``;
    const endCreatedAt = params.endCreatedAt
      ? this.client`AND created_at <= ${params.endCreatedAt}`
      : this.client``;

    const records = await this.client<ServiceOrderDbSchema[]>`
      SELECT *
      FROM bunzina.service_orders
      WHERE status NOT IN ('COMPLETED', 'DELIVERED')
        ${customerId}
        ${vehicleId}
        ${status}
        ${startCreatedAt}
        ${endCreatedAt}
      ORDER BY
        CASE status
          WHEN 'IN_EXECUTION' THEN 1
          WHEN 'AWAITING_PAYMENT' THEN 2
          WHEN 'AWAITING_APPROVAL' THEN 3
          WHEN 'IN_DIAGNOSTIC' THEN 4
          WHEN 'RECEIVED' THEN 5
          ELSE 6
        END,
        created_at ASC
      LIMIT ${params.limit}
      OFFSET ${offset}
    `;

    return Promise.all(
      records.map(async (record) =>
        ServiceOrderMapper.toDomain(
          record,
          await this.findServiceItems(record.id),
          await this.findAutoPartItems(record.id),
        ),
      ),
    );
  }

  async update(order: ServiceOrder): Promise<ServiceOrder> {
    const record = ServiceOrderMapper.toDatabase(order);
    const serviceItems = order.serviceItems.map((item) =>
      ServiceOrderServiceItemMapper.toDatabase(order.id!, item),
    );
    const autoPartItems = order.autoPartItems.map((item) =>
      ServiceOrderAutoPartItemMapper.toDatabase(order.id!, item),
    );

    await this.client.transaction(async (sql) => {
      await sql`
        UPDATE bunzina.service_orders
        SET customer_id = ${record.customer_id},
            customer_name = ${record.customer_name},
            customer_document = ${record.customer_document},
            customer_email = ${record.customer_email},
            vehicle_id = ${record.vehicle_id},
            vehicle_plate = ${record.vehicle_plate},
            vehicle_model = ${record.vehicle_model},
            status = ${record.status},
            quote_services_total = ${record.quote_services_total},
            quote_auto_parts_total = ${record.quote_auto_parts_total},
            quote_total = ${record.quote_total},
            updated_at = ${record.updated_at},
            approved_at = ${record.approved_at},
            paid_at = ${record.paid_at},
            started_at = ${record.started_at},
            completed_at = ${record.completed_at},
            delivered_at = ${record.delivered_at}
        WHERE id = ${record.id}
      `;

      await sql`
        DELETE FROM bunzina.service_order_service_items
        WHERE service_order_id = ${record.id}
      `;
      await sql`
        DELETE FROM bunzina.service_order_auto_part_items
        WHERE service_order_id = ${record.id}
      `;
      await this.insertItems(sql, serviceItems, autoPartItems);
    });

    return order;
  }

  async delete(id: string): Promise<void> {
    await this.client`
      DELETE FROM bunzina.service_orders WHERE id = ${id}
    `;
  }

  async findServiceItemById(id: string): Promise<ServiceItem | null> {
    const [record] = await this.client<ServiceOrderServiceItemDbSchema[]>`
      SELECT *
      FROM bunzina.service_order_service_items
      WHERE id = ${id}
      LIMIT 1
    `;

    return record ? ServiceOrderServiceItemMapper.toDomain(record) : null;
  }

  async updateServiceItem(item: ServiceItem): Promise<ServiceItem | null> {
    const record = ServiceOrderServiceItemMapper.toDatabase('', item);
    const [updated] = await this.client<ServiceOrderServiceItemDbSchema[]>`
      UPDATE bunzina.service_order_service_items
      SET is_completed = ${record.is_completed},
          updated_at = ${record.updated_at},
          finished_at = ${record.finished_at},
          execution_time_ms = ${record.execution_time_ms}
      WHERE id = ${record.id}
      RETURNING *
    `;

    return updated ? ServiceOrderServiceItemMapper.toDomain(updated) : null;
  }

  async findByServiceItemId(
    serviceItemId: string,
  ): Promise<ServiceOrder | null> {
    const [record] = await this.client<{ service_order_id: string }[]>`
      SELECT service_order_id
      FROM bunzina.service_order_service_items
      WHERE id = ${serviceItemId}
      LIMIT 1
    `;

    return record ? this.findById(record.service_order_id) : null;
  }

  private async findServiceItems(
    orderId: string,
  ): Promise<ServiceOrderServiceItemDbSchema[]> {
    return this.client<ServiceOrderServiceItemDbSchema[]>`
      SELECT *
      FROM bunzina.service_order_service_items
      WHERE service_order_id = ${orderId}
      ORDER BY created_at ASC
    `;
  }

  private async findAutoPartItems(
    orderId: string,
  ): Promise<ServiceOrderAutoPartItemDbSchema[]> {
    return this.client<ServiceOrderAutoPartItemDbSchema[]>`
      SELECT *
      FROM bunzina.service_order_auto_part_items
      WHERE service_order_id = ${orderId}
      ORDER BY id ASC
    `;
  }

  private async insertItems(
    sql: SQL,
    serviceItems: ServiceOrderServiceItemDbSchema[],
    autoPartItems: ServiceOrderAutoPartItemDbSchema[],
  ): Promise<void> {
    for (const item of serviceItems) {
      await sql`INSERT INTO bunzina.service_order_service_items ${sql(item)}`;
    }

    for (const item of autoPartItems) {
      await sql`INSERT INTO bunzina.service_order_auto_part_items ${sql(item)}`;
    }

    logger.debug({
      message: 'Service order items persisted',
      data: {
        serviceItems: serviceItems.length,
        autoPartItems: autoPartItems.length,
      },
    });
  }
}
