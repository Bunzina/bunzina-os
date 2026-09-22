CREATE TABLE IF NOT EXISTS bunzina.saga_instances (
  service_order_id UUID               PRIMARY KEY REFERENCES bunzina.service_orders(id) ON DELETE CASCADE,
  status           bunzina.saga_status NOT NULL DEFAULT 'RUNNING',
  current_step     TEXT               NOT NULL,
  completed_steps  JSONB              NOT NULL DEFAULT '[]'::jsonb,
  step_deadline_at TIMESTAMPTZ,
  last_error       TEXT,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saga_instances_status ON bunzina.saga_instances(status);

CREATE INDEX IF NOT EXISTS idx_saga_instances_deadline
  ON bunzina.saga_instances(step_deadline_at)
  WHERE status IN ('RUNNING', 'COMPENSATING');
