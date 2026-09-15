-- TASK-005 — authentication bootstrap. HAND-WRITTEN (D-010).
--
-- The chicken-and-egg: RLS needs `app.org_id`, but discovering the org is the
-- whole point of a login or a session lookup. `gymos_app` is NOBYPASSRLS, so an
-- untenanted SELECT matches nothing and every login fails.
--
-- Three ways out, and why this one:
--
--   a) Loosen the RLS policy on `session`/`staff` so rows are visible when no
--      org is set — weakens the exact guarantee the whole design rests on.
--   b) Connect as the owner for auth — hands the API a connection that bypasses
--      every policy, i.e. the failure mode RLS exists to prevent.
--   c) SECURITY DEFINER functions: two narrow, parameterised lookups that run
--      with the definer's privileges, exposing nothing else. ← this
--
-- Both functions are safe to expose because their lookup keys are unguessable
-- or non-enumerating: a SHA-256 of a 256-bit random token, and a single mobile
-- whose password must still verify in the application.
--
-- `SET search_path` is mandatory on SECURITY DEFINER: without it a caller can
-- shadow `session`/`staff` with their own objects and hijack the definer's
-- privileges.

CREATE OR REPLACE FUNCTION auth_resolve_session(p_token_hash text)
RETURNS TABLE (
  "sessionId"     uuid,
  "orgId"         uuid,
  "staffId"       uuid,
  "expiresAt"     timestamptz,
  "elevatedUntil" timestamptz,
  "firstName"     text,
  "lastName"      text,
  "role"          text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT s.id, s.org_id, s.staff_id, s.expires_at, s.elevated_until,
         st.first_name, st.last_name, st.role
    FROM session s
    JOIN staff st ON st.id = s.staff_id
   WHERE s.token_hash = p_token_hash
     AND s.revoked_at IS NULL
     AND s.expires_at > now()
     AND st.is_active = true
     AND st.deleted_at IS NULL
   LIMIT 1
$fn$;
--> statement-breakpoint

-- Returns ALL matches: staff.mobile is unique per org, not globally, so two
-- gyms may legitimately hold the same number. The caller verifies the password
-- against each and treats more than one success as ambiguous.
CREATE OR REPLACE FUNCTION auth_staff_by_mobile(p_mobile text)
RETURNS TABLE (
  "id"           uuid,
  "orgId"        uuid,
  "firstName"    text,
  "lastName"     text,
  "role"         text,
  "passwordHash" text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT id, org_id, first_name, last_name, role, password_hash
    FROM staff
   WHERE mobile = p_mobile
     AND is_active = true
     AND deleted_at IS NULL
   LIMIT 5
$fn$;
--> statement-breakpoint

-- Deny by default, then grant only to the application role.
REVOKE ALL ON FUNCTION auth_resolve_session(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_staff_by_mobile(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_resolve_session(text) TO gymos_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_staff_by_mobile(text) TO gymos_app;
