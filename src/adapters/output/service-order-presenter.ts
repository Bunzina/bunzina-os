import type { ServiceOrder } from '@/domain/service-order/entities/service-order';

export const serviceOrderToResponse = (order: ServiceOrder) => ({
  id: order.id!,
  customerId: order.customerId,
  customerSnapshot: order.customerSnapshot,
  vehicleId: order.vehicleId,
  vehicleSnapshot: order.vehicleSnapshot,
  status: order.status,
  serviceItems: order.serviceItems.map((item) => ({
    id: item.id!,
    serviceId: item.serviceId,
    price: item.price.value,
    description: item.description,
    isCompleted: item.isCompleted,
    finishedAt: item.finishedAt,
    executionTimeMs: item.executionTimeMs,
  })),
  autoPartItems: order.autoPartItems.map((item) => ({
    id: item.id!,
    autoPartId: item.autoPartId,
    quantity: item.quantity,
    unitPrice: item.unitPrice.value,
    totalPrice: item.totalPrice?.value,
    description: item.description,
  })),
  quote: {
    servicesTotal: order.quote.servicesTotal,
    autoPartsTotal: order.quote.autoPartsTotal,
    total: order.quote.total,
  },
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  approvedAt: order.approvedAt,
  paidAt: order.paidAt,
  startedAt: order.startedAt,
  completedAt: order.completedAt,
  deliveredAt: order.deliveredAt,
});
