import type { CatalogService } from '@/application/ports/catalog-service';
import type {
  CustomerSnapshot,
  VehicleSnapshot,
} from '@/domain/service-order/entities/service-order';

export class CatalogServiceError extends Error {
  constructor(
    public readonly resource: string,
    public readonly resourceId: string,
    public readonly status?: number,
  ) {
    super(`Catalog resource ${resource}/${resourceId} is unavailable`);
    this.name = 'CatalogServiceError';
  }
}

type HttpCatalogServiceOptions = {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetcher?: CatalogFetcher;
};

type CatalogFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class HttpCatalogService implements CatalogService {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetcher: CatalogFetcher;

  constructor(options: HttpCatalogServiceOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.CATALOG_SERVICE_URL ??
      'http://localhost:3001'
    ).replace(/\/$/, '');
    this.apiKey = options.apiKey ?? process.env.CATALOG_SERVICE_API_KEY;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async getCustomer(id: string): Promise<CustomerSnapshot> {
    const data = await this.get<Record<string, unknown>>('customers', id);

    return {
      id: String(data.id ?? id),
      name: String(data.name ?? ''),
      document: String(data.document ?? ''),
      email: data.email ? String(data.email) : undefined,
    };
  }

  async getVehicle(id: string): Promise<VehicleSnapshot> {
    const data = await this.get<Record<string, unknown>>('vehicles', id);

    return {
      id: String(data.id ?? id),
      plate: String(data.licensePlate ?? data.plate ?? ''),
      model: data.model ? String(data.model) : undefined,
    };
  }

  async assertServiceExists(id: string): Promise<void> {
    await this.get('services', id);
  }

  async assertAutoPartExists(id: string): Promise<void> {
    await this.get('auto-parts', id);
  }

  private async get<T>(resource: string, id: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers({ Accept: 'application/json' });
      if (this.apiKey) headers.set('Api-Key', this.apiKey);

      const response = await this.fetcher(
        `${this.baseUrl}/${resource}/${encodeURIComponent(id)}`,
        { headers, signal: controller.signal },
      );

      if (!response.ok) {
        throw new CatalogServiceError(resource, id, response.status);
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof CatalogServiceError) throw error;
      throw new CatalogServiceError(resource, id);
    } finally {
      clearTimeout(timeout);
    }
  }
}
