import type { CatalogService } from '@/application/ports/catalog-service';
import type {
  CustomerSnapshot,
  VehicleSnapshot,
} from '@/domain/service-order/entities/service-order';

const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 1000;

class CatalogTransportError extends Error {}

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
  /** Retries after the first request; values above five are capped. */
  maxRetries?: number;
  /** Initial exponential-backoff delay in milliseconds. */
  retryDelayMs?: number;
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
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetcher: CatalogFetcher;

  constructor(options: HttpCatalogServiceOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env.CATALOG_SERVICE_URL ??
      'http://localhost:3001'
    ).replace(/\/$/, '');
    this.apiKey = options.apiKey ?? process.env.CATALOG_SERVICE_API_KEY;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.maxRetries = normalizeInteger(
      options.maxRetries,
      DEFAULT_MAX_RETRIES,
      0,
      MAX_RETRIES,
    );
    this.retryDelayMs = normalizeInteger(
      options.retryDelayMs,
      DEFAULT_RETRY_DELAY_MS,
      0,
      MAX_RETRY_DELAY_MS,
    );
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
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.getOnce<T>(resource, id);
      } catch (error) {
        const shouldRetry =
          error instanceof CatalogTransportError ||
          (error instanceof CatalogServiceError &&
            isRetryableStatus(error.status));

        if (!shouldRetry || attempt >= this.maxRetries) {
          if (error instanceof CatalogTransportError) {
            throw new CatalogServiceError(resource, id);
          }
          throw error;
        }

        await delay(
          Math.min(this.retryDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS),
        );
      }
    }
  }

  private async getOnce<T>(resource: string, id: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers({ Accept: 'application/json' });
      if (this.apiKey) headers.set('Api-Key', this.apiKey);

      let response: Response;
      try {
        response = await this.fetcher(
          `${this.baseUrl}/${resource}/${encodeURIComponent(id)}`,
          { headers, signal: controller.signal },
        );
      } catch {
        throw new CatalogTransportError();
      }

      if (!response.ok) {
        throw new CatalogServiceError(resource, id, response.status);
      }

      try {
        return (await response.json()) as T;
      } catch {
        throw new CatalogServiceError(resource, id);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

const isRetryableStatus = (status?: number): boolean =>
  status === 408 ||
  status === 429 ||
  (status !== undefined && status >= 500 && status < 600);

const normalizeInteger = (
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
