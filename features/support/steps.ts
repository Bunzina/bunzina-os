import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { CreateServiceOrderUseCase } from '@/application/use-cases/service-order/create';
import { SagaTimeoutWorker } from '@/application/saga/saga-timeout-worker';
import { ServiceOrderStatus } from '@/domain/service-order/types/service-order-status';
import {
  autoPartId,
  customerId,
  paymentId,
  quoteId,
  SagaScenario,
  serviceId,
  serviceOrderId,
  vehicleId,
} from '@/test/fixtures/saga-scenario';

const diagnosticCompleted = {
  serviceOrderId,
  diagnosedItems: {
    services: [{ serviceId, description: 'Diagnóstico', priceCents: 20000 }],
    autoParts: [
      { autoPartId, description: 'Filtro', quantity: 1, unitPriceCents: 6000 },
    ],
  },
};
const quoteIssued = {
  serviceOrderId,
  quoteId,
  servicesTotalCents: 20000,
  autoPartsTotalCents: 6000,
};
const quoteApproved = {
  serviceOrderId,
  quoteId,
  approvedAt: '2026-10-25T10:00:00.000Z',
};
const paymentConfirmed = {
  serviceOrderId,
  paymentId,
  amountCents: 26000,
  paidAt: '2026-10-25T10:05:00.000Z',
};

type BddWorld = {
  scenario?: SagaScenario;
  order?: Awaited<ReturnType<CreateServiceOrderUseCase['execute']>>;
  createOrder?: CreateServiceOrderUseCase;
  expiredCount?: number;
};

const beginExecution = async (world: BddWorld) => {
  const scenario = world.scenario!;
  await scenario.send('evt.workshop.diagnostic-completed', diagnosticCompleted);
  await scenario.send('evt.billing.quote-issued', quoteIssued);
  await scenario.send('evt.billing.quote-approved', quoteApproved);
  await scenario.send('evt.billing.payment-confirmed', paymentConfirmed);
};

Given(
  'que o cliente e o veículo são conhecidos pelo catálogo',
  async function () {
    const repository = {
      create: async (order: NonNullable<BddWorld['order']>) => order,
    };
    const catalog = {
      getCustomer: async () => ({
        id: customerId,
        name: 'Ana Souza',
        document: '12345678901',
      }),
      getVehicle: async () => ({
        id: vehicleId,
        plate: 'ABC1D23',
        model: 'Gol',
      }),
      assertServiceExists: async () => undefined,
      assertAutoPartExists: async () => undefined,
    };
    (this as BddWorld).createOrder = new CreateServiceOrderUseCase(
      repository as never,
      catalog,
    );
  },
);

When(
  'o cliente abre uma ordem com um serviço de 150 reais e uma peça de 2 unidades a 50 reais cada',
  async function () {
    (this as BddWorld).order = await (this as BddWorld).createOrder!.execute({
      customerId,
      vehicleId,
      serviceItems: [{ serviceId, price: 150, description: 'Revisão' }],
      autoPartItems: [
        { autoPartId, quantity: 2, unitPrice: 50, description: 'Filtro' },
      ],
    });
  },
);

Then(
  'a ordem fica recebida com orçamento preliminar de {int} reais',
  function (total: number) {
    const order = (this as BddWorld).order!;
    assert.equal(order.status, ServiceOrderStatus.RECEIVED);
    assert.equal(order.quote.total, total);
  },
);

Given('que uma ordem iniciou o diagnóstico', async function () {
  const scenario = new SagaScenario();
  await scenario.start();
  (this as BddWorld).scenario = scenario;
});

When('a oficina conclui o diagnóstico', async function () {
  await (this as BddWorld).scenario!.send(
    'evt.workshop.diagnostic-completed',
    diagnosticCompleted,
  );
});

Then('Billing recebe o pedido de orçamento', function () {
  assert.equal(
    (this as BddWorld).scenario!.commands.at(-1)?.eventType,
    'cmd.billing.issue-quote',
  );
});

When('Billing emite o orçamento', async function () {
  await (this as BddWorld).scenario!.send(
    'evt.billing.quote-issued',
    quoteIssued,
  );
});

When('o cliente aprova o orçamento', async function () {
  await (this as BddWorld).scenario!.send(
    'evt.billing.quote-approved',
    quoteApproved,
  );
});

Then('Billing recebe o pedido de cobrança', function () {
  assert.equal(
    (this as BddWorld).scenario!.commands.at(-1)?.eventType,
    'cmd.billing.charge',
  );
});

When('o pagamento é confirmado', async function () {
  await (this as BddWorld).scenario!.send(
    'evt.billing.payment-confirmed',
    paymentConfirmed,
  );
});

Then('Workshop recebe o pedido de execução', function () {
  assert.equal(
    (this as BddWorld).scenario!.commands.at(-1)?.eventType,
    'cmd.workshop.start-execution',
  );
});

When('Workshop conclui a execução', async function () {
  await (this as BddWorld).scenario!.send('evt.workshop.execution-completed', {
    serviceOrderId,
    completedItems: [
      {
        serviceId,
        finishedAt: '2026-10-25T11:00:00.000Z',
        executionTimeMs: 3600000,
      },
    ],
    completedAt: '2026-10-25T11:00:00.000Z',
  });
});

Then('a ordem fica concluída', function () {
  assert.equal(
    (this as BddWorld).scenario!.order.status,
    ServiceOrderStatus.COMPLETED,
  );
});

When('o cliente recusa o orçamento', async function () {
  await (this as BddWorld).scenario!.send('evt.billing.quote-rejected', {
    serviceOrderId,
    quoteId,
    reason: 'CUSTOMER_REQUEST',
    detail: 'O cliente recusou o orçamento',
    rejectedBy: '12345678901',
  });
});

When(
  'a oficina informa que o veículo não pode ser reparado',
  async function () {
    await (this as BddWorld).scenario!.send('evt.workshop.diagnostic-failed', {
      serviceOrderId,
      reason: 'UNREPAIRABLE',
      detail: 'O veículo não pode ser reparado',
    });
  },
);

Then('a ordem volta a recebida sem compensação', function () {
  const scenario = (this as BddWorld).scenario!;
  assert.equal(scenario.order.status, ServiceOrderStatus.RECEIVED);
  assert.deepEqual(
    scenario.commands.map(({ eventType }) => eventType),
    ['cmd.workshop.start-diagnostic', 'cmd.billing.issue-quote'],
  );
});

Given('que o orçamento de uma ordem foi aprovado', async function () {
  const scenario = new SagaScenario();
  await scenario.start();
  await scenario.send('evt.workshop.diagnostic-completed', diagnosticCompleted);
  await scenario.send('evt.billing.quote-issued', quoteIssued);
  await scenario.send('evt.billing.quote-approved', quoteApproved);
  (this as BddWorld).scenario = scenario;
});

When('Billing informa que o pagamento falhou', async function () {
  await (this as BddWorld).scenario!.send('evt.billing.payment-failed', {
    serviceOrderId,
    quoteId,
    reason: 'EXPIRED',
    detail: 'O prazo de pagamento expirou',
  });
});

Then('Billing recebe o pedido de cancelamento do orçamento', function () {
  assert.equal(
    (this as BddWorld).scenario!.commands.at(-1)?.eventType,
    'cmd.billing.cancel-quote',
  );
});

When('Billing confirma o cancelamento do orçamento', async function () {
  await (this as BddWorld).scenario!.send('evt.billing.quote-canceled', {
    serviceOrderId,
    quoteId,
  });
});

Then('a ordem fica cancelada', function () {
  assert.equal(
    (this as BddWorld).scenario!.order.status,
    ServiceOrderStatus.CANCELED,
  );
});

Given(
  'que o pagamento de uma ordem foi confirmado e a execução começou',
  async function () {
    const scenario = new SagaScenario();
    await scenario.start();
    (this as BddWorld).scenario = scenario;
    await beginExecution(this as BddWorld);
  },
);

When('a oficina informa que a execução falhou', async function () {
  await (this as BddWorld).scenario!.send('evt.workshop.execution-failed', {
    serviceOrderId,
    reason: 'PART_UNAVAILABLE',
    detail: 'A peça necessária está indisponível',
  });
});

Then('o prazo dispara o aborto da execução na oficina', function () {
  assert.equal(
    (this as BddWorld).scenario!.commands.at(-1)?.eventType,
    'cmd.workshop.abort',
  );
});

When('Workshop confirma o aborto da execução', async function () {
  await (this as BddWorld).scenario!.send('evt.workshop.execution-aborted', {
    serviceOrderId,
  });
});

Then('Billing recebe o pedido de estorno pelo valor pago', function () {
  const command = (this as BddWorld).scenario!.commands.at(-1)!;
  assert.equal(command.eventType, 'cmd.billing.refund');
  assert.equal(command.data.amountCents, 26000);
  assert.equal(command.data.paymentId, paymentId);
});

When('Billing confirma o estorno', async function () {
  await (this as BddWorld).scenario!.send('evt.billing.payment-refunded', {
    serviceOrderId,
    paymentId,
  });
});

When('o prazo da etapa atual expira', async function () {
  const world = this as BddWorld;
  world.scenario!.expireCurrentStep();
  const worker = new SagaTimeoutWorker(
    world.scenario!.sagaRepository,
    world.scenario!.orchestrator,
  );
  world.expiredCount = await worker.runOnce(new Date());
});

Then('Workshop recebe o pedido de aborto', function () {
  assert.equal(
    (this as BddWorld).scenario!.commands.at(-1)?.eventType,
    'cmd.workshop.abort',
  );
});

Given('que Billing emitiu um orçamento para uma ordem', async function () {
  const scenario = new SagaScenario();
  await scenario.start();
  await scenario.send('evt.workshop.diagnostic-completed', diagnosticCompleted);
  await scenario.send('evt.billing.quote-issued', quoteIssued);
  (this as BddWorld).scenario = scenario;
});

Then('o prazo dispara o cancelamento do orçamento', function () {
  assert.equal(
    (this as BddWorld).scenario!.commands.at(-1)?.eventType,
    'cmd.billing.cancel-quote',
  );
});
