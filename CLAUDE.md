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
  docuseal/               # DocuSeal client + schemas + signedDocument.ts
  payouts.ts, payoutDocuments.ts, clientDirectory.ts, clientBilling.ts, clientInvoice.ts, clientRebillInvoices.ts, welcomeKit.ts, ...
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

Key tables: `users` (clients), `client_accounts` (user↔Meta-account), `admins`, `closers` (closers+setters), `deals` (`closer_id` + nullable `setter_id`), `deal_contracts`/`deal_invoices` (+ `_additional` variants), `appointments` (setter claims), `event_attendance`, `ghl_appointment_links` (Google↔GHL bridge), `notes`/`note_shares`, `payouts` (Payout Tracker; nullable `source_deal_id` = imported-from-deal, partial-unique), `payout_documents` (PDF BLOBs by fuzzy `normalized_brand`), `client_billing`/`client_notes`/`client_rebill_invoices`, `ad_accounts` (optional client ad-account purchase) + `ad_account_invoices`, `welcome_kit`, `meta_cache` (24h Meta cache), `google_calendar_config` (encrypted tokens, NODE_ENV-scoped), `audit_log`.

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

## Payout Tracker (`/dashboard/closers/payouts`, perm `closers`)
Brand-keyed payment ledger (`payouts`). Manual entry via `AddEditPayoutModal`. Per-brand docs (`payout_documents`, `doc_type` ∈ `project_scope|invoice`) are ≤10 MB PDF BLOBs (DB-side; Vercel FS read-only), fuzzy-matched by `normalizeBrandName`/`brandsMatch`, shown in `BrandDocumentsModal` (dates render in viewer-local TZ via `formatDate` — SQLite stamps are zone-less UTC).
- **Import from Deal** (`ImportDealModal` → POST `/api/admin/payouts/from-deal`; picker = GET `/importable-deals`): admin picks a `closed` deal whose **primary** contract is `signed`, the form pre-fills (brand/amounts/contact/notes/sales-rep=closer), and on save the route inserts the payout (`source_deal_id`) and attaches **all** signed scopes + **all** invoice PDFs (primary + additionals) into `payout_documents` — as if uploaded manually.
- **One payout per deal**: `source_deal_id` + partial unique index `idx_payouts_source_deal` (race → 409). Doc attach is **non-blocking + non-transactional, no re-attach** — payout created first, failures returned as `warnings[]`; docs don't affect revenue/MRR/reconciliation. Scope bytes via `lib/docuseal/signedDocument.ts` (fresh `GET /submissions/{id}` URL first — stored `document_urls` go stale; HTTPS+private-host SSRF guard, 10 MB cap, URL-free logs).

## Client Directory (`/dashboard/users`, perm `users`)
Full-screen admin surface cross-referenced with the Payout DB via `users.payout_brand`. Tabs: **Directory** / **Ad Accounts** / **Support** / **Welcome Kit**. Strictly additive — does NOT touch portal login or Meta-account linking. **Monthly MRR** = the latest payout month's `amount_due` (summed across matched brands) by default; a per-client `client_billing.mrr_month_override` (`yyyy-mm`, set in the Billing tab) pins MRR to a chosen month so a one-off additional-service payment landing as the newest month isn't mistaken for recurring revenue (falls back to latest if that month disappears). The resolved `payoutMrr` flows through the directory, summary cards, re-bill invoice prefill, and the Revenue Projection baseline.
- **Re-bill schedule** (`lib/clientBilling.ts`): pure engine, `lastRebilledAt` = manual override when set (authoritative — even if earlier than payouts), else latest payout month; `nextRebillAt` = one month after it. Status: `upcoming|due|overdue|invoice_sent|paused|extended|unscheduled`, **plus a separate `paid` boolean** (independent of status — a qualifying payment covers the current cycle, so a row can be e.g. `Paid` + `Upcoming`). For clients `paid` requires a **REBILL**-flagged payout matching the brand's recurring amount; shown as its own chip until the next re-bill date. Due/overdue surface in a live in-app alerts banner — computed on load, no cron. Alerts also require `status === 'active'`. `paused` fully suppresses alerts; `extended` only suppresses while the deferred bill is still outside the lead window — once `extend_until` comes within `lead_days` the status falls through to `due` and re-enters the alerts.
- **Re-bill invoicing**: Billing tab → `ClientInvoiceDrawer` (reuses deal-invoice PDF machinery, no scope/contract). Send emails + files in `payout_documents` + records a `client_rebill_invoices` row (`cycle_anchor = nextRebillAt`) → enters `invoice_sent`. Reconciliation auto-promotes `sent → paid` on read when a payout lands. `Register existing` backfills out-of-band sends. `client_rebill_invoices` is the only bridge between Send and Payout — no retroactive backfill from `payout_documents`.
- **Welcome Kit**: single global `WelcomeKitDoc` (block model in `lib/welcomeKit.ts`) edited in the builder, rendered by one `WelcomeKitRenderer` across portal/public/preview. Public `/welcome-kit` gated by `share_enabled`. Optimistic-concurrency on save (`baseUpdatedAt` → 409 on conflict).
- **Roster** (`lib/clientProfile.ts`): per-client inline-editable columns in the Directory table — stage/health/services chips, ads running/paused + platform tags, top-client ★ (pinned group), website, perf fee + rev threshold, quick notes, and Head-of-Ads (`lead`)/Media Buyer assignment from `admins` (`client_team`, replace-set PUT per role; media-perm admins badged first). Stored in satellite `client_profile` (one row per client, lazy-created, JSON-array TEXT columns, partial PATCH at `/api/admin/clients/[userId]/profile`; absence = defaults). Perf fee derives from linked `ad_accounts.ad_spend_fee_bps` when manual override is empty; LTV = computed all-time `totalRevenue` (agency book). **Services are a FIXED 5-value vocabulary** (`SERVICE_OPTIONS`: meta/tiktok/google/creatives/email — NOT the `/api/services` invoice presets; deal names map via `mapDealServiceToRoster` keyword matching, unmapped names dropped). Page surfaces: `RosterDashboard` count-group cards (Overview/Media Buyer/Head of Ads/Ad Accounts/Services/Stage/Health, pills toggle the matching filters), `TeamFilterCards` person cards (count + running/paused split), Copy CSV. **Two books, sectioned on one page**: table renders ★ Top Clients (both books) → Agency Collective (paginated) → PepAds grouped at the bottom. `book='agency'` (default — computed billing as above) vs `'pepads'` (manually-added clients, badge; billing status + next re-bill are MANUAL chips in `manual_billing`/`manual_next_rebill`; **MRR + LTV are manual too** — `manual_mrr_cents`/`manual_ltv_cents` (in `ensureCriticalColumns`), inline-editable, feeding the summary Monthly MRR AND the Revenue Projection baseline via `effectiveMrrCents` (lib/clientProfile.ts — keep card and baseline consistent); **excluded from the computed re-bill alerts** in `rebill-alerts/route.ts` — the internal computed `schedule` stays on the row, every schedule-chip render site checks `profile.book`). **Deal→profile auto-fill**: payout import from a deal (and Add-from-payout when the brand traces to a deal) copies the deal's `website` + mapped `service_category` into the matched client's profile — only when those fields are still EMPTY, non-blocking via `warnings[]` (`autofillClientProfileFromDeal`; exact-match priority, multi-fuzzy-candidate skip). `deleteUser`/`deleteAdmin` explicitly clean `client_profile`/`client_team`.

## Ad Accounts (`/dashboard/users` → Ad Accounts tab + per-client sub-tab, perm `users`)
Optional client purchase. `ad_accounts` = one row per account, nullable `user_id` (unattached allowed; `deleteUser` nulls it — never deletes). Each carries a **monthly retainer** (cents) + **ad-spend fee** (basis points, 2–7% in 0.5% steps) and per-account schedule controls (pause/billing-day/lead/extend/last-billed) fed into the shared `computeRebillSchedule`. Assigning a client auto-names it `AC_<client>`. The directory's Total Value sums retainers across ALL accounts; Bills Due / Invoices Sent cards open alert + sent-invoice panels.
- **Invoicing** (`AdAccountInvoiceDrawer`; line items built by the pure `lib/adAccountLineItem.ts`, Agency Collective branding): a single invoice combines a **retainer line + an ad-spend-fee line**, each shown only when its amount > 0 (`invoice_type` = `retainer|ad_spend|combined`). Free invoices (no account) supported. Send files the PDF in `payout_documents` + records an `ad_account_invoices` row (`amount_cents` = total).
- **Reconciliation**: a payout flagged **"Ad Account"** in the Sales Rep column for the brand auto-promotes `sent → paid` and sets the schedule `paid` flag until the next bill (mirrors REBILL; per-brand match, so multiple accounts on one brand share its payouts). The directory reconciles EVERY sent row per account (backdated rows don't get stuck).
- **Per-account history** (`AdAccountInvoicesDrawer`, opened from each row): all of that account's invoices + **backdated registration with optional PDF upload** (`supersede:false`, reconciled on insert). Stored PDFs served by `…/invoices/[id]/document`. A cross-account "Sent invoices" panel lists awaiting-payment rows (mark-unpaid). `ad_accounts` billing columns self-heal via `ensureCriticalColumns`.
- **In-app docs**: `AdAccountsGuide` (the "Guide" button in the Ad Accounts tab + per-client sub-tab) is the user-facing explainer for everything below. Keep it in sync when this behavior changes.
- **Dedicated payment details**: ad-account invoices pull their payment block from `getAdAccountPaymentTemplate` (`lib/agencyConfig.ts`), NOT the shared `getPaymentTemplate` deal/client-rebill invoices use. Stored under config keys `ad_account_payment_template_{local,international}`; until an admin saves custom values it falls back to the shared template with account/routing overlaid (`AD_ACCOUNT_DEFAULT_ACCOUNT_NUMBER`/`_ROUTING_NUMBER`). Edited via the **Payment settings** modal (`AdAccountPaymentSettingsModal`, all fields, both types) at `/api/admin/ad-accounts/payment-settings` (GET/PUT/DELETE-reset). The invoice drawer prefetches BOTH payment blocks at load and switches client-side (the Local/International toggle never silently falls back to local on a failed fetch).

### Re-bill / Ad-Account schedule gotchas (apply to BOTH client re-bill and ad-account invoices — same `computeRebillSchedule` engine)
- **`invoice_sent` ("Invoice sent"/"Sent") is a per-cycle binding.** A row shows it ONLY when the active invoice's `cycle_anchor === ` the *freshly recomputed* `nextRebillAt`, the base status ∈ {`due`,`overdue`,`upcoming`}, and the invoice is still `sent`. An invoice anchored to any other cycle is treated as a stale earlier cycle and **ignored** (no chip). So a payout landing, or a billing-day/last-billed change *after* sending, can move the cycle and silently drop the chip.
- **Next-bill math uses ALL payouts; the Paid chip does not.** `payoutMonths` (drives `lastRebilled → nextRebillAt`) is **unfiltered** — every payout row for the brand advances the schedule, even a one-off/non-recurring one. `paidMonths` / reconciliation is filtered (clients: REBILL-flagged + recurring-baseline amount; ad accounts: `"Ad Account"`-flagged). Net effect: an unrelated payment in month M pushes the next bill to M+1, which is the usual cause of "I billed June but it anchored to July."
- **`last_billed_override` / "Last billed" is authoritative AND double-acting.** It overrides the payout-derived last-billed date (even earlier than payouts) **and** its day-of-month becomes the billing day when `billing_day` is null → next bill = one month later, on that day. Clearing it reverts the cycle to the payout/anchor-derived day.
- **Reconciliation is month-granularity** (`decideAutoPaid`: latest qualifying payout month `>=` cycle-anchor month → `paid`). A qualifying payment already in the cycle's month makes a freshly-sent invoice settle immediately — it may skip the visible "sent" step and show Paid.
- **"Today" is the business timezone, not the UTC server clock** (`lib/businessTime.ts`, `BUSINESS_TIME_ZONE`/`BILLING_TIME_ZONE`, default `America/Los_Angeles`). The engine is day-granular, so every `computeRebillSchedule` caller — both directory builders (`buildClientDirectory`/`getClientDetail`/`buildAdAccountDirectory` default `today` to `businessToday()`) and the two invoice SEND routes (anchor fallback = `businessTodayYmd()`, schedule `today` = `businessToday()`) — must share this basis. Otherwise statuses/anchors flip a day early every evening PT (UTC has rolled over) and a freshly-stamped `cycle_anchor` won't match the directory's recomputed `nextRebillAt`. Register routes take an explicit admin-entered `cycleAnchor` (pre-filled from the directory) so they're already consistent.
- **The ad-account SEND route feeds the engine the SAME billing controls the directory does** (`invoice/send/route.ts` builds a `ClientBilling` from the account's `billing_day`/`last_billed_override`/pause/extend/lead). Previously it passed `billing: null` and anchored on the UTC `createdAt` day, so an account with a custom billing day/override — or just created late-evening PT (createdAt rolled to the next UTC day) — mismatched the directory and didn't light up "Invoice sent". Keep send ≡ directory: same `anchorDate`, `billing`, `payoutMonths`, and `today`.

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
- **Payout reconciliation matches the Sales Rep column by substring** — `"rebill"` → client re-bill, `"ad account"` → ad-account payment (case-insensitive, `lib/payouts.ts`). Renaming/removing these markers silently breaks the auto `paid` promotion.
- **Deal→payout import**: one payout per deal (`source_deal_id` + partial unique index in `ensureCriticalColumns`, so it self-heals); doc attach is non-blocking — never make the payout insert depend on a DocuSeal/invoice fetch. Keep scope download fresh-URL-first + SSRF/10 MB/URL-free-log guards (`lib/docuseal/signedDocument.ts`).
- **Setter = closer with `role='setter'`** — included in closer lookups unless explicitly filtered.
- **PepAds clients (`client_profile.book='pepads'`) are billed manually** — the computed schedule still lives on their directory row (don't null it; reconciliation/panels depend on it) but UI render sites must check `profile.book`, and the rebill-alerts route is the single exclusion point. Deal→profile auto-fill is fill-only-when-empty — never overwrite a manually-set website/services.
- Audit log is fire-and-forget; notes/shares/setter actions are not audit-logged (v1 scope).
