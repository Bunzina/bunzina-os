CREATE SCHEMA IF NOT EXISTS bunzina;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_order_status') THEN
    CREATE TYPE bunzina.service_order_status AS ENUM (
      'RECEIVED',
      'IN_DIAGNOSTIC',
      'AWAITING_APPROVAL',
      'AWAITING_PAYMENT',
      'IN_EXECUTION',
      'COMPLETED',
      'DELIVERED',
      'CANCELED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'saga_status') THEN
    CREATE TYPE bunzina.saga_status AS ENUM (
      'RUNNING',
      'COMPENSATING',
      'COMPLETED',
      'FAILED'
    );
  END IF;
END $$;
