ALTER TABLE bunzina.saga_instances
  ADD COLUMN IF NOT EXISTS quote_id UUID,
  ADD COLUMN IF NOT EXISTS payment_id UUID,
  ADD COLUMN IF NOT EXISTS payment_amount_cents INTEGER;