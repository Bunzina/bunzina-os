import { describe, expect, test } from 'bun:test';
import { Price } from '@/domain/core/value-objects/price';
import { AutoPartItem } from '@/domain/service-order/entities/auto-part-item';
import { ServiceItem } from '@/domain/service-order/entities/service-item';
import { ServiceOrder } from '@/domain/service-order/entities/service-order';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { Quote } from '@/domain/service-order/value-objects/quote';
import type { Envelope } from '@/infrastructure/messaging/envelope';
import {
  buildChargeCommand,
  buildIssueQuoteCommand,
  buildStartDiagnosticCommand,
  buildStartExecutionCommand,
} from './commands';

const order = () =>
  new ServiceOrder({
    id: '11111111-1111-4111-8111-111111111111',
    customerId: '22222222-2222-4222-8222-222222222222',
    customerSnapshot: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Ana Souza',
      document: '12345678901',
      email: 'ana@example.com',
    },
    vehicleId: '33333333-3333-4333-8333-333333333333',
    vehicleSnapshot: {
      id: '33333333-3333-4333-8333-333333333333',
      plate: 'ABC1D23',
      model: 'Gol',
    },
    status: ServiceOrderStatus.RECEIVED,
    serviceItems: [
      new ServiceItem({
        id: '44444444-4444-4444-8444-444444444444',
        serviceId: '55555555-5555-4555-8555-555555555555',
        price: new Price(150),
        description: 'Troca de oleo',
      }),
    ],
    autoPartItems: [
      new AutoPartItem({
        id: '66666666-6666-4666-8666-666666666666',
        autoPartId: '77777777-7777-4777-8777-777777777777',
        quantity: 2,
        unitPrice: new Price(50),
        totalPrice: new Price(100),
        description: 'Filtro de oleo',
      }),
    ],
    quote: new Quote({ servicesTotal: 150, autoPartsTotal: 100 }),
  });

const envelopeBase = (eventType: string, data: Record<string, unknown>) => ({
  eventId: expect.any(String),
  eventType,
  eventVersion: 1,
  occurredAt: expect.any(String),
  producer: expect.any(String),
  correlationId: '11111111-1111-4111-8111-111111111111',
  data,
});

describe('saga command factories', () => {
  test('should build diagnostic and quote commands', () => {
    const serviceOrder = order();
    const causationId = '88888888-8888-4888-8888-888888888888';
    const diagnostic = buildStartDiagnosticCommand(serviceOrder, causationId);
    const quote = buildIssueQuoteCommand(serviceOrder, causationId);

    expect(diagnostic).toEqual({
      ...envelopeBase('cmd.workshop.start-diagnostic', {
        serviceOrderId: serviceOrder.id,
        vehicle: { id: serviceOrder.vehicleId, plate: 'ABC1D23', model: 'Gol' },
        requestedItems: {
          services: [
            {
              serviceId: '55555555-5555-4555-8555-555555555555',
              description: 'Troca de oleo',
              priceCents: 15000,
            },
          ],
          autoParts: [
            {
              autoPartId: '77777777-7777-4777-8777-777777777777',
              description: 'Filtro de oleo',
              quantity: 2,
              unitPriceCents: 5000,
            },
          ],
        },
        currency: 'BRL',
      }),
      causationId,
    } as unknown as Envelope);
    expect(quote.eventType).toBe('cmd.billing.issue-quote');
    expect(quote.data).toEqual({
      serviceOrderId: serviceOrder.id,
      customer: {
        id: serviceOrder.customerId,
        name: 'Ana Souza',
        document: '12345678901',
        email: 'ana@example.com',
      },
      items: expect.any(Object),
      currency: 'BRL',
    });
  });

  test('should build charge and execution commands', () => {
    const serviceOrder = order();
    const charge = buildChargeCommand({
      order: serviceOrder,
      quoteId: '88888888-8888-4888-8888-888888888888',
    });
    const execution = buildStartExecutionCommand(serviceOrder);

    expect(charge).toEqual({
      ...envelopeBase('cmd.billing.charge', {
        serviceOrderId: serviceOrder.id,
        quoteId: '88888888-8888-4888-8888-888888888888',
        totalCents: 25000,
        currency: 'BRL',
        customer: {
          id: serviceOrder.customerId,
          name: 'Ana Souza',
          document: '12345678901',
          email: 'ana@example.com',
        },
      }),
    } as unknown as Envelope);
    expect(execution.eventType).toBe('cmd.workshop.start-execution');
    expect(execution.data).toEqual({
      serviceOrderId: serviceOrder.id,
      items: expect.any(Object),
    });
  });

  test('should reject commands without required snapshots', () => {
    const serviceOrder = order();
    serviceOrder.customerSnapshot = undefined;
    expect(() => buildIssueQuoteCommand(serviceOrder)).toThrow(
      'Customer snapshot is required',
    );

    serviceOrder.customerSnapshot = order().customerSnapshot;
    serviceOrder.vehicleSnapshot = undefined;
    expect(() => buildStartDiagnosticCommand(serviceOrder)).toThrow(
      'Vehicle snapshot is required',
    );
  });
});
