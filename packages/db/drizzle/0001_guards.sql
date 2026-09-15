-- GymOS — database guards. HAND-WRITTEN AND PERMANENT.
--
-- `drizzle-kit generate` must never regenerate or overwrite this file (D-005).
-- It contains everything the Drizzle schema cannot express: tenant isolation,
-- the ledger balance invariant, and append-only enforcement.
--
-- Requires PostgreSQL 15+ (security_invoker views).

-- ═══════════════════════════════════════════════════════════════════
-- 1. Tenant isolation
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$fn$;
--> statement-breakpoint

-- The application role. NOBYPASSRLS is the whole point: a table owner bypasses
-- every policy silently, which is how RLS ends up enabled and doing nothing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gymos_app') THEN
    CREATE ROLE gymos_app LOGIN PASSWORD 'gymos_app' NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO gymos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gymos_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gymos_app;
--> statement-breakpoint

-- Uniform org_id policy across every tenant-scoped table.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'location','staff','session','person','plan','membership','membership_freeze',
    'ledger_account','ledger_transaction','ledger_entry','payment','idempotency_key',
    'mandate','collection_attempt','access_snapshot','check_in','device',
    'locker','locker_assignment','product','stock_movement','pos_sale',
    'event','scheduled_trigger','automation','automation_run',
    'message','sms_credit_ledger','risk_score','import_batch','audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id())',
      t);
  END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organization FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON organization;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON organization USING (id = current_org_id());
--> statement-breakpoint

-- Child tables reached only via a parent (no org_id of their own).
ALTER TABLE pos_sale_line ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pos_sale_line FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON pos_sale_line;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON pos_sale_line
  USING (EXISTS (SELECT 1 FROM pos_sale s WHERE s.id = sale_id AND s.org_id = current_org_id()));
--> statement-breakpoint

ALTER TABLE import_row ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE import_row FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON import_row;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON import_row
  USING (EXISTS (SELECT 1 FROM import_batch b WHERE b.id = batch_id AND b.org_id = current_org_id()));
--> statement-breakpoint

ALTER TABLE staff_location ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE staff_location FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON staff_location;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON staff_location
  USING (EXISTS (SELECT 1 FROM staff s WHERE s.id = staff_id AND s.org_id = current_org_id()));
--> statement-breakpoint

ALTER TABLE ledger_balance_snapshot ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ledger_balance_snapshot FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON ledger_balance_snapshot;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON ledger_balance_snapshot
  USING (EXISTS (SELECT 1 FROM ledger_account a WHERE a.id = account_id AND a.org_id = current_org_id()));
--> statement-breakpoint

-- Global reference data: readable by all, written by nobody.
GRANT SELECT ON holiday TO gymos_app;
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON holiday FROM gymos_app;
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════
-- 2. The ledger invariant — every transaction balances to zero
-- ═══════════════════════════════════════════════════════════════════
-- The single most important constraint in this database. Do not move it into
-- application code: one unbalanced transaction silently corrupts every arrears
-- figure and every revenue report derived from it, permanently.

ALTER TABLE ledger_entry DROP CONSTRAINT IF EXISTS ledger_entry_amount_positive;
--> statement-breakpoint
ALTER TABLE ledger_entry ADD CONSTRAINT ledger_entry_amount_positive CHECK (amount_rial > 0);
--> statement-breakpoint
ALTER TABLE ledger_entry DROP CONSTRAINT IF EXISTS ledger_entry_direction_valid;
--> statement-breakpoint
ALTER TABLE ledger_entry ADD CONSTRAINT ledger_entry_direction_valid
  CHECK (direction IN ('debit', 'credit'));
--> statement-breakpoint

CREATE OR REPLACE FUNCTION assert_ledger_balanced() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  imbalance bigint;
  n_entries int;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_rial ELSE -amount_rial END), 0),
    COUNT(*)
  INTO imbalance, n_entries
  FROM ledger_entry
  WHERE transaction_id = NEW.transaction_id;

  IF n_entries < 2 THEN
    RAISE EXCEPTION 'ledger transaction % has % entries; at least 2 required',
      NEW.transaction_id, n_entries;
  END IF;

  IF imbalance <> 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced by % rial',
      NEW.transaction_id, imbalance;
  END IF;

  RETURN NULL;
END $fn$;
--> statement-breakpoint

-- DEFERRABLE INITIALLY DEFERRED: fires at COMMIT, after every entry of the
-- transaction is inserted. A non-deferred trigger would reject the first entry
-- of every legitimate pair.
DROP TRIGGER IF EXISTS ledger_balanced ON ledger_entry;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_balanced
  AFTER INSERT ON ledger_entry
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_balanced();
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════
-- 3. Append-only enforcement
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION '% is append-only; correct by inserting a reversing row, not by %',
    TG_TABLE_NAME, lower(TG_OP);
END $fn$;
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ledger_entry','check_in','stock_movement','sms_credit_ledger','audit_log'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_immutable ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_mutation()',
      t, t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Partially immutable: identity and money frozen, lifecycle status may advance.
CREATE OR REPLACE FUNCTION freeze_collection_identity() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.mandate_id      IS DISTINCT FROM OLD.mandate_id
  OR NEW.amount_rial     IS DISTINCT FROM OLD.amount_rial
  OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  OR NEW.attempt_no      IS DISTINCT FROM OLD.attempt_no THEN
    RAISE EXCEPTION 'collection_attempt identity is frozen; create a new attempt row instead';
  END IF;
  RETURN NEW;
END $fn$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS collection_attempt_identity_frozen ON collection_attempt;
--> statement-breakpoint
CREATE TRIGGER collection_attempt_identity_frozen
  BEFORE UPDATE ON collection_attempt
  FOR EACH ROW EXECUTE FUNCTION freeze_collection_identity();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION freeze_message_content() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.body            IS DISTINCT FROM OLD.body
  OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  OR NEW.person_id       IS DISTINCT FROM OLD.person_id THEN
    RAISE EXCEPTION 'message content is frozen once queued';
  END IF;
  RETURN NEW;
END $fn$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS message_content_frozen ON message;
--> statement-breakpoint
CREATE TRIGGER message_content_frozen
  BEFORE UPDATE ON message
  FOR EACH ROW EXECUTE FUNCTION freeze_message_content();
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════
-- 4. Derived balances
-- ═══════════════════════════════════════════════════════════════════
-- security_invoker makes these respect the caller's RLS. Without it, a view is
-- an RLS bypass.

CREATE OR REPLACE VIEW v_account_balance
WITH (security_invoker = true) AS
SELECT
  e.account_id,
  e.org_id,
  SUM(CASE WHEN e.direction = 'debit' THEN e.amount_rial ELSE -e.amount_rial END) AS balance_rial
FROM ledger_entry e
GROUP BY e.account_id, e.org_id;
--> statement-breakpoint

-- The query behind the arrears screen, the risk score, and every sales
-- conversation you will have.
CREATE OR REPLACE VIEW v_member_arrears
WITH (security_invoker = true) AS
SELECT
  p.id         AS person_id,
  p.org_id,
  p.first_name,
  p.last_name,
  p.mobile,
  a.id         AS account_id,
  COALESCE(b.balance_rial, 0) AS arrears_rial,
  (SELECT min(lt.occurred_at)
     FROM ledger_entry le
     JOIN ledger_transaction lt ON lt.id = le.transaction_id
    WHERE le.account_id = a.id AND le.direction = 'debit') AS oldest_debit_at
FROM person p
JOIN ledger_account a ON a.person_id = p.id AND a.kind = 'member_receivable'
LEFT JOIN v_account_balance b ON b.account_id = a.id
WHERE COALESCE(b.balance_rial, 0) > 0;
--> statement-breakpoint

GRANT SELECT ON v_account_balance, v_member_arrears TO gymos_app;
--> statement-breakpoint

-- Trigram index for Persian name search (design/api-design.md §6: p95 < 400ms).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS person_search_trgm_idx ON person USING gin (search_name gin_trgm_ops);
