import type { Envelope } from '@/infrastructure/messaging/envelope';
import { buildEnvelope } from '@/infrastructure/messaging/envelope';
import type { ServiceOrder } from '@/domain/service-order/entities/service-order';

const DEFAULT_CURRENCY = 'BRL';

const toCents = (value: number): number => Math.round(value * 100);

const requireCustomerSnapshot = (order: ServiceOrder) => {
  if (!order.customerSnapshot) {
    throw new Error('Customer snapshot is required to publish a saga command');
  }

  return order.customerSnapshot;
};

const requireVehicleSnapshot = (order: ServiceOrder) => {
  if (!order.vehicleSnapshot) {
    throw new Error('Vehicle snapshot is required to publish a saga command');
  }

  return order.vehicleSnapshot;
};

const mapItems = (order: ServiceOrder) => ({
  services: order.serviceItems.map((item) => ({
    serviceId: item.serviceId,
    description: item.description ?? '',
    priceCents: toCents(item.price.value),
  })),
  autoParts: order.autoPartItems.map((item) => ({
    autoPartId: item.autoPartId,
    description: item.description ?? '',
    quantity: item.quantity,
    unitPriceCents: toCents(item.unitPrice.value),
  })),
});

export const buildStartDiagnosticCommand = (
  order: ServiceOrder,
  causationId?: string,
): Envelope => {
  const vehicle = requireVehicleSnapshot(order);

  return buildEnvelope({
    eventType: 'cmd.workshop.start-diagnostic',
    correlationId: order.id!,
    causationId,
    data: {
      serviceOrderId: order.id!,
      vehicle: {
        id: vehicle.id,
        plate: vehicle.plate,
        model: vehicle.model ?? '',
      },
      requestedItems: mapItems(order),
      currency: DEFAULT_CURRENCY,
    },
  });
};

export const buildIssueQuoteCommand = (
  order: ServiceOrder,
  causationId?: string,
): Envelope => {
  const customer = requireCustomerSnapshot(order);

  return buildEnvelope({
    eventType: 'cmd.billing.issue-quote',
    correlationId: order.id!,
    causationId,
    data: {
      serviceOrderId: order.id!,
      customer: {
        id: customer.id,
        name: customer.name,
        document: customer.document,
        email: customer.email ?? '',
      },
      items: mapItems(order),
      currency: DEFAULT_CURRENCY,
    },
  });
};

export const buildChargeCommand = ({
  order,
  quoteId,
  causationId,
}: {
  order: ServiceOrder;
  quoteId: string;
  causationId?: string;
}): Envelope => {
  const customer = requireCustomerSnapshot(order);

  return buildEnvelope({
    eventType: 'cmd.billing.charge',
    correlationId: order.id!,
    causationId,
    data: {
      serviceOrderId: order.id!,
      quoteId,
      totalCents: toCents(order.quote.total),
      currency: DEFAULT_CURRENCY,
      customer: {
        id: customer.id,
        name: customer.name,
        document: customer.document,
        email: customer.email ?? '',
      },
    },
  });
};

export const buildStartExecutionCommand = (
  order: ServiceOrder,
  causationId?: string,
): Envelope =>
  buildEnvelope({
    eventType: 'cmd.workshop.start-execution',
    correlationId: order.id!,
    causationId,
    data: {
      serviceOrderId: order.id!,
      items: {
        services: order.serviceItems.map((item) => ({
          serviceId: item.serviceId,
          description: item.description ?? '',
        })),
        autoParts: order.autoPartItems.map((item) => ({
          autoPartId: item.autoPartId,
          description: item.description ?? '',
          quantity: item.quantity,
        })),
      },
    },
  });
