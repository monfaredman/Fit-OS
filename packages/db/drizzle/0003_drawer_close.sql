-- TASK-011 — cash drawer close and variance. HAND-WRITTEN.
--
-- The fraud control that makes the capability matrix meaningful
-- (design/permissions.md §2). Receptionists cannot write off arrears, but
-- without a per-shift variance the simplest attack stays open: take the cash,
-- never record the payment, let the member show as in arrears and be chased.
--
-- Expected cash is DERIVED from the ledger between two closes — never stored,
-- never entered by the person being measured. The only figure staff supply is
-- what they counted.

CREATE TABLE IF NOT EXISTS drawer_close (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  location_id       uuid NOT NULL REFERENCES location(id) ON DELETE CASCADE,
  staff_id          uuid REFERENCES staff(id) ON DELETE SET NULL,
  period_from       timestamptz NOT NULL,
  period_to         timestamptz NOT NULL,
  expected_rial     bigint NOT NULL,
  counted_rial      bigint NOT NULL,
  variance_rial     bigint NOT NULL,
  note              text,
  jalali_ym         text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS drawer_close_org_period_idx
  ON drawer_close (org_id, location_id, period_to DESC);
--> statement-breakpoint

-- A close is a historical fact: it is the evidence. Append-only, like the ledger.
ALTER TABLE drawer_close ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE drawer_close FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON drawer_close;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON drawer_close
  USING (org_id = current_org_id()) WITH CHECK (org_id = current_org_id());
--> statement-breakpoint

GRANT SELECT, INSERT ON drawer_close TO gymos_app;
--> statement-breakpoint
DROP TRIGGER IF EXISTS drawer_close_immutable ON drawer_close;
--> statement-breakpoint
CREATE TRIGGER drawer_close_immutable
  BEFORE UPDATE OR DELETE ON drawer_close
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
