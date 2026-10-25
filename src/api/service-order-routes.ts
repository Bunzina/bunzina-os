import type { Elysia } from 'elysia';
import { z } from 'zod';
import { CreateServiceOrderUseCase } from '@/application/use-cases/service-order/create';
import { FindServiceOrderByIdUseCase } from '@/application/use-cases/service-order/find-by-id';
import { ListServiceOrdersUseCase } from '@/application/use-cases/service-order/list';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { serviceOrderToResponse } from '@/adapters/output/service-order-presenter';
import { db } from '@/infrastructure/configs/database';
import { ServiceOrderRepository } from '@/infrastructure/repositories/service-order/service-order-repository';
import {
  CatalogServiceError,
  HttpCatalogService,
} from '@/infrastructure/services/catalog/http-catalog-service';

const serviceItemSchema = z.object({
  serviceId: z.uuid(),
  price: z.number().nonnegative(),
  description: z.string().optional(),
});

const autoPartItemSchema = z.object({
  autoPartId: z.uuid(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().nonnegative(),
  description: z.string().optional(),
});

const createSchema = z
  .object({
    customerId: z.uuid(),
    vehicleId: z.uuid(),
    serviceItems: z.array(serviceItemSchema).optional(),
    autoPartItems: z.array(autoPartItemSchema).optional(),
  })
  .refine(
    (input) =>
      (input.serviceItems?.length ?? 0) + (input.autoPartItems?.length ?? 0) >
      0,
    { message: 'At least one item is required' },
  );

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  customerId: z.uuid().optional(),
  vehicleId: z.uuid().optional(),
  status: z.enum(ServiceOrderStatus).optional(),
  startCreatedAt: z.coerce.date().optional(),
  endCreatedAt: z.coerce.date().optional(),
});

const jsonError = (
  set: { status?: number | string },
  status: number,
  message: string,
) => {
  set.status = status;
  return Response.json({ reason: message }, { status });
};

const dependencies = () => {
  const repository = new ServiceOrderRepository(db);
  const catalog = new HttpCatalogService();

  return {
    create: new CreateServiceOrderUseCase(repository, catalog),
    findById: new FindServiceOrderByIdUseCase(repository),
    list: new ListServiceOrdersUseCase(repository),
  };
};

export const registerServiceOrderRoutes = (app: Elysia) => {
  app.post(
    '/service-orders',
    async ({ body, set }) => {
      const parsed = createSchema.safeParse(body);
      if (!parsed.success)
        return jsonError(set, 400, 'Invalid service order data');

      try {
        const order = await dependencies().create.execute(parsed.data);
        return Response.json(serviceOrderToResponse(order), { status: 201 });
      } catch (error) {
        return handleCatalogError(set, error);
      }
    },
    {
      detail: {
        tags: ['Service Orders'],
        summary: 'Create service order',
      },
    },
  );

  app.get(
    '/service-orders/:id',
    async ({ params, set }) => {
      if (!z.uuid().safeParse(params.id).success) {
        return jsonError(set, 400, 'Invalid service order id');
      }

      try {
        const order = await dependencies().findById.execute(params.id);
        return Response.json(serviceOrderToResponse(order));
      } catch (error) {
        if (error instanceof CatalogServiceError)
          return handleCatalogError(set, error);
        return jsonError(set, 404, 'Service order not found');
      }
    },
    {
      detail: {
        tags: ['Service Orders'],
        summary: 'Find service order by id',
      },
    },
  );

  app.get(
    '/service-orders',
    async ({ query, set }) => {
      const parsed = listQuerySchema.safeParse(query);
      if (!parsed.success)
        return jsonError(set, 400, 'Invalid service order filters');

      const orders = await dependencies().list.execute(parsed.data);
      return Response.json(orders.map(serviceOrderToResponse));
    },
    {
      detail: {
        tags: ['Service Orders'],
        summary: 'List service orders',
      },
    },
  );
};

const handleCatalogError = (
  set: { status?: number | string },
  error: unknown,
) => {
  if (error instanceof CatalogServiceError) {
    return jsonError(
      set,
      error.status === 404 ? 404 : 502,
      'Catalog service is unavailable',
    );
  }

  return jsonError(set, 500, 'Failed to process service order');
};
