import { describe, expect, test } from 'bun:test';
import Elysia from 'elysia';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import {
  autoPartId,
  customerId,
  makeServiceOrder,
  serviceId,
  serviceOrderId,
  vehicleId,
} from '@/test/fixtures/saga-scenario';
import { registerServiceOrderRoutes } from './service-order-routes';
import { ServiceOrderMutationConflictError } from '@/application/use-cases/service-order/mutation-errors';

describe('service order routes', () => {
  const makeApp = (dependencies: Record<string, unknown>) => {
    const app = new Elysia();
    registerServiceOrderRoutes(app, () => dependencies as never);
    return app;
  };

  test('returns the legacy public projection for customer document lookup', async () => {
    let queriedDocument = '';
    const order = makeServiceOrder();
    const dependencies = {
      findByCustomerDocument: {
        execute: async (document: string) => {
          queriedDocument = document;
          return [order];
        },
      },
    };
    const app = new Elysia();
    registerServiceOrderRoutes(app, () => dependencies as never);

    const response = await app.handle(
      new Request('http://localhost/service-orders/customer/123.456.789-01'),
    );

    expect(response.status).toBe(200);
    expect(queriedDocument).toBe('12345678901');
    expect(await response.json()).toEqual([
      {
        status: ServiceOrderStatus.RECEIVED,
        serviceItems: [{ price: 150 }],
        autoPartItems: [
          {
            quantity: 1,
            unitPrice: 50,
            totalPrice: 50,
          },
        ],
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      },
    ]);
  });

  test('rejects customer documents with an invalid length', async () => {
    const dependencies = {
      findByCustomerDocument: {
        execute: async () => {
          throw new Error('must not query');
        },
      },
    };
    const app = new Elysia();
    registerServiceOrderRoutes(app, () => dependencies as never);

    const response = await app.handle(
      new Request('http://localhost/service-orders/customer/1234'),
    );

    expect(response.status).toBe(400);
  });

  test('creates a service order and starts its saga', async () => {
    const order = makeServiceOrder();
    let started = false;
    const app = makeApp({
      create: { execute: async () => order },
      orchestrator: {
        start: async () => {
          started = true;
        },
      },
    });

    const response = await app.handle(
      new Request('http://localhost/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          vehicleId,
          serviceItems: [{ serviceId, price: 150 }],
          autoPartItems: [{ autoPartId, quantity: 1, unitPrice: 50 }],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(started).toBe(true);
  });

  test('finds a service order by id', async () => {
    const app = makeApp({
      findById: { execute: async () => makeServiceOrder() },
    });

    const response = await app.handle(
      new Request(`http://localhost/service-orders/${serviceOrderId}`),
    );

    expect(response.status).toBe(200);
  });

  test('lists service orders', async () => {
    const app = makeApp({
      list: { execute: async () => [makeServiceOrder()] },
    });

    const response = await app.handle(
      new Request('http://localhost/service-orders?page=1&limit=10'),
    );

    expect(response.status).toBe(200);
  });

  test('updates a service order', async () => {
    const app = makeApp({
      update: { execute: async () => makeServiceOrder() },
    });

    const response = await app.handle(
      new Request(`http://localhost/service-orders/${serviceOrderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceItems: [{ serviceId, price: 150 }] }),
      }),
    );

    expect(response.status).toBe(200);
  });

  test('deletes a service order', async () => {
    const app = makeApp({ delete: { execute: async () => undefined } });

    const response = await app.handle(
      new Request(`http://localhost/service-orders/${serviceOrderId}`, {
        method: 'DELETE',
      }),
    );

    expect(response.status).toBe(204);
  });

  test('marks a completed order as delivered', async () => {
    const app = makeApp({
      deliver: {
        execute: async () => makeServiceOrder(ServiceOrderStatus.DELIVERED),
      },
    });

    const response = await app.handle(
      new Request(`http://localhost/service-orders/${serviceOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'next' }),
      }),
    );

    expect(response.status).toBe(200);
  });

  test('rejects malformed route parameters and request bodies', async () => {
    const app = makeApp({});
    const requests = [
      new Request('http://localhost/service-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      new Request('http://localhost/service-orders/not-a-uuid'),
      new Request('http://localhost/service-orders/not-a-uuid', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      new Request('http://localhost/service-orders/not-a-uuid', {
        method: 'DELETE',
      }),
      new Request('http://localhost/service-orders/not-a-uuid/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'next' }),
      }),
      new Request('http://localhost/service-orders?page=0'),
      new Request(`http://localhost/service-orders/${serviceOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'sideways' }),
      }),
    ];

    for (const request of requests) {
      expect((await app.handle(request)).status).toBe(400);
    }
  });

  test('returns not found when the requested service order is missing', async () => {
    const app = makeApp({
      findById: {
        execute: async () => {
          throw new Error('missing');
        },
      },
    });

    const response = await app.handle(
      new Request(`http://localhost/service-orders/${serviceOrderId}`),
    );

    expect(response.status).toBe(404);
  });

  test('returns conflict when an update is not allowed', async () => {
    const app = makeApp({
      update: {
        execute: async () => {
          throw new ServiceOrderMutationConflictError('saga started');
        },
      },
    });

    const response = await app.handle(
      new Request(`http://localhost/service-orders/${serviceOrderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceItems: [{ serviceId, price: 150 }] }),
      }),
    );

    expect(response.status).toBe(409);
  });
});
