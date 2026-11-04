-- JUNJA Premium Store: independently durable purchase history.
-- This schema is intentionally NOT imported by the live game startup or snapshot loader.
-- Deploy only to an isolated PG store after legal + PG approval. Test infrastructure may create it.
CREATE TABLE IF NOT EXISTS premium_store_orders (
  order_id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL CHECK (user_id > 0),
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 12 AND 96),
  product_id TEXT NOT NULL,
  amount_krw INTEGER NOT NULL CHECK (amount_krw > 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING','PAID','REFUNDED')),
  provider_payment_key TEXT UNIQUE,
  created_ms BIGINT NOT NULL,
  paid_ms BIGINT,
  refunded_ms BIGINT,
  UNIQUE (user_id, request_id),
  CHECK ((status = 'PENDING' AND paid_ms IS NULL AND refunded_ms IS NULL AND provider_payment_key IS NULL)
      OR (status = 'PAID' AND paid_ms IS NOT NULL AND refunded_ms IS NULL AND provider_payment_key IS NOT NULL)
      OR (status = 'REFUNDED' AND paid_ms IS NOT NULL AND refunded_ms IS NOT NULL AND provider_payment_key IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS premium_store_orders_user_idx
  ON premium_store_orders (user_id, created_ms DESC);
CREATE INDEX IF NOT EXISTS premium_store_orders_pending_idx
  ON premium_store_orders (created_ms) WHERE status='PENDING';

CREATE TABLE IF NOT EXISTS premium_store_entitlements (
  user_id BIGINT NOT NULL CHECK (user_id > 0),
  product_id TEXT NOT NULL,
  source_order_id TEXT NOT NULL REFERENCES premium_store_orders(order_id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','REVOKED')),
  granted_ms BIGINT NOT NULL,
  revoked_ms BIGINT,
  PRIMARY KEY (user_id,product_id),
  CHECK ((status='ACTIVE' AND revoked_ms IS NULL) OR (status='REVOKED' AND revoked_ms IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS premium_store_entitlements_order_idx
  ON premium_store_entitlements(source_order_id);

CREATE TABLE IF NOT EXISTS premium_store_events (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES premium_store_orders(order_id) ON DELETE RESTRICT,
  user_id BIGINT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('ORDER_CREATED','PAYMENT_APPROVED','REFUND_CONFIRMED')),
  created_ms BIGINT NOT NULL,
  UNIQUE(order_id,event_type)
);
CREATE INDEX IF NOT EXISTS premium_store_events_created_idx
  ON premium_store_events (created_ms DESC);
