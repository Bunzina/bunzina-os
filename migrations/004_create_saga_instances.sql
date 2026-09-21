-- Estado da saga orquestrada (ADR 0013). O id da ordem de serviço é o
-- correlation id de todo o fluxo, então é também a chave desta tabela.
--
-- completed_steps guarda os passos JÁ concluídos, não apenas o atual: o
-- conjunto de compensações a emitir depende de até onde a saga chegou.
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

-- O job de timeout varre os prazos vencidos por aqui. Sem índice parcial, essa
-- varredura passa a ler a tabela inteira conforme o histórico cresce.
CREATE INDEX IF NOT EXISTS idx_saga_instances_deadline
  ON bunzina.saga_instances(step_deadline_at)
  WHERE status IN ('RUNNING', 'COMPENSATING');
