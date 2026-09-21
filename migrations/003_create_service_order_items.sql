CREATE TABLE IF NOT EXISTS bunzina.service_order_service_items (
  id                UUID           PRIMARY KEY,
  service_order_id  UUID           NOT NULL REFERENCES bunzina.service_orders(id) ON DELETE CASCADE,
  service_id        UUID           NOT NULL,
  price             NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  description       TEXT,
  is_completed      BOOLEAN        NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  execution_time_ms BIGINT
);

CREATE INDEX IF NOT EXISTS idx_so_service_items_order_id ON bunzina.service_order_service_items(service_order_id);
CREATE INDEX IF NOT EXISTS idx_so_service_items_order_id_is_completed ON bunzina.service_order_service_items(service_order_id, is_completed);

CREATE TABLE IF NOT EXISTS bunzina.service_order_auto_part_items (
  id               UUID           PRIMARY KEY,
  service_order_id UUID           NOT NULL REFERENCES bunzina.service_orders(id) ON DELETE CASCADE,
  auto_part_id     UUID           NOT NULL,
  quantity         INTEGER        NOT NULL CHECK (quantity > 0),
  unit_price       NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
  total_price      NUMERIC(10, 2)          CHECK (total_price >= 0),
  description      TEXT
);

CREATE INDEX IF NOT EXISTS idx_so_auto_part_items_order_id ON bunzina.service_order_auto_part_items(service_order_id);
