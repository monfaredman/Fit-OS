# GymOS — API Contract

REST over NestJS controllers. **Not tRPC** — the hardware bridge agent is a Go binary
and the kiosk may one day be something other than your Nuxt app; both need a
plain HTTP contract you can implement from a document.

---

## 1. Rules that apply to every endpoint

| Rule | Detail |
|---|---|
| **Tenant comes from the session, never the client** | `org_id` is resolved server-side and set as `app.org_id` for the transaction. A client-supplied org id is ignored, and logged as a security event |
| **One transaction per request** | Open tx → `SET LOCAL app.org_id` → work → commit. The `withOrg` helper in `tech-stack.md` §5 wraps this, enforced by an interceptor; nothing bypasses it |
| **Money endpoints require `Idempotency-Key`** | Missing header → `400`. See §4 |
| **All money in integer Rial** | Field names end `Rial`. Never send or accept Toman over the wire |
| **All timestamps ISO-8601 UTC** | Jalali is computed at the edge. The API never emits a Jalali string except in rendered documents |
| **Cursor pagination** | `?limit=50&cursor=<opaque>`. Never offset — rows shift under a busy desk |
| **Persian errors, English codes** | See §3 |

Base path `/api/v1`. Version in the path, because the Go agent ships on its own
schedule and will lag the server.

---

## 2. Surface

### Auth
```
POST   /auth/staff/login          { mobile, password }        → session cookie
POST   /auth/staff/otp            { mobile }                  → sends OTP (owner actions)
POST   /auth/staff/otp/verify     { mobile, code }            → elevates session
POST   /auth/member/otp           { mobile }                  → member PWA
POST   /auth/member/otp/verify    { mobile, code }            → 90-day session
POST   /auth/device/pair          { pairingCode }             → device secret (bridge/kiosk)
DELETE /auth/session
```

### Desk — the hot path
```
GET    /search?q=                  → people, ranked. MUST answer < 400ms
GET    /people/:id                 → the member card payload (§5)
POST   /check-ins                  → admit. Idempotent on clientEventId
GET    /check-ins?date=            → today's activity feed
```

### People & memberships
```
POST   /people                     { firstName, lastName, mobile, ... }
PATCH  /people/:id
GET    /people?stage=&risk=&cursor=
POST   /memberships                { personId, planId, startsAt, priceRial, discountRial }
POST   /memberships/:id/freeze     { fromAt, reason }
POST   /memberships/:id/unfreeze   { toAt }
POST   /memberships/:id/renew      { planId, startsAt }
GET    /plans
```

### Money
```
POST   /payments                   { personId, method, amountRial, reference }   [Idem]
POST   /wallet/topups              { personId, method, amountRial }              [Idem]
POST   /pos/sales                  { personId?, lines[], method }                [Idem]
POST   /adjustments                { accountId, direction, amountRial, memo }    [Idem, owner]
GET    /people/:id/ledger?cursor=
GET    /arrears?agedOverDays=&cursor=      → the screen that sells the product
GET    /drawer/current
POST   /drawer/close               { countedRial }                              [Idem]
```

### Lockers & retail
```
GET    /lockers?status=
POST   /lockers/:id/assign         { personId, kind, toAt?, priceRial? }         [Idem]
POST   /lockers/:id/release
GET    /products
POST   /stock/movements            { productId, delta, reason }
```

### Automation & messaging
```
GET    /automations
PATCH  /automations/:recipeKey     { isEnabled, config }
GET    /messages?personId=&cursor=
POST   /messages                   { personId, body }                           [Idem]
GET    /sms-credit
```

### Retention
```
GET    /risk?band=&cursor=         → at-risk list with per-member reasons
```

### Owner
```
GET    /dashboard                  → the five tiles, one call
GET    /reports/revenue?from=&to=
GET    /reports/attendance?from=&to=
```

### Sync — see `offline-sync.md`
```
GET    /sync/snapshot?locationId=&since=
POST   /sync/check-ins             { events[] }
```

### Device — the Go bridge
```
POST   /devices/heartbeat          { agentVersion, controllerModel, clockOffsetMs }
POST   /devices/attendance         { records[] }
GET    /devices/commands           → v2 write-back only
```

### Migration
```
POST   /imports                    (multipart)                → batch id
GET    /imports/:id/preview
POST   /imports/:id/approve
GET    /export                     → full XLSX. The trust feature. Never gate it
```

---

## 3. Errors

One envelope. `code` is stable and machine-readable; `message` is Persian and
shown to the user verbatim.

```json
{
  "error": {
    "code": "INSUFFICIENT_WALLET_BALANCE",
    "message": "موجودی کیف پول کافی نیست.",
    "details": { "availableRial": 570000, "requiredRial": 850000 }
  }
}
```

Per `artifact`-free rule in `principles.md` §2: **an error says what went wrong
and what to do next.** No apologies, no "an error occurred", no stack traces.

| Code | HTTP | Persian message |
|---|---|---|
| `UNAUTHENTICATED` | 401 | `لطفاً دوباره وارد شوید.` |
| `FORBIDDEN` | 403 | `شما دسترسی این کار را ندارید.` |
| `OTP_REQUIRED` | 403 | `برای این کار کد تأیید لازم است.` |
| `NOT_FOUND` | 404 | `یافت نشد.` |
| `DUPLICATE_MOBILE` | 409 | `این شماره موبایل قبلاً ثبت شده است.` |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | `درخواست تکراری قابل تشخیص نیست.` |
| `IDEMPOTENCY_KEY_REUSED` | 409 | `این درخواست قبلاً ثبت شده است.` |
| `LEDGER_UNBALANCED` | 500 | `خطای داخلی در ثبت مالی. تغییری اعمال نشد.` |
| `INSUFFICIENT_WALLET_BALANCE` | 422 | `موجودی کیف پول کافی نیست.` |
| `MEMBERSHIP_EXPIRED` | 422 | `اشتراک منقضی شده است.` |
| `NO_SESSIONS_REMAINING` | 422 | `جلسات این اشتراک تمام شده است.` |
| `DISCOUNT_EXCEEDS_CAP` | 422 | `تخفیف بیش از حد مجاز شماست.` |
| `WRITEOFF_EXCEEDS_CAP` | 422 | `مبلغ بخشودگی بیش از حد مجاز شماست.` |
| `SMS_CREDIT_EXHAUSTED` | 422 | `اعتبار پیامک تمام شده است.` |
| `LOCKER_OCCUPIED` | 409 | `این کمد در اختیار فرد دیگری است.` |
| `IMPORT_UNIT_AMBIGUOUS` | 422 | `واحد مبالغ فایل مشخص نیست (ریال یا تومان).` |
| `RATE_LIMITED` | 429 | `تعداد درخواست‌ها زیاد است. کمی بعد تلاش کنید.` |

`LEDGER_UNBALANCED` should be unreachable — the guard trigger and `ledger.ts`
both prevent it. If it ever fires, it is a P1 incident: page yourself, and note
that the transaction rolled back, so no money moved.

---

## 4. Idempotency

Any endpoint that moves money or sends a message takes `Idempotency-Key`.

- Store `(org_id, key) → response` for 24 hours.
- A repeat within the window replays the stored response with `Idempotency-Replayed: true`. It does **not** re-execute.
- A repeat with a *different* body under the same key is `409 IDEMPOTENCY_KEY_REUSED` — that's a client bug, not a retry.
- The Desk generates a UUID per user action, not per HTTP attempt. Retries reuse it; a second button press generates a new one.

Why it matters here specifically: a receptionist on a flaky connection **will**
press "دریافت وجه" twice. Without this, the member's arrears is wrong and the
drawer won't balance at close.

---

## 5. The member card payload

One call, everything the Desk renders. Shaped to match `receptionist-flow.md` §3
exactly — the four facts, in order.

```json
{
  "person": { "id", "firstName", "lastName", "mobile", "memberNo", "photoUrl", "stage" },
  "membership": {
    "id", "planName", "status",
    "endsAt", "daysRemaining",
    "sessionsRemaining", "sessionsTotal"
  },
  "arrearsRial": 4200000,
  "arrearsAgeDays": 23,
  "walletRial": 570000,
  "locker": { "code": "A-14", "kind": "public" },
  "access": { "canEnter": true, "reasonCode": "ok" },
  "risk": { "band": "medium", "reasons": [ { "code": "expiring", "detail": "..." } ] }
}
```

`access` is read straight from `access_snapshot` — the same precomputed row the
kiosk caches, so the Desk and the kiosk can never disagree about whether someone
may enter.

---

## 6. Performance budgets — these are tests, not aspirations

| Endpoint | p95 |
|---|---|
| `GET /search` | **400 ms** |
| `GET /people/:id` | 300 ms |
| `POST /check-ins` | **500 ms** (the kiosk does not wait on it — see `offline-sync.md`) |
| `POST /payments` | 800 ms |
| `GET /dashboard` | 1.5 s |
| `GET /arrears` | 2 s |

Measure on the gym's hardware over a throttled connection, not your Mac.
`principles.md` §1 makes check-in latency a counter-metric for a reason: it is
the single number that decides whether a gym keeps the product.
