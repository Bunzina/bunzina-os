import type { SQL } from 'bun';
import type { MessageProcessor } from '@/application/ports/message-processor';
import type { SagaObservability } from '@/application/ports/saga-observability';
import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import { SagaOrchestrator } from '@/application/saga/saga-orchestrator';
import { createSagaEventHandlers } from '@/application/saga/saga-event-handlers';
import { OutboxCommandPublisher } from '@/application/messaging/outbox-command-publisher';
import { OutboxRepository } from '@/infrastructure/repositories/outbox/outbox-repository';
import { ProcessedEventRepository } from '@/infrastructure/repositories/saga/processed-event-repository';
import { SagaInstanceRepository } from '@/infrastructure/repositories/saga/saga-instance-repository';
import { ServiceOrderRepository } from '@/infrastructure/repositories/service-order/service-order-repository';
import { sagaObservability } from '@/infrastructure/observability/metrics';
import type { Envelope } from './envelope';

export class BufferedSagaObservability implements SagaObservability {
  private readonly observations: Array<() => void> = [];

  constructor(
    private readonly delegate: SagaObservability = sagaObservability,
  ) {}

  recordState(saga: SagaInstance): void {
    const snapshot = new SagaInstance({ ...saga });
    this.observations.push(() => this.delegate.recordState(snapshot));
  }

  recordCompensation(reason: string): void {
    this.observations.push(() => this.delegate.recordCompensation(reason));
  }

  recordTimeout(step: Parameters<SagaObservability['recordTimeout']>[0]): void {
    this.observations.push(() => this.delegate.recordTimeout(step));
  }

  recordOutcome(
    saga: SagaInstance,
    outcome: Parameters<SagaObservability['recordOutcome']>[1],
  ): void {
    const snapshot = new SagaInstance({ ...saga });
    this.observations.push(() =>
      this.delegate.recordOutcome(snapshot, outcome),
    );
  }

  flush(): void {
    for (const record of this.observations) record();
  }
}

export class PostgresSagaEventProcessor implements MessageProcessor<Envelope> {
  constructor(
    private readonly client: SQL,
    private readonly consumer = 'bunzina-os',
  ) {}

  async process(envelope: Envelope): Promise<boolean> {
    const observations = new BufferedSagaObservability();
    let firstDelivery = false;

    await this.client.begin(async (transaction) => {
      const processedEvents = new ProcessedEventRepository(transaction);
      firstDelivery = await processedEvents.tryMarkProcessed(
        envelope.eventId,
        this.consumer,
      );

      if (!firstDelivery) return;

      const orchestrator = this.createOrchestrator(transaction, observations);
      const handler =
        createSagaEventHandlers(orchestrator)[
          envelope.eventType as keyof ReturnType<typeof createSagaEventHandlers>
        ];

      if (!handler) {
        throw new Error(`Unsupported saga event: ${envelope.eventType}`);
      }

      await handler(envelope);
    });

    if (firstDelivery) observations.flush();
    return firstDelivery;
  }

  async processTimeout(serviceOrderId: string, now: Date): Promise<boolean> {
    const observations = new BufferedSagaObservability();
    let handled = false;

    await this.client.begin(async (transaction) => {
      const sagaRepository = new SagaInstanceRepository(transaction);
      const saga = await sagaRepository.claimExpired(serviceOrderId, now);
      if (!saga) return;

      const orchestrator = this.createOrchestrator(transaction, observations);
      await orchestrator.handleTimeout(saga);
      handled = true;
    });

    if (handled) observations.flush();
    return handled;
  }

  private createOrchestrator(
    transaction: SQL,
    observations: SagaObservability,
  ): SagaOrchestrator {
    const sagaRepository = new SagaInstanceRepository(transaction);
    const serviceOrderRepository = new ServiceOrderRepository(
      transaction,
      true,
    );
    const outboxRepository = new OutboxRepository(transaction);
    const commandPublisher = new OutboxCommandPublisher(outboxRepository);

    return new SagaOrchestrator(
      sagaRepository,
      serviceOrderRepository,
      (command) => commandPublisher.publish(command),
      { observability: observations },
    );
  }
}
