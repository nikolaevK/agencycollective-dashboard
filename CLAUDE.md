# Agency Collective Dashboard

SaaS dashboard for managing Meta (Facebook) ad accounts with AI analytics, multi-role access control, and client/closer/setter portals.

The sales-pipeline side has three roles sharing the `c_sess` cookie and the `closers` table (discriminated by `role`):
- **Closer** — closes deals, marks attendance, manages notes.
- **Setter** — books/preps calls, earns commission on prepped deals. Gated to a setter-only portal tree.
- **Admin** — full visibility via `/dashboard/*`, manages closers + setters.

## Tech Stack

- **Framework:** Next.js 14.2 (App Router, React 18.3), TypeScript 5 strict
- **DB:** Turso (serverless SQLite via `@libsql/client`) — raw parameterized SQL, no ORM
- **Styling:** Tailwind 3.4 + shadcn/ui (Radix)
- **Data:** TanStack React Query 5 · **Validation:** Zod (Meta responses) + manual
- **AI:** Anthropic Claude (chat/analysis), Google Gemini (images)
- **External:** Meta Graph API v25.0, Google Calendar (OAuth 2.0), GoHighLevel (GHL) v2
- **Charts:** Recharts · **Icons:** Lucide

## Commands

```bash
npm run dev      # Dev server (port 3000)
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint
```

No test framework, no CI/CD.

## Project Structure

```
app/
  actions/                # Server actions (auth, CRUD, uploads)
  api/                    # RESTful routes, all force-dynamic
    calendar/             # Shared events/appointments/attendance (admin+closer+setter)
    closer/               # Closer/setter session endpoints (attendance, setter, notes)
    admin/clients/        # Client Directory (billing, invoices, rebill, welcome-kit, ...)
  dashboard/              # Admin pages (overview, accounts drill-down, chat, users, closers, ...)
  [slug]/portal/          # Client portal (welcome-kit, overview, analyst, design-board, support)
  closer/(protected)/     # Closer + setter portal (shared c_sess, role-gated in layout tree)
  welcome-kit/            # Public no-login Welcome Kit share page (gated by publish toggle)
components/               # ui/ (shadcn), layout/, providers/, overview/, closer/, users/, welcome-kit/, ...
hooks/                    # React Query hooks (useAccounts, useCampaigns, ...)
lib/
  db.ts                   # DB client, schema, idempotent migrations (auto-run on startup)
  session.ts/adminSession.ts/closerSession.ts   # HMAC-SHA256 signed cookies
  closerGuards.ts         # Role gates: requireCloserRecord, getSetterFromSession
  permissions.ts          # RBAC (9 keys)
  cache.ts                # In-memory L1 TTL cache
  meta/                   # client.ts (rate-limit, errors) + persistentCache.ts (24h ban-avoidance) + schemas.ts
  google/                 # OAuth + Calendar + encrypted token storage
  ghl/                    # GHL v2 multi-sub-account client + appointment/contact/opportunity modules
  clientDirectory.ts, clientBilling.ts, clientInvoice.ts, clientRebillInvoices.ts, welcomeKit.ts, ...
types/                    # dashboard.ts, api.ts, alerts.ts
middleware.ts             # Edge auth + admin route permission checks
instrumentation.ts        # DB migration trigger on startup
```

## Architecture

### Authentication
Three HMAC-SHA256 signed session types (7-day expiry): `a_sess` (admin), `c_sess` (closer **and** setter — role in payload), `u_sess` (client). Passwords: scrypt (N=16384, r=8, p=1). Constant-time compare via `crypto.timingSafeEqual`.

**Setters share the closer session** (a `closers` row with `role='setter'`). The authoritative role check lives in the `/closer/(protected)/` **layout tree** via `requireCloserRecord({ allow })` — NOT middleware (which deliberately skips role redirects to avoid loops when an admin flips a role). Single source of truth is the DB, never the token.

### Authorization (RBAC)
9 permission keys enforced at middleware + API level: `dashboard`, `analyst`, `studio`, `jsoneditor`, `adcopy`, `invoice`, `users`, `closers`, `admin`. Super admins (`isSuper`) bypass all checks; `isSuper` cannot be set via API.

### Database (Turso / libSQL)
Migrations are code-driven in `lib/db.ts`, run on startup via `instrumentation.ts`. **Strictly additive** — `CREATE TABLE IF NOT EXISTS`, try/catch'd `ALTER ... ADD COLUMN`. Idempotent, concurrency-safe.

Key tables: `users` (clients), `client_accounts` (user↔Meta-account), `admins`, `closers` (closers+setters), `deals` (`closer_id` + nullable `setter_id`), `appointments` (setter claims), `event_attendance`, `ghl_appointment_links` (Google↔GHL bridge), `notes`/`note_shares`, `client_billing`/`client_notes`/`client_rebill_invoices`, `welcome_kit`, `meta_cache` (24h Meta cache), `google_calendar_config` (encrypted tokens, NODE_ENV-scoped), `audit_log`.

### Caching — Meta 24h persistent cache (CRITICAL)
`lib/meta/persistentCache.ts` wraps `metaFetch`/`metaBatchFetch` — the single choke point all Meta reads funnel through. A given query hits Meta **at most once per 24h**, shared across all instances/users. Rationale: frequent automated polling can get client ad accounts **banned**.
- Stored in Turso `meta_cache` (keyed by data identity, not user; token never in key). Per-account keys → admin + all linked clients share rows (extra clients = zero extra Meta calls). Auth (`resolvePortalAccountId`) runs *before* the cache — no cross-client leakage.
- Single-flight + serve-stale-on-error. Cached payloads re-validated against Zod on read (self-heal on schema change).
- **No force-refresh override by design.** For a one-off live read: `cache: { skip: true }` at the call site. Never add a user-facing refresh button or re-introduce polling.
- A newly *connected* account is a cache miss → one fresh pull immediately, then 24h. Meta data is otherwise 24h-stale by design.

In-memory L1 (`lib/cache.ts`): per-process, wiped on cold start — does NOT bound Meta frequency. Client-side React Query: Meta hooks `staleTime` 24h + no polling; setter/closer dashboards 120s.

### External Integrations
- **Meta** — Zod-validated, rate-limit handling (code 80000, backoff). Wrapped in the 24h cache. Closer/setter portals consume zero Meta.
- **Google Calendar** — read-only OAuth, AES-256-GCM encrypted tokens scope-keyed by `NODE_ENV`, server-cached 2min.
- **Anthropic Claude** — chat analytics, 20 req/min per admin, streaming.
- **GHL v2** — PIT auth, **multi-sub-account** (Peptide + Agency; registry in `lib/ghl/subAccounts.ts`). Bidirectional appointment-status sync (`lib/attendanceSync.ts`) + CRM funnel sync (`lib/ghlCrmSync.ts`). Appointment endpoints require `Version: 2023-02-21`.

## Sales Pipeline
Deals credit both a **closer** (required) and **setter** (optional), auto-attributed by `google_event_id`: setter claims an event → closer links a deal to the same event → `resolveSetterForEvent` stores the setter. Out-of-order resolved by `reassignDealsForEvent`. Multi-setter: latest `updated_at` wins.

**GHL sync** (no webhooks): Google↔GHL bridged via composite key `(title|startMs|endMs)`, persisted in `ghl_appointment_links` (stamped with owning sub-account, the routing key for all later syncs). Push (dashboard→GHL) is real-time PUT after each `event_attendance` write; Pull is on-demand. Non-matching events behave as non-GHL (sync no-ops). CRM funnel sync moves opportunities + tags by pipeline/stage **name** (rename in GHL silently disables it).

## Client Directory (`/dashboard/users`, perm `users`)
Full-screen admin surface cross-referenced with the Payout DB via `users.payout_brand`. Tabs: **Directory** / **Support** / **Welcome Kit**. Strictly additive — does NOT touch portal login or Meta-account linking.
- **Re-bill schedule** (`lib/clientBilling.ts`): pure engine, `nextRebillAt` = one month after `max(latest payout month, override)`. Status: `upcoming|due|overdue|invoice_sent|paused|extended|unscheduled`. Due/overdue surface in a live in-app alerts banner — computed on load, no cron. Alerts also require `status === 'active'`.
- **Re-bill invoicing**: Billing tab → `ClientInvoiceDrawer` (reuses deal-invoice PDF machinery, no scope/contract). Send emails + files in `payout_documents` + records a `client_rebill_invoices` row (`cycle_anchor = nextRebillAt`) → enters `invoice_sent`. Reconciliation auto-promotes `sent → paid` on read when a payout lands. `Register existing` backfills out-of-band sends. `client_rebill_invoices` is the only bridge between Send and Payout — no retroactive backfill from `payout_documents`.
- **Welcome Kit**: single global `WelcomeKitDoc` (block model in `lib/welcomeKit.ts`) edited in the builder, rendered by one `WelcomeKitRenderer` across portal/public/preview. Public `/welcome-kit` gated by `share_enabled`. Optimistic-concurrency on save (`baseUpdatedAt` → 409 on conflict).

## Notes
Per-user scratchpad (`/closer/notes`, `/closer/setter/notes`, same component). Markdown body (react-markdown, safe — no raw HTML), priority, due date, tags, optional linked lead. Sharing via `note_shares` (owner-only mutations, recipient archive, 50 cap). Lead-context modal aggregates event + claims + deals + attendance.

## Code Conventions
- Components PascalCase; hooks `use*` camelCase; server actions `*Action`; constants UPPER_SNAKE; types PascalCase.
- All imports use `@/*` alias. `"use client"` / `"use server"` directives. API routes export `GET/POST/...`, all `force-dynamic`.
- `cn()` (clsx + tailwind-merge), CVA for variants. Error classes: `RateLimitError`, `TokenExpiredError`, `MetaApiError`.
- Server action return: `{ error?: string }`. API wrapper: `ApiResponse<T>` with `meta: { cached, timestamp, dateRange }`.
- State: React Query (server), `AdminProvider`/`useAdmin()` (auth), local `useState` (UI).
- Commission in basis points, quotas in cents (integer math).

## Security Headers (next.config.js)
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`, CSP (self + Meta CDN + `figma.com`/`embed.figma.com` for Design Board embeds).

## Environment Variables
Required: `SESSION_SECRET` (≥32 chars), `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `META_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`.
Optional: `META_API_VERSION` (v25.0), `META_CONCURRENCY_LIMIT` (5), `META_PERSISTENT_CACHE_TTL_SECONDS` (86400 — the ban-avoidance layer), GHL pairs `GHL_PIT`/`GHL_LOCATION_ID` (Peptide) + `GHL_PIT_AGENCY`/`GHL_LOCATION_ID_AGENCY` (Agency). Each GHL sub-account enables independently; none set = chip never renders, sync no-ops.

## Key Gotchas (must not break)
- **Migrations run on every startup — keep `migrate()` idempotent.** Bump `SCHEMA_VERSION` (`yyyy-mm-dd.feature.rN`) for any new `CREATE TABLE` in the gated body (else it's skipped on existing deploys). Runtime-critical *column* adds go in `ensureCriticalColumns` (runs unconditionally before the version probe), not the gated body. **No destructive changes — additive only.**
- **Meta is 24h-stale by design** — no force-refresh, no polling. Single live reads use `cache: { skip: true }`.
- **No role-based redirects in middleware for closer/setter** — layout-level DB checks are authoritative (prevents loops on mid-session role change).
- **libSQL FK cascade is not guaranteed to fire** — `deleteCloser` explicitly cleans appointments, `deals.setter_id`, notes, note_shares (both directions).
- **libSQL atomic writes** via `db.batch([...], "write")` (e.g. `replaceAttendanceForEvent`, `createRebillInvoice`).
- **GHL appointment PUT** needs `Version: 2023-02-21` + body with `calendarId`/`startTime`/`endTime`/`title`/`assignedUserId` — wrong version returns 200 but silently no-ops.
- **GHL closer attribution + CRM funnel sync match by NAME** — renames in GHL/dashboard break attribution / silently disable funnel moves (logs `not found` with available names).
- **GHL link row's `ghl_sub_account_id`** is stamped once at discovery and is the routing key for all later syncs — never re-resolved.
- **SQL always parameterized.** Passwords stripped from API responses. Google tokens AES-256-GCM encrypted, NODE_ENV-scoped. Markdown is react-markdown safe-default (no `rehype-raw`/`dangerouslySetInnerHTML`).
- **Setter = closer with `role='setter'`** — included in closer lookups unless explicitly filtered.
- Audit log is fire-and-forget; notes/shares/setter actions are not audit-logged (v1 scope).
