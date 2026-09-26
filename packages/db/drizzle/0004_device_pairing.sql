-- TASK-013 — device pairing. HAND-WRITTEN.
--
-- The kiosk currently holds a 90-day STAFF token in localStorage on an
-- unattended machine in a public room. That token can take payments. A device
-- credential must be able to do exactly two things — pull snapshots and flush
-- check-ins — and nothing else.
--
-- Pairing is short-lived and single-use: staff generate a code on the Desk, the
-- installer types it once, and the kiosk exchanges it for a long-lived secret.
-- No credential is ever typed into a config file.

ALTER TABLE device ADD COLUMN IF NOT EXISTS pairing_code_hash text;
--> statement-breakpoint
ALTER TABLE device ADD COLUMN IF NOT EXISTS pairing_expires_at timestamptz;
--> statement-breakpoint
ALTER TABLE device ADD COLUMN IF NOT EXISTS paired_at timestamptz;
--> statement-breakpoint
ALTER TABLE device ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
--> statement-breakpoint

-- secret_hash is NOT NULL in the original schema, but a device exists in a
-- pending state before it is paired.
ALTER TABLE device ALTER COLUMN secret_hash DROP NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS device_pairing_code_uq
  ON device (pairing_code_hash) WHERE pairing_code_hash IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS device_secret_uq
  ON device (secret_hash) WHERE secret_hash IS NOT NULL;
--> statement-breakpoint

-- ═══════════════════════════════════════════════════════════════════
-- Auth bootstrap for devices
-- ═══════════════════════════════════════════════════════════════════
-- Same chicken-and-egg as auth_resolve_session (D-010): RLS needs app.org_id,
-- but discovering the org is the point of the lookup. This is the third — and,
-- on current design, final — SECURITY DEFINER function. Both are keyed on an
-- unguessable hash and neither returns anything beyond one row.
--
-- `SET search_path` is mandatory: without it a caller can shadow `device` with
-- their own object and hijack the definer's privileges.

CREATE OR REPLACE FUNCTION auth_resolve_device(p_secret_hash text)
RETURNS TABLE (
  "deviceId"   uuid,
  "orgId"      uuid,
  "locationId" uuid,
  "kind"       text,
  "label"      text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT id, org_id, location_id, kind, label
    FROM device
   WHERE secret_hash = p_secret_hash
     AND paired_at IS NOT NULL
     AND revoked_at IS NULL
   LIMIT 1
$fn$;
--> statement-breakpoint

-- Redeeming a pairing code: find it, mint the secret, burn the code. One
-- statement so a concurrent second attempt cannot also succeed.
CREATE OR REPLACE FUNCTION auth_redeem_pairing_code(
  p_code_hash   text,
  p_secret_hash text
)
RETURNS TABLE (
  "deviceId"   uuid,
  "orgId"      uuid,
  "locationId" uuid
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  UPDATE device
     SET secret_hash        = p_secret_hash,
         paired_at          = now(),
         pairing_code_hash  = NULL,
         pairing_expires_at = NULL
   WHERE pairing_code_hash = p_code_hash
     AND pairing_expires_at > now()
     AND paired_at IS NULL
  RETURNING id, org_id, location_id
$fn$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION auth_resolve_device(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_redeem_pairing_code(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_resolve_device(text) TO gymos_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_redeem_pairing_code(text, text) TO gymos_app;
