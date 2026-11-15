import { describe, expect, test } from 'bun:test';
import { SagaInstance } from '@/domain/saga/entities/saga-instance';
import { SagaStatus } from '@/domain/saga/types/saga-status';
import { SagaStep } from '@/domain/saga/types/saga-step';
import { makeMockSql } from '@/test/fixtures/mock-sql';
import { SagaInstanceRepository } from './saga-instance-repository';

const serviceOrderId = '11111111-1111-4111-8111-111111111111';
const createdAt = new Date('2026-01-01T00:00:00.000Z');

const sagaRecord = () => ({
  service_order_id: serviceOrderId,
  status: SagaStatus.RUNNING,
  current_step: SagaStep.DIAGNOSTIC,
  completed_steps: [SagaStep.QUOTE],
  step_deadline_at: new Date('2026-01-01T00:05:00.000Z'),
  last_error: null,
  quote_id: null,
  payment_id: null,
  payment_amount_cents: null,
  created_at: createdAt,
  updated_at: createdAt,
});

const makeSaga = () =>
  new SagaInstance({
    serviceOrderId,
    status: SagaStatus.RUNNING,
    currentStep: SagaStep.DIAGNOSTIC,
    completedSteps: [SagaStep.QUOTE],
    stepDeadlineAt: new Date('2026-01-01T00:05:00.000Z'),
    createdAt,
    updatedAt: createdAt,
  });

describe('saga instance repository', () => {
  test('finds a saga by service order id or returns null', async () => {
    const { client } = makeMockSql([[sagaRecord()], []]);
    const repository = new SagaInstanceRepository(client);

    await expect(
      repository.findByServiceOrderId(serviceOrderId),
    ).resolves.toEqual(makeSaga());
    await expect(repository.findByServiceOrderId(serviceOrderId)).resolves.toBe(
      null,
    );
  });

  test('returns expired sagas', async () => {
    const { client, queries } = makeMockSql([[sagaRecord()]]);

    const result = await new SagaInstanceRepository(client).findExpired(
      new Date('2026-01-01T00:10:00.000Z'),
    );

    expect(result).toEqual([makeSaga()]);
    expect(queries[0]).toContain('step_deadline_at <= ?');
  });

  test('claims an expired saga or returns null', async () => {
    const { client } = makeMockSql([[sagaRecord()], []]);
    const repository = new SagaInstanceRepository(client);
    const now = new Date('2026-01-01T00:10:00.000Z');

    await expect(repository.claimExpired(serviceOrderId, now)).resolves.toEqual(
      makeSaga(),
    );
    await expect(repository.claimExpired(serviceOrderId, now)).resolves.toBe(
      null,
    );
  });

  test('creates and updates saga records', async () => {
    const { client, queries } = makeMockSql();
    const repository = new SagaInstanceRepository(client);
    const saga = makeSaga();

    await expect(repository.create(saga)).resolves.toBe(saga);
    await expect(repository.update(saga)).resolves.toBe(saga);

    expect(queries[0]).toContain('INSERT INTO bunzina.saga_instances');
    expect(queries[1]).toContain('UPDATE bunzina.saga_instances');
  });
});
