-- Cliente e veículo são snapshot desnormalizado, copiado na criação da ordem
-- (ADR 0012). Não há chave estrangeira: os dados são do banco do serviço de
-- Cadastros, e nenhum serviço acessa o banco de outro. As cópias valem para o
-- instante do evento e não devem ser sincronizadas.
CREATE TABLE IF NOT EXISTS bunzina.service_orders (
  id                     UUID                         PRIMARY KEY,

  customer_id            UUID                         NOT NULL,
  customer_name          TEXT                         NOT NULL,
  customer_document      TEXT                         NOT NULL,
  customer_email         TEXT,

  vehicle_id             UUID                         NOT NULL,
  vehicle_plate          TEXT                         NOT NULL,
  vehicle_model          TEXT,

  status                 bunzina.service_order_status NOT NULL DEFAULT 'RECEIVED',

  quote_services_total   NUMERIC(10, 2)               NOT NULL DEFAULT 0 CHECK (quote_services_total >= 0),
  quote_auto_parts_total NUMERIC(10, 2)               NOT NULL DEFAULT 0 CHECK (quote_auto_parts_total >= 0),
  quote_total            NUMERIC(10, 2)               NOT NULL DEFAULT 0 CHECK (quote_total >= 0),

  created_at             TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  approved_at            TIMESTAMPTZ,
  paid_at                TIMESTAMPTZ,
  started_at             TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ,
  delivered_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_orders_customer_id ON bunzina.service_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_customer_document ON bunzina.service_orders(customer_document);
CREATE INDEX IF NOT EXISTS idx_service_orders_vehicle_id  ON bunzina.service_orders(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_status      ON bunzina.service_orders(status);
