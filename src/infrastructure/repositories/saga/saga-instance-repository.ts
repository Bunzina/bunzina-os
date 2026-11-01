import type { SQL } from 'bun';
import type { SagaInstance } from '@/domain/saga/entities/saga-instance';
import type { SagaInstanceRepository as SagaInstanceRepositoryPort } from '@/domain/saga/repositories/saga-instance-repository';
import type { SagaInstanceDbSchema } from './saga-instance-mapper';
import { SagaInstanceMapper } from './saga-instance-mapper';

export class SagaInstanceRepository implements SagaInstanceRepositoryPort {
  constructor(private readonly client: SQL) {}

  async findByServiceOrderId(
    serviceOrderId: string,
  ): Promise<SagaInstance | null> {
    const [record] = await this.client<SagaInstanceDbSchema[]>`
      SELECT *
      FROM bunzina.saga_instances
      WHERE service_order_id = ${serviceOrderId}
      LIMIT 1
    `;

    return record ? SagaInstanceMapper.toDomain(record) : null;
  }

  async create(saga: SagaInstance): Promise<SagaInstance> {
    const record = SagaInstanceMapper.toDatabase(saga);

    await this.client`
      INSERT INTO bunzina.saga_instances (
        service_order_id,
        status,
        current_step,
        completed_steps,
        step_deadline_at,
        last_error,
        created_at,
        updated_at
      ) VALUES (
        ${record.service_order_id},
        ${record.status},
        ${record.current_step},
        ${JSON.stringify(record.completed_steps)},
        ${record.step_deadline_at},
        ${record.last_error},
        ${record.created_at},
        ${record.updated_at}
      )
    `;

    return saga;
  }

  async update(saga: SagaInstance): Promise<SagaInstance> {
    const record = SagaInstanceMapper.toDatabase(saga);

    await this.client`
      UPDATE bunzina.saga_instances
      SET status = ${record.status},
          current_step = ${record.current_step},
          completed_steps = ${JSON.stringify(record.completed_steps)},
          step_deadline_at = ${record.step_deadline_at},
          last_error = ${record.last_error},
          updated_at = ${record.updated_at}
      WHERE service_order_id = ${record.service_order_id}
    `;

    return saga;
  }
}
