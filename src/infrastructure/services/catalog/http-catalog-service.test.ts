import { describe, expect, test } from 'bun:test';
import { HttpCatalogService } from './http-catalog-service';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('http catalog service', () => {
  test('should map customer and vehicle snapshots', async () => {
    const requests: string[] = [];
    const catalog = new HttpCatalogService({
      baseUrl: 'http://catalog.test',
      fetcher: async (input) => {
        requests.push(String(input));
        return requests.length === 1
          ? response({
              id: 'customer-id',
              name: 'Ana Souza',
              document: '12345678901',
              email: 'ana@example.com',
            })
          : response({
              id: 'vehicle-id',
              licensePlate: 'ABC1D23',
              model: 'Gol',
            });
      },
    });

    await expect(catalog.getCustomer('customer-id')).resolves.toEqual({
      id: 'customer-id',
      name: 'Ana Souza',
      document: '12345678901',
      email: 'ana@example.com',
    });
    await expect(catalog.getVehicle('vehicle-id')).resolves.toEqual({
      id: 'vehicle-id',
      plate: 'ABC1D23',
      model: 'Gol',
    });
    expect(requests).toEqual([
      'http://catalog.test/customers/customer-id',
      'http://catalog.test/vehicles/vehicle-id',
    ]);
  });

  test('should send the api key and reject a missing resource', async () => {
    const receivedApiKeys: string[] = [];
    const catalog = new HttpCatalogService({
      apiKey: 'test-key',
      fetcher: async (_input, init) => {
        receivedApiKeys.push(new Headers(init?.headers).get('Api-Key') ?? '');
        return response({}, 404);
      },
    });

    await expect(
      catalog.assertServiceExists('service-id'),
    ).rejects.toMatchObject({
      name: 'CatalogServiceError',
      resource: 'services',
      resourceId: 'service-id',
      status: 404,
    });
    expect(receivedApiKeys).toEqual(['test-key']);
  });
});
