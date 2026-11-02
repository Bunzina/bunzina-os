import logger from '@lucas-pmelo/logger';
import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import type { SagaInstance } from '@/domain/saga/entities/saga-instance';
import type { SagaOrchestrator } from './saga-orchestrator';

export type SagaTimeoutHandler = (
  saga: SagaInstance,
  now: Date,
) => Promise<void>;

export class SagaTimeoutWorker {
  private running = false;

  constructor(
    private readonly sagaRepository: SagaInstanceRepository,
    private readonly orchestrator: SagaOrchestrator,
    private readonly handleExpiredSaga: SagaTimeoutHandler = (saga) =>
      orchestrator.handleTimeout(saga),
  ) {}

  async runOnce(now = new Date()): Promise<number> {
    if (this.running) return 0;

    this.running = true;
    try {
      const expiredSagas = await this.sagaRepository.findExpired(now);

      for (const saga of expiredSagas) {
        try {
          await this.handleExpiredSaga(saga, now);
        } catch (error) {
          logger.error({
            message: 'Failed to handle expired saga',
            serviceOrderId: saga.serviceOrderId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return expiredSagas.length;
    } finally {
      this.running = false;
    }
  }

  start(intervalMs = 1000): ReturnType<typeof setInterval> {
    return setInterval(() => {
      void this.runOnce().catch((error) => {
        logger.error({
          message: 'Failed to poll expired sagas',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, intervalMs);
  }
}
