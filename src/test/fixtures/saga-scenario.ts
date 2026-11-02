import { Price } from '@/domain/core/value-objects/price';
import { AutoPartItem } from '@/domain/service-order/entities/auto-part-item';
import { ServiceItem } from '@/domain/service-order/entities/service-item';
import { ServiceOrder } from '@/domain/service-order/entities/service-order';
import type { ServiceOrderRepository } from '@/domain/service-order/repositories/service-order-repository';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import { Quote } from '@/domain/service-order/value-objects/quote';
import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import { SagaOrchestrator } from '@/application/saga/saga-orchestrator';
import { createSagaEventHandlers } from '@/application/saga/saga-event-handlers';
import {
  buildEnvelope,
  type Envelope,
} from '@/infrastructure/messaging/envelope';

export const serviceOrderId = '11111111-1111-4111-8111-111111111111';
export const customerId = '22222222-2222-4222-8222-222222222222';
export const vehicleId = '33333333-3333-4333-8333-333333333333';
export const serviceId = '44444444-4444-4444-8444-444444444444';
export const autoPartId = '55555555-5555-4555-8555-555555555555';
export const quoteId = '66666666-6666-4666-8666-666666666666';
export const paymentId = '77777777-7777-4777-8777-777777777777';

export const makeServiceOrder = (
  status = ServiceOrderStatus.RECEIVED,
): ServiceOrder =>
  new ServiceOrder({
    id: serviceOrderId,
    customerId,
    customerSnapshot: {
      id: customerId,
      name: 'Ana Souza',
      document: '12345678901',
      email: 'ana@example.com',
    },
    vehicleId,
    vehicleSnapshot: { id: vehicleId, plate: 'ABC1D23', model: 'Gol' },
    status,
    serviceItems: [new ServiceItem({ serviceId, price: new Price(150) })],
    autoPartItems: [
      new AutoPartItem({
        autoPartId,
        quantity: 1,
        unitPrice: new Price(50),
        totalPrice: new Price(50),
      }),
    ],
    quote: new Quote({ servicesTotal: 150, autoPartsTotal: 50 }),
  });

export class SagaScenario {
  order = makeServiceOrder();
  saga: SagaInstance | null = null;
  readonly commands: Envelope[] = [];
  readonly sagaRepository: SagaInstanceRepository = {
    findByServiceOrderId: async () => this.saga,
    findExpired: async (now) =>
      this.saga?.stepDeadlineAt && this.saga.stepDeadlineAt <= now
        ? [this.saga]
        : [],
    claimExpired: async () => null,
    create: async (saga) => {
      this.saga = saga;
      return saga;
    },
    update: async (saga) => {
      this.saga = saga;
      return saga;
    },
  };
  readonly serviceOrderRepository = {
    findById: async () => this.order,
    update: async (order: ServiceOrder) => {
      this.order = order;
      return order;
    },
  } as unknown as ServiceOrderRepository;
  readonly orchestrator = new SagaOrchestrator(
    this.sagaRepository,
    this.serviceOrderRepository,
    async (command) => {
      this.commands.push(command);
    },
  );
  readonly handlers = createSagaEventHandlers(this.orchestrator);

  async start(): Promise<void> {
    await this.orchestrator.start(this.order);
  }

  async send<TData extends Record<string, unknown>>(
    eventType: keyof typeof this.handlers,
    data: TData,
  ): Promise<void> {
    const envelope = buildEnvelope({
      eventType,
      correlationId: serviceOrderId,
      data,
    });
    await this.handlers[eventType](envelope);
  }

  expireCurrentStep(): void {
    if (!this.saga) throw new Error('Scenario has not started');
    this.saga.setStepDeadline(new Date(0));
  }
}
