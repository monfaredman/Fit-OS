-- GymOS — database guards
--
-- Run AFTER drizzle-kit's generated DDL. This is everything the schema file
-- cannot express: tenant isolation, the ledger balance invariant, and
-- append-only enforcement.
--
-- NOTE ON DRIZZLE: unlike your Vieral/Trend repos, this is a fresh project with
-- a clean snapshot, so `drizzle-kit generate` is safe here. Let it emit tables
-- and indexes; keep this file as a hand-written companion migration and never
-- let generate overwrite it.
--
-- Requires PostgreSQL 15+ (for security_invoker views).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- 1. Tenant isolation
-- ═══════════════════════════════════════════════════════════════════

-- The application sets this once per transaction:
--   SET LOCAL app.org_id = '<uuid>';
-- Never interpolate it from user input without validating it's a uuid.
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;

-- A role that CANNOT bypass RLS. The app must connect as this, not as owner.
-- Table owners and superusers bypass RLS silently — the single most common way
-- RLS is "enabled" but does nothing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gymos_app') THEN
    CREATE ROLE gymos_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO gymos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gymos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gymos_app;

-- Apply a uniform org_id policy to every tenant-scoped table.
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'location','staff','person','plan','membership','membership_freeze',
    'ledger_account','ledger_transaction','ledger_entry','payment',
    'mandate','collection_attempt','access_snapshot','check_in','device',
    'locker','locker_assignment','product','stock_movement','pos_sale',
    'event','scheduled_trigger','automation','automation_run',
    'message','sms_credit_ledger','risk_score','import_batch','audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING (org_id = current_org_id())
        WITH CHECK (org_id = current_org_id())
    $f$, t);
  END LOOP;
END $$;

-- organization itself: a row is visible only if it IS the current org.
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organization
  USING (id = current_org_id());

-- Child tables reached only via a parent (no org_id of their own).
ALTER TABLE pos_sale_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sale_line FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pos_sale_line
  USING (EXISTS (SELECT 1 FROM pos_sale s
                 WHERE s.id = sale_id AND s.org_id = current_org_id()));

ALTER TABLE import_row ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_row FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON import_row
  USING (EXISTS (SELECT 1 FROM import_batch b
                 WHERE b.id = batch_id AND b.org_id = current_org_id()));

ALTER TABLE staff_location ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_location FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON staff_location
  USING (EXISTS (SELECT 1 FROM staff s
                 WHERE s.id = staff_id AND s.org_id = current_org_id()));

-- `holiday` is global reference data: readable by all, written by nobody.
GRANT SELECT ON holiday TO gymos_app;
REVOKE INSERT, UPDATE, DELETE ON holiday FROM gymos_app;


-- ═══════════════════════════════════════════════════════════════════
-- 2. The ledger invariant — every transaction balances to zero
-- ═══════════════════════════════════════════════════════════════════
-- This is the single most important constraint in the database. Do not move it
-- into application code: one unbalanced transaction silently corrupts every
-- arrears figure and every revenue report derived from it, permanently.

ALTER TABLE ledger_entry
  ADD CONSTRAINT ledger_entry_amount_positive CHECK (amount_rial > 0);

CREATE OR REPLACE FUNCTION assert_ledger_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  imbalance bigint;
  n_entries int;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_rial
                      ELSE -amount_rial END), 0),
    COUNT(*)
  INTO imbalance, n_entries
  FROM ledger_entry
  WHERE transaction_id = NEW.transaction_id;

  IF n_entries < 2 THEN
    RAISE EXCEPTION
      'ledger transaction % has % entries; at least 2 required',
      NEW.transaction_id, n_entries;
  END IF;

  IF imbalance <> 0 THEN
    RAISE EXCEPTION
      'ledger transaction % is unbalanced by % rial',
      NEW.transaction_id, imbalance;
  END IF;

  RETURN NULL;
END $$;

-- DEFERRABLE INITIALLY DEFERRED: fires at COMMIT, after all the transaction's
-- entries are inserted. A non-deferred trigger would reject the first entry of
-- every legitimate pair.
CREATE CONSTRAINT TRIGGER ledger_balanced
  AFTER INSERT ON ledger_entry
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_ledger_balanced();


-- ═══════════════════════════════════════════════════════════════════
-- 3. Append-only enforcement
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only; correct by inserting a reversing row, not by %',
    TG_TABLE_NAME, lower(TG_OP);
END $$;

-- Fully immutable: historical facts. No updates, no deletes, ever.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ledger_entry','check_in','stock_movement','sms_credit_ledger','audit_log'
  ] LOOP
    EXECUTE format($f$
      CREATE TRIGGER %I_immutable
        BEFORE UPDATE OR DELETE ON %I
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation()
    $f$, t, t);
  END LOOP;
END $$;

-- Partially immutable: the row's identity and money are frozen, but its
-- lifecycle status legitimately advances (queued → submitted → succeeded).
CREATE OR REPLACE FUNCTION freeze_collection_identity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mandate_id      IS DISTINCT FROM OLD.mandate_id
  OR NEW.amount_rial     IS DISTINCT FROM OLD.amount_rial
  OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  OR NEW.attempt_no      IS DISTINCT FROM OLD.attempt_no THEN
    RAISE EXCEPTION
      'collection_attempt identity is frozen; create a new attempt row instead';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER collection_attempt_identity_frozen
  BEFORE UPDATE ON collection_attempt
  FOR EACH ROW EXECUTE FUNCTION freeze_collection_identity();

CREATE OR REPLACE FUNCTION freeze_message_content() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.body            IS DISTINCT FROM OLD.body
  OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  OR NEW.person_id       IS DISTINCT FROM OLD.person_id THEN
    RAISE EXCEPTION 'message content is frozen once queued';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER message_content_frozen
  BEFORE UPDATE ON message
  FOR EACH ROW EXECUTE FUNCTION freeze_message_content();

CREATE TRIGGER collection_attempt_no_delete
  BEFORE DELETE ON collection_attempt
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();


-- ═══════════════════════════════════════════════════════════════════
-- 4. Derived balances
-- ═══════════════════════════════════════════════════════════════════
-- security_invoker makes these views respect the caller's RLS rather than the
-- view owner's. Without it, a view is an RLS bypass.

CREATE OR REPLACE VIEW v_account_balance
WITH (security_invoker = true) AS
SELECT
  e.account_id,
  e.org_id,
  SUM(CASE WHEN e.direction = 'debit' THEN e.amount_rial
           ELSE -e.amount_rial END) AS balance_rial
FROM ledger_entry e
GROUP BY e.account_id, e.org_id;

-- Member arrears — the query behind the arrears screen, the risk score, and
-- every sales conversation you will have.
CREATE OR REPLACE VIEW v_member_arrears
WITH (security_invoker = true) AS
SELECT
  p.id                AS person_id,
  p.org_id,
  p.first_name,
  p.last_name,
  p.mobile,
  a.id                AS account_id,
  COALESCE(b.balance_rial, 0) AS arrears_rial,
  (SELECT min(lt.occurred_at)
     FROM ledger_entry le
     JOIN ledger_transaction lt ON lt.id = le.transaction_id
    WHERE le.account_id = a.id
      AND le.direction = 'debit') AS oldest_debit_at
FROM person p
JOIN ledger_account a
  ON a.person_id = p.id AND a.kind = 'member_receivable'
LEFT JOIN v_account_balance b
  ON b.account_id = a.id
WHERE COALESCE(b.balance_rial, 0) > 0;

GRANT SELECT ON v_account_balance, v_member_arrears TO gymos_app;

COMMIT;


-- ═══════════════════════════════════════════════════════════════════
-- 5. BLOCKED — do not run until the gym visits answer question 3
-- ═══════════════════════════════════════════════════════════════════
-- schema.ts assumes mobile is unique per org:
--     person_org_mobile_uq ON person (org_id, mobile)
--
-- If ≥2 of the 10 visited gyms register family members on a shared phone, that
-- constraint is wrong and this is the change:
--
--   DROP INDEX person_org_mobile_uq;
--   ALTER TABLE person ADD COLUMN is_primary_contact boolean NOT NULL DEFAULT true;
--   CREATE UNIQUE INDEX person_org_mobile_primary_uq
--     ON person (org_id, mobile) WHERE is_primary_contact;
--   CREATE INDEX person_org_mobile_idx ON person (org_id, mobile);
--
-- i.e. one primary contact per number, unlimited dependents sharing it. Search
-- then returns multiple people for one number, and the Desk must disambiguate —
-- which changes the receptionist flow in `receptionist-flow.md` §3.
--
-- Cheap now. Expensive after you have real member data.
