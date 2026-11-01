import type { SagaInstanceRepository } from '@/domain/saga/repositories/saga-instance-repository';
import type { SagaOrchestrator } from './saga-orchestrator';

export class SagaTimeoutWorker {
  constructor(
    private readonly sagaRepository: SagaInstanceRepository,
    private readonly orchestrator: SagaOrchestrator,
  ) {}

  async runOnce(now = new Date()): Promise<number> {
    const expiredSagas = await this.sagaRepository.findExpired(now);

    for (const saga of expiredSagas) {
      await this.orchestrator.handleTimeout(saga);
    }

    return expiredSagas.length;
  }
}
