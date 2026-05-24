# Agency Collective Dashboard

## Overview

SaaS dashboard for managing Meta (Facebook) ad accounts with AI-powered analytics, multi-role access control, and client/closer portals. Built for Agency Collective to manage ad campaigns, sales pipeline, and client reporting.

The sales-pipeline side of the product has three collaborating roles backed by the same `c_sess` cookie and the same `closers` table (discriminated by `role`):
- **Closer** — closes deals, marks attendance, manages their own notes.
- **Setter** — books/prepares calls (claims Google Calendar events, adds pre/post-call flags, earns commission on deals they prepped). Gated to a setter-only portal tree.
- **Admin** — full visibility via `/dashboard/*`, manages closers + setters in one place.

A shared **Notes** feature (priority, tags, linked leads, multi-recipient sharing, recipient archive) is available to both closer and setter portals.

## Tech Stack

- **Framework:** Next.js 14.2.28 (App Router, React 18.3.0)
- **Language:** TypeScript 5 (strict mode)
- **Database:** Turso (serverless SQLite via `@libsql/client`)
- **Styling:** Tailwind CSS 3.4 + shadcn/ui (Radix UI primitives)
- **Data Fetching:** TanStack React Query 5 (4-min stale time, retry except 401/403)
- **Validation:** Zod (Meta API responses), manual validation elsewhere
- **AI:** Anthropic SDK (Claude for chat/analysis), Google GenAI (Gemini for image gen)
- **External APIs:** Meta Graph API v25.0, Google Calendar (OAuth 2.0)
- **Charts:** Recharts 2.12
- **Icons:** Lucide React

## Commands

```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint (Next.js config)
```

No test framework is configured. No CI/CD pipeline exists.

## Project Structure

```
app/
  layout.tsx              # Root layout (ThemeProvider, QueryProvider)
  actions/                # Server actions (auth, CRUD, file uploads)
  api/                    # API routes (RESTful, force-dynamic)
    calendar/             # Shared calendar endpoints (admin + closer + setter)
      events/             # Google Calendar events (scoped, cached)
      appointments/       # Team-wide setter-claim index
      attendance/         # Team-wide show/no-show map + GHL sync state (GET + POST discovery)
    closer/               # Closer/setter-session endpoints
      attendance/         # PATCH/DELETE marks + sync to GHL; resync/ for Push/Pull
      setter/             # Setter-only: stats, appointments
      notes/              # Notes CRUD + share + archive + lead-context
    admin/clients/        # Client Directory: payout-pool, from-payout, billing, notes, documents, rebill-alerts, invoice (prefill + send)
  dashboard/              # Admin dashboard pages
  admin/login/            # Admin login
  [slug]/portal/          # Client portal (dynamic slug)
  closer/                 # Closer + setter portal (shared c_sess, role-gated)
    (protected)/
      dashboard/          # Closer dashboard (closers-only layout gate)
      calendar/           # Closer calendar + attendance marking
      new-deal/           # Closer deal creation
      notes/              # Closer notes page
      setter/             # Setter tree (setters-only layout gate)
        page.tsx          # Setter dashboard
        appointments/     # Setter appointment claim + flags
        notes/            # Setter notes page (same component as closer)
components/
  ui/                     # shadcn/ui base components (button, dialog, table, etc.)
  layout/                 # DashboardShell, DashboardClientShell
  providers/              # AdminProvider, QueryProvider, ThemeProvider
  overview/               # KPI widgets, AccountsTable, SpendDonutChart
  charts/                 # Recharts visualizations
  closers/                # Closer management UI (admin-facing)
  closer/                 # Closer + setter portal UI
                          #   NotesBoard, NoteCard, NoteEditor
                          #   LeadPicker, LeadContextModal, SharePicker
                          #   SetterBentoGrid, SetterFollowUpList, SetterRecentDeals
                          #   SetterCalendarEventList, SetterAppointmentEditor
                          #   NoShowFollowUpList, CalendarEventList
  admins/                 # Admin panel components
  users/                  # Client Directory UI (ClientDirectory, ClientFilters, AddClientModal,
                          #   RebillAlertsPanel, RebillStatusChip, ClientInvoiceDrawer,
                          #   Client{Billing,Documents,Notes,Settings}Tab)
  alerts/                 # Alert feed
  chat/                   # AI chat interface
  ad-copy/                # Ad copy editor
  generate/               # Image generation UI
  portal/                 # Client portal components
  drilldown/              # Drill-down analytics
  filters/                # Date range and filter controls
hooks/                    # Custom React Query hooks (useAccounts, useCampaigns, etc.)
lib/
  db.ts                   # Database client, schema, migrations (auto-run on startup)
  session.ts              # Client session (u_sess cookie, HMAC-SHA256)
  adminSession.ts         # Admin session (a_sess cookie)
  closerSession.ts        # Closer/setter session (c_sess cookie)
  closerGuards.ts         # Role-aware gates: requireCloserRecord, getSetterFromSession
  permissions.ts          # RBAC system (9 keys)
  cache.ts                # In-memory TTL cache (5-min default, Google events 2-min)
  admins.ts               # Admin CRUD
  users.ts                # User CRUD
  closers.ts              # Closer/setter CRUD (single table, role column)
  deals.ts                # Deal CRUD (includes setter_id attribution)
  appointments.ts         # Setter appointment CRUD + pre/post-call enums + labels
  setterStats.ts          # Setter dashboard aggregates (commission, show rate, etc.)
  setterAttribution.ts    # resolveSetterForEvent + reassignDealsForEvent
  eventAttendance.ts      # Show/no-show marks, no-show follow-up queries, enrichment
  ghlAppointmentLinks.ts  # Google event ↔ GHL appointment id bridge + denormalized sync state
  attendanceSync.ts       # Orchestrator: push (dashboard → GHL), pull (GHL → dashboard), discovery
  notes.ts                # Notes CRUD + sharing + archive + validation helpers
  clientDirectory.ts      # Client Directory aggregator (users + accounts + payout xref + re-bill schedule)
  clientBilling.ts        # Per-client re-bill schedule engine (hybrid) + billing config CRUD
  clientNotes.ts          # Per-client admin notes + reminders
  clientInvoice.ts        # Re-bill invoice prefill (InvoiceData) + unique client invoice number
  auditLog.ts             # Audit log writes/reads
  meta/
    client.ts             # Meta API client (rate limiting, error classes)
    endpoints.ts          # Meta API endpoint helpers
    schemas.ts            # Zod schemas for Meta API responses
  google/
    oauth.ts              # Google OAuth 2.0 flow
    calendar.ts           # Google Calendar integration (scope-keyed, server-cached)
    tokenStorage.ts       # AES-256-GCM encrypted token storage (NODE_ENV scope)
  ghl/
    client.ts             # GHL v2 client (PIT auth, rate limiter, 429 retry)
    calendars.ts          # Bulk appointments listing (cached 5 min)
    appointments.ts       # Single-appointment GET/PUT + composite-key resolver + name-based closer mapping
    crossReference.ts     # (title|startMs|endMs) composite key — bridges Google ↔ GHL
    contacts.ts           # Contact search + notes + appointments index
    users.ts              # Location user catalog (cached 10 min)
    conversations.ts      # Messages thread reads
    opportunities.ts      # Pipeline opportunities
types/
  dashboard.ts            # Domain types (AccountSummary, CampaignRow, InsightMetrics)
  api.ts                  # API response types (ApiResponse<T>)
  alerts.ts               # Alert types
middleware.ts             # Edge: auth verification, admin route permission checks
instrumentation.ts        # DB migration trigger on startup
```

## Architecture

### Authentication

Three separate session types with HMAC-SHA256 signed tokens:
- `a_sess` — Admin dashboard (7-day expiry)
- `c_sess` — Closer **and setter** portal (7-day expiry, role embedded in payload)
- `u_sess` — Client portal (7-day expiry)

Token format: base64url payload + hex HMAC-SHA256 signature. Constant-time comparison via `crypto.timingSafeEqual`. Passwords hashed with scrypt (N=16384, r=8, p=1, dkLen=64, 16-byte salt).

**Setters share the closer session.** A setter is a row in the `closers` table with `role='setter'`. The `c_sess` payload carries `role`, but the authoritative role check lives in the protected layouts via `requireCloserRecord({ allow: "closers-only" | "setters-only" })` — middleware deliberately skips role redirects to avoid loops when an admin flips a user's role.

### Authorization (RBAC)

9 permission keys enforced at middleware + API route level:
| Key | Access |
|-----|--------|
| `dashboard` | Core metrics/overview |
| `analyst` | AI chat analysis |
| `studio` | Image generation |
| `jsoneditor` | JSON editor |
| `adcopy` | Ad copy management |
| `invoice` | Invoice surfaces |
| `users` | User management |
| `closers` | Closer/setter/deal management |
| `admin` | Admin panel |

Super admins (`isSuper`) bypass all permission checks. Cannot set `isSuper` via API.

**Closer-side role gating** (setter vs closer) is handled in the `/closer/(protected)/` layout tree, not middleware. Each route folder has its own `layout.tsx` calling `requireCloserRecord` with an `allow` directive; mismatched roles are redirected at server render time. Single source of truth is the DB, never the token.

### Routing (App Router)

**Admin Dashboard** (`/dashboard/*`) — requires `a_sess`:
- `/dashboard` — Overview with KPIs
- `/dashboard/accounts/[accountId]` — Account drill-down
- `/dashboard/accounts/[accountId]/campaigns/[campaignId]` — Campaign details
- `/dashboard/accounts/[accountId]/campaigns/[campaignId]/adsets/[adsetId]` — Ad set details
- `/dashboard/chat` — AI analyst (requires `analyst` perm)
- `/dashboard/generate` — Image studio (requires `studio` perm)
- `/dashboard/ad-copy` — Ad copy (requires `adcopy` perm)
- `/dashboard/users` — Client Directory: full-screen, payout-cross-referenced client list + re-bill alerts; per-client page at `/dashboard/users/[userId]` (Overview / Billing / Documents / Notes / Settings tabs) (requires `users` perm)
- `/dashboard/closers` — Closer management (requires `closers` perm)
- `/dashboard/admins` — Admin management (requires `admin` perm)
- `/dashboard/settings` — Admin documentation (page-by-page reference; rendered server-side, no client JS)

**Client Portal** (`/[slug]/portal/*`) — requires `u_sess`

**Closer Portal** (`/closer/*`) — requires `c_sess`. Closer-only sub-routes (gated by role in the layout tree):
- `/closer/dashboard` — metrics + deals + no-show follow-ups (closer-scoped)
- `/closer/calendar` — team-wide attendance view, show/no-show marking (closer writes)
- `/closer/new-deal` — deal creation with Google event linkage
- `/closer/notes` — personal notes + shared-with-me
- `/closer/docs` — portal documentation (shared with setters; rendered server-side, no client JS)

**Setter Portal** (`/closer/setter/*`) — same `c_sess` cookie, role=`setter` required:
- `/closer/setter` — dashboard (appointments set, show rate, revenue attributed, commission earned, active + recovered no-show sections, deals credited)
- `/closer/setter/appointments` — claim Google events + set pre/post-call flags + notes
- `/closer/setter/notes` — same notes component as closer
- `/closer/docs` — same documentation page as closer (sidebar link present in both roles)

### Database

Turso (libSQL) with raw parameterized SQL (no ORM). Tables:
- `users` — Client portal users (slug, email, status, mrr, category). `joined_at` + `payout_brand` (additive) link a client to the Payout DB and anchor the re-bill schedule
- `client_accounts` — Many-to-many user-to-Meta-account mapping
- `admins` — Dashboard admins with permission columns (`perm_*`)
- `closers` — Sales team AND setters (discriminated by `role` column; commission in basis points, quota in cents)
- `deals` — Sales pipeline. `closer_id` (NOT NULL, CASCADE) + `setter_id` (nullable, auto-resolved from appointments by shared `google_event_id`)
- `appointments` — Setter claims on Google Calendar events. UNIQUE(`setter_id`, `google_event_id`); carries pre/post-call status + client info + notes
- `event_attendance` — Closer-marked show/no-show per event. PK (`google_event_id`, `closer_id`)
- `ghl_appointment_links` — Bridges Google Calendar event id → GHL appointment id, plus denormalized last-observed status on each side, a `sync_state` (`synced` / `out_of_sync`), and `ghl_sub_account_id` (`peptide` / `agency`) recording which GHL sub-account owns the appointment. PK `google_event_id`, UNIQUE `ghl_appointment_id`. Presence of a row = event is GHL-linked; absence = non-GHL event (sync code is a no-op). Every push/pull reads the stamped sub-account to route to the right PIT — sub-accounts are never re-resolved after discovery
- `notes` — Personal scratchpad per user (title, markdown body, priority, due date, tags JSON, linked `google_event_id` / `deal_id`)
- `note_shares` — Junction for note sharing. (`note_id` FK CASCADE, `shared_with_id`, `archived_at` nullable — recipient soft-dismiss)
- `client_billing` — Per-client re-bill config (PK `user_id`; `billing_day`, `paused`/`pause_reason`, `extend_until`, `last_rebilled_override`, `lead_days`). Absent row = monthly defaults anchored on join date
- `client_notes` — Per-client admin notes + reminders (`remind_at` nullable; a due reminder surfaces in the directory's re-bill alerts)
- `audit_log` — Admin action log
- `google_calendar_config` — Encrypted OAuth tokens. `scope` column (NODE_ENV-keyed) isolates dev/prod token sets in a shared database
- Plus invoice/contract/payout/onboarding tables (see `lib/db.ts`)

Migrations are code-driven in `lib/db.ts`, run automatically via `instrumentation.ts` on startup. **Strictly additive** — `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN` wrapped in try/catch (existing column = no-op). Idempotent and safe for concurrent calls.

### Caching

In-memory TTL cache (`lib/cache.ts`):
- Accounts, Insights, Campaigns, AdSets, Ads, Creatives, Pages: 5 min
- Alerts, Activities: 3 min
- Pixel Health: 10 min
- Google Calendar events: 2 min (scope-keyed so dev + prod don't share)
- Payout brand histories (Client Directory MRR / re-bill): 90s, busted on any payout write

HTTP: `Cache-Control: private, max-age=60, stale-while-revalidate=240`

Client-side React Query:
- Setter + closer dashboards: `staleTime` + `refetchInterval` both 120s (matches Google cache TTL so polling lands on cached data)
- Notes + lead-context: 30–60s
- Google Calendar status, share targets: 60–120s

### External Integrations

- **Meta Graph API** — Ad accounts, campaigns, insights, creatives, pixels. Zod-validated responses. Rate limit handling (code 80000) with exponential backoff. Concurrency limit configurable via `META_CONCURRENCY_LIMIT`. **Not touched by the closer or setter portal** — those code paths have zero Meta API consumption.
- **Google Calendar** — OAuth 2.0 (read-only scope). Tokens encrypted with AES-256-GCM at rest, **scope-keyed by `NODE_ENV`** so dev and prod tokens coexist in a shared database without thrashing. Auto-refresh with 5-min buffer. Calendar fetches cached server-side (2 min). Decrypt path format-sniffs our cipher format; on mismatch we throw loudly rather than silently passing ciphertext to Google.
- **Anthropic Claude** — Chat analytics with rate limiting (20 req/min per admin). Streaming responses.
- **Google Gemini** — Image generation capabilities.
- **GoHighLevel (GHL) v2** — Private Integration Token auth, **multi-sub-account** (currently Peptide Ads + Agency Collective; registry in `lib/ghl/subAccounts.ts`). Each lib/ghl/* function takes an optional `subAccountId` (defaults to `peptide` for backward compat); cache keys are sub-account scoped so concurrent reads of both accounts don't collide. Bulk appointment + contact listings cached 5 min server-side per account. Token-bucket rate limit (50 r/s) is **shared across accounts** — both PITs drain the same bucket. **Bidirectional appointment-status sync** with the dashboard (see Sales Pipeline → GHL Appointment Status Sync). All resource-specific modules live in `lib/ghl/`; appointment-status endpoints use `Version: 2023-02-21` (older versions silently no-op the PUT — see `lib/ghl/appointments.ts` for the canonical body shape required).

## Sales Pipeline: Setter + Closer Collaboration

### Deal attribution flow

Every deal can be credited to two teammates: the **closer** (`deals.closer_id`, required) and the **setter** (`deals.setter_id`, optional). Attribution is automatic, keyed on `google_event_id`:

1. **Setter claims** a Google Calendar event → creates an `appointments` row keyed by `(setter_id, google_event_id)` with pre/post-call flags + notes.
2. **Closer creates a deal** (via `/closer/new-deal` or `/api/closer/calendar/link-deal`) and links it to the same Google event. `resolveSetterForEvent(googleEventId)` looks up the latest-updated appointment for that event and stores the setter id on the deal.
3. **Out-of-order** (deal created before setter claimed, or setter claims a new event): `reassignDealsForEvent(googleEventId)` fires from the setter's POST/DELETE handler and re-runs the resolution on every matching deal.
4. **Multi-setter** claims: `ORDER BY updated_at DESC LIMIT 1` — latest wins. Setter A then B → deal credited to B. If A updates their notes later, they reclaim credit.
5. **Closer deletion** cascades CASCADE on `deals.closer_id` (pre-existing behavior). Setter deletion is cleaned up explicitly in `deleteCloser`: nulls `deals.setter_id`, deletes their appointments and notes, clears their `note_shares` rows as both owner and recipient.

### Setter dashboard metrics (`lib/setterStats.ts`)

- `appointmentsSet` — COUNT of their claims
- `showRate` — latest show/no_show per event, intersected with their claimed events (window function in SQL picks the freshest attendance row per event)
- `dealsLinked` / `dealsClosed` / `revenueAttributed` — aggregates on `deals` WHERE `setter_id = me`
- `commissionEarned` — `paidRevenue × commission_rate / 10000`, applied only to `closed + paid` deals (same commission_rate column, different semantics per role)
- `pendingDeals` — counts `pending_signature`, `follow_up`, `rescheduled`
- No-shows: team-wide for setters (they follow up on every no-show), role-scoped for closers (their own marks only). Enriched with Google Calendar event info server-side so rows without an appointment or deal still show the client's name/email/time.

### Team-wide shared surfaces

- `GET /api/calendar/events` — shared by admin, closer, setter for raw events (cached).
- `GET /api/calendar/attendance` — team-wide show/no-show map. Setter reads only this (no GHL discovery).
- `POST /api/calendar/attendance` — same map, plus body `{ events: [{id,title,start,end}] }` triggers a discovery pass that creates `ghl_appointment_links` rows for any composite-key matches and returns a per-event `sync` map (`dashboardStatus`, `ghlStatus`, `syncState`). Closer + admin calendar pages use this so the sync chip surfaces on first load.
- `GET /api/calendar/appointments` — team-wide setter-claim index. Admin + closer read; setters blocked (they use their own endpoint).

### GHL Appointment Status Sync

Dashboard `event_attendance` (show/no-show) and GHL `appointmentStatus` are kept in step through an explicit orchestrator (`lib/attendanceSync.ts`). No webhooks, no GHL workflow automations — outbound is real-time PUT, inbound is on-demand pull.

**Multi-sub-account.** The dashboard currently sits in front of two GHL sub-accounts (Peptide Ads + Agency Collective). Every link row is stamped with its owning `ghl_sub_account_id` at discovery time and read on every subsequent sync to pick the right PIT. The calendar event chip shows a small `AC`/`PA` badge so closers + admins can see at a glance which CRM a call comes from; the GHL Contacts page (`/closer/ghl-contacts`, `/dashboard/closers/ghl-contacts`) has tabs to switch between sub-accounts (default Agency, persisted in `?subAccount=`). Closer chip clicks route to `/closer/ghl-contacts?selected=...&subAccount=...`; admin chip clicks route to `/dashboard/closers/ghl-contacts?selected=...&subAccount=...` (the chip's `isAdmin` prop, plumbed from the calendar page, picks the base path).

**Bridging the two systems.** GHL doesn't expose the synced Google event id, so a Google event is matched to a GHL appointment via composite key `(title|startMs|endMs)` (same primitive `lib/ghl/crossReference.ts` uses). On first match, the result is persisted in `ghl_appointment_links` along with the winning `ghl_sub_account_id`, and reused for every subsequent sync — direct id lookups, no re-matching, no per-call sub-account resolution.

**Discovery.** The closer + admin calendar pages POST the visible events to `/api/calendar/attendance`; for any event without a link row, the server pulls bulk appointments from **every configured sub-account in parallel** and tries a composite-key match against each. First match wins (sub priority = `SUB_ACCOUNTS` order in `lib/ghl/subAccounts.ts`); cross-sub-account collisions log a warning. Discovery upserts run in parallel.

**Push (dashboard → GHL).** After every `event_attendance` write (`PATCH /api/closer/attendance`, deal-creation auto-mark, or manual `[Push]` button), `syncEventAttendanceToGhl` PUTs `appointmentStatus` to GHL with the canonical body shape (`appointmentStatus` + `calendarId` + `startTime` + `endTime` + `title` + `assignedUserId`). The PUT response carries the new status and is trusted as the verify signal — no second GET round-trip. Drift detection on the next read catches any GHL automation that immediately overwrites. The bulk-listing cache is busted on every successful PUT so the next refetch sees the fresh value.

**Pull (GHL → dashboard).** The `[Pull]` button (and the resync endpoint) calls `syncEventAttendanceFromGhl`, which GETs the appointment, maps `showed`/`noshow` to dashboard attendance, resolves the responsible closer via GHL `assignedUserId` → user name → `closers.display_name` match, then **replaces** all `event_attendance` rows for the event with a single attributed row (DELETE + INSERT in one libSQL `db.batch`). GHL non-attendance states (`confirmed` / `cancelled` / `invalid` / `new`) wipe the dashboard side. Unmatched names return `outcome: "needs_attribution"` and the chip stays out-of-sync.

**Mark/unselect mapping.**
| Dashboard action | GHL `appointmentStatus` |
|---|---|
| Mark "Showed" | `showed` |
| Mark "No Show" | `noshow` |
| Unselect (clear) | `confirmed` |

**Drift detection.** Every `POST /api/calendar/attendance` re-reads the cached GHL listing for the visible events' links and recomputes `syncState` on the fly. Detected drift flips the chip from green ("Synced") to amber ("Out of sync · Dashboard: X · GHL: Y") with `[Push to GHL]` and `[Pull from GHL]` buttons (`/api/closer/attendance/resync`). Both directions reconcile against team-wide latest, matching what the chip displays. The recomputed `sync_state` is persisted back to the link row in batched writes before the response returns.

**Non-GHL events** (no composite-key match) skip the sync code path entirely — every sync function returns `outcome: "non_ghl"` early so dashboard behavior is identical to pre-sync.

### GHL CRM Funnel Sync (pipeline stage + contact tags)

Separate from appointment-status sync (`lib/attendanceSync.ts`), the **CRM funnel sync** (`lib/ghlCrmSync.ts`) drives the agency's sales pipeline + tags in GHL off dashboard events. Both modules bridge to GHL through the same `ghl_appointment_links` row (composite-key matched, sub-account-stamped); CRM sync reads `ghl_contact_id` + `ghl_sub_account_id` off that link.

**Triggers + effects.**
| Dashboard event | GHL effect |
|---|---|
| Closer marks **Showed** on the calendar, or a deal auto-marks "showed" (deal created closed / status→closed via closer or admin) | Tag contact `showed_didnt_close` + move their opportunity to the **"Showed didn't close"** stage |
| A **linked** deal is marked **paid** on the admin dashboard (unpaid→paid edge) | Swap tags `showed_didnt_close` → `active_client` + move the opportunity to the **"Active Client"** stage |

A **no-show** or unselect leaves the funnel untouched (only "showed" advances it). The "Active Client" promotion requires the deal to be GHL-linked (`google_event_id` resolves to a link row with a contact) — non-linked deals are a no-op, same as appointment-status sync.

**Per-sub-account pipeline.** The pipeline name differs by sub-account; stage + tag names are shared. Config lives at the top of `lib/ghlCrmSync.ts`:
- Agency Collective → pipeline **"MASTER PIPELINE"**
- Peptide Ads → pipeline **"Website Leads"**
- Stages: **"Showed didn't close"**, **"Active Client"** · Tags: `showed_didnt_close`, `active_client`

`PIPELINE_NAME_BY_SUB` is a `Record<GhlSubAccountId, string>`, so adding a sub-account to the registry forces a pipeline name here at compile time.

**Opportunity handling.** `update existing, else create` — `findOpportunityForContactInPipeline` looks for the contact's opportunity already in the target pipeline; found → PUT it to the new stage (preserving its open/won/lost status + name); none → POST a new opportunity (`status: "open"`, name from the deal/event or the GHL contact). It uses a **targeted `contact_id` search** (`searchOpportunitiesByContact`), NOT the cached bulk `getOpportunitiesByContact` map — the bulk map is capped at `MAX_OPPORTUNITIES`, so on a large location a contact's existing opportunity could fall outside the cap and we'd create a duplicate instead of moving it. Pipeline + stage names resolve to ids via `resolvePipelineStageByName` (case/whitespace/apostrophe-tolerant; logs available names and no-ops if the pipeline or stage can't be found, so a renamed stage fails loudly in logs rather than writing to the wrong place).

**Versions + endpoints.** Opportunities use `POST /opportunities/` + `PUT /opportunities/:id` (Version `2023-02-21`, same as the existing opportunities reads). Tags use `POST` / `DELETE /contacts/:id/tags` (contacts-default Version `2021-07-28`, like the rest of `lib/ghl/contacts.ts`). Every write busts the relevant in-process cache (`opportunitiesByContactCacheKey`, `contact-by-id`) so the GHL Contacts page reflects it on next refetch; the page-level `batch-base` search cache expires on its own 5-min TTL.

**Best-effort.** `bestEffortSyncShowedDidntClose` / `bestEffortSyncActiveClient` never throw and never block or roll back the dashboard write that triggered them — failures are logged via `describeError` (PII-safe). Like attendance push, they only resolve a brand-new link first-sight when called with event title/start/end coords (calendar "Showed" path); the deal-creation/close paths rely on a link already existing (created by calendar discovery or a prior attendance mark). Routes that newly run these syncs set `maxDuration = 30`.

## Notes (per-user scratchpad with sharing)

Dedicated page at `/closer/notes` (closer-only) and `/closer/setter/notes` (setter-only). Same component, same `notes` table, filtered by owner.

**Per note:** title + markdown body (rendered with `react-markdown`, safe defaults), priority (high/medium/low), optional due date, free-form tags, optional linked lead (picks from appointments + deals + no-shows; linked via `google_event_id` or `deal_id`).

**Grouping:** client-side toggle — priority / due date / tag / linked lead.

**Sharing** (`note_shares` table):
- Owner picks recipients from a searchable teammate directory (excludes self).
- Recipients see the note read-only on their board with a "Shared by X" badge.
- Only the owner can PATCH or DELETE. Recipients get 403 on mutations.
- Recipient can **archive** (`note_shares.archived_at`) to dismiss the note from their active view — owner's copy and other recipients are unaffected. Archived section shows at the bottom of the notes page with unarchive action.
- Cap: 50 recipients per note. Share list validated against active closers directory on POST/PATCH.

**Lead-context modal** (opens from any note's linked-lead chip): aggregates the Google event + every setter claim + every deal + every attendance mark for that lead. One endpoint, one modal — setter, closer, admin all get the full picture.

## Client Directory (`/dashboard/users`)

Full-screen, Payouts-style admin surface for managing client portal accounts, cross-referenced with the Payout DB. **Permission: `users`** (route-level admin auth + middleware gate on `/api/admin/clients/*`). Two tabs: **Directory** (the client table) and **Support** (the existing admin↔client chat inbox). The redesign is **strictly additive** and **does not touch portal login or Meta-account linking** — `slug` / `password_hash` / `email` / `u_sess` / `client_accounts` are unchanged. The "client ↔ payout brand" link is a separate concept from the "client ↔ Meta account" and "client ↔ portal" links.

### Payout cross-reference

Each client links to a Payout-DB brand via `users.payout_brand` (set when added from the payout pool; editable in the per-client Settings tab; unlinked clients fall back to robust fuzzy brand-name matching via `normalizeBrandName`/`brandsMatch`). The link drives the directory's **Monthly MRR** (latest payout month's `amount_due`), total revenue, payment history, and the invoices/scopes on the Documents tab. Aggregation lives in `lib/clientDirectory.ts` (`buildClientDirectory` / `getClientDetail` / `getPayoutPool`) over `getAllBrandHistories()` in `lib/payouts.ts` (cached 90s, busted on payout writes).

### Adding clients

`AddClientModal` has two paths: **From Payout DB** (`POST /api/admin/clients/from-payout`) — pick an unlinked brand from `GET /api/admin/clients/payout-pool?since&until` (defaults to the past week, widenable), seeding `joined_at` / MRR / `payout_brand`; and **Manual** (reuses `CreateUserForm` → `createUserAction`). Both funnel through the same creation invariants (slug gen + `account_id=""`); from-payout rejects re-adding an already-represented brand (409).

### Re-bill schedule (hybrid) + alerts

`lib/clientBilling.ts` `computeRebillSchedule()` is a pure engine: `lastRebilledAt = max(latest payout month, manual override)`, `nextRebillAt = one month after`, anchored on `joined_at`. **Exception** = pause (skip re-billing); **extension** = `extend_until` (defer the next bill). Status ∈ `upcoming | due | overdue | paused | extended | unscheduled`; a client with no payment history schedules from today (never false-overdue against a past join date). Due/overdue clients (+ due `client_notes` reminders) surface in a live in-app **re-bill alerts** banner + count badge (`GET /api/admin/clients/rebill-alerts`) — computed on load, **no cron** (mirrors the Meta alert feed). Config persists via `PATCH /api/admin/clients/[userId]/billing`.

### Per-client page (`/dashboard/users/[userId]`)

Tabs: **Overview** (profile + onboarding + linked-account KPIs), **Billing** (schedule + config + payout payment history + **Send re-bill invoice**), **Documents** (invoices/scopes; `users`-gated client-scoped download at `/api/admin/clients/[userId]/documents/[docId]`, separate from the `closers`-gated Payouts download), **Notes & Reminders** (`client_notes` CRUD), **Settings** (profile/status/category, AI-analyst toggle, Meta-account management, payout-brand link editor).

### Re-bill invoicing

The Billing tab's **Send re-bill invoice** button opens `ClientInvoiceDrawer`, reusing the deal-invoice machinery (`@react-pdf/renderer` `InvoicePdfDocument`, `InvoiceServiceSelector` presets, `agency_config` sender/payment/logo/theme, `sendInvoiceEmail`) **without** scope/contract. Prefilled via `GET /api/admin/clients/[userId]/invoice/prefill` (`lib/clientInvoice.ts`): recipient = the client, a line item seeded from the client's payout MRR, agency sender + payment terms, and a unique number `INV-YYYYMMDD-<hex>` (random suffix — client invoices live in `payout_documents`, which has no invoice-number column). The admin adjusts line items + descriptions, CC, dates, and local/international payment terms.

On `POST /api/admin/clients/[userId]/invoice/send` the PDF is generated client-side, emailed via `sendInvoiceEmail(variant: "rebill")` (a billing-specific message; the onboarding/deal email is unchanged via the default `variant`), then **filed in `payout_documents`** (`doc_type='invoice'`, keyed to the client's brand) so it shows on both the Payout page and the client's Documents tab. **Send-only** — it does NOT create a payout row or advance the re-bill schedule (that stays driven by the Payout DB). Sender is `SMTP_USER`; recipient is the client's email (editable per send). The drawer is lazy-loaded (`next/dynamic`, `ssr:false`) to keep `@react-pdf/renderer` out of the per-client page's initial bundle.

### Filters

Client-side (data bounded to the directory): search, status, category, re-bill status, MRR range, date-joined range, last-re-bill range. The "Re-bills Due" summary card opens the alerts banner.

## Code Conventions

### Naming
- Components: PascalCase files (`CloserCardList.tsx`)
- Hooks: `use` prefix, camelCase files (`useAccounts.ts`)
- Server actions: camelCase with `Action` suffix (`createCloserAction`)
- Constants: UPPER_SNAKE_CASE (`MAX_BYTES`, `ALLOWED_EXTS`)
- Types: PascalCase (`AccountSummary`, `DealPublic`)

### Patterns
- All imports use `@/*` path alias (maps to project root)
- Components marked `"use client"` for interactivity
- Server actions use `"use server"` directive
- API routes export `GET`/`POST`/`PATCH`/`DELETE` handlers, all `force-dynamic`
- Custom hooks wrap TanStack React Query with typed fetch functions
- `cn()` utility (clsx + tailwind-merge) for className composition
- CVA (class-variance-authority) for component variants
- Error classes: `RateLimitError`, `TokenExpiredError`, `MetaApiError`
- Server action return pattern: `{ error?: string }`
- API response wrapper: `ApiResponse<T>` with `meta: { cached, timestamp, dateRange }`

### State Management
- **Server state:** TanStack React Query (custom hooks in `/hooks/`)
- **Auth state:** React Context (`AdminProvider` with `useAdmin()` hook)
- **UI state:** Local `useState` (no global UI state library)

## Security Headers (next.config.js)

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- CSP configured (allows self + Meta CDN domains)

## Environment Variables

Required in `.env.local`:
```
SESSION_SECRET          # HMAC signing key (min 32 chars)
TURSO_DATABASE_URL      # Turso database URL
TURSO_AUTH_TOKEN         # Turso auth token
META_ACCESS_TOKEN        # Facebook Graph API token
ANTHROPIC_API_KEY        # Claude API key
GEMINI_API_KEY           # Google Gemini API key
GOOGLE_CLIENT_ID         # Google OAuth client ID
GOOGLE_CLIENT_SECRET     # Google OAuth client secret
GOOGLE_REDIRECT_URI      # Google OAuth callback URL
```

Optional:
```
META_API_VERSION         # Default: v25.0
META_CONCURRENCY_LIMIT   # Default: 5
META_CACHE_TTL_SECONDS   # Default: 300
GHL_PIT                  # Peptide Ads sub-account PIT (enables appointment status sync + GHL contact surfaces for Peptide Ads)
GHL_LOCATION_ID          # Peptide Ads location id; paired with GHL_PIT
GHL_PIT_AGENCY           # Agency Collective sub-account PIT (same surfaces, scoped to Agency Collective)
GHL_LOCATION_ID_AGENCY   # Agency Collective location id; paired with GHL_PIT_AGENCY
```

Each GHL sub-account is enabled independently. When none are set the chip never renders and `syncEventAttendanceToGhl` returns `outcome: "ghl_unavailable"` — dashboard behavior is identical to pre-sync. When only one is set, discovery and sync work for that account only and events from the other behave as non-GHL. Sub-account registry + env mapping lives in `lib/ghl/subAccounts.ts` — adding a third account is a one-file change there plus the env vars.

## Key Implementation Notes

- Database migrations run on every app startup — keep `migrate()` idempotent; all additions wrapped in `CREATE TABLE IF NOT EXISTS` or try/catch'd `ALTER ... ADD COLUMN`
- All SQL uses parameterized queries (no string concatenation) — SQL injection safe
- Passwords never exposed in API responses (stripped via destructuring)
- Google OAuth tokens encrypted at rest with AES-256-GCM derived from SESSION_SECRET. Tokens are **scope-keyed by NODE_ENV** so the same Turso database can serve dev and prod without thrashing; reconnecting in one env doesn't clobber the other
- Decryption format-sniffs the ciphertext pattern; if it looks like our format but decryption fails (wrong SESSION_SECRET), we throw loudly rather than silently sending ciphertext to Google
- Audit log is fire-and-forget (errors suppressed to not block operations). **Notes, shares, and setter actions are not audit-logged** — considered v1 scope
- Multi-account support: users can have multiple Meta ad accounts via `client_accounts` junction table
- Commission rates stored in basis points, quotas in cents (integer math)
- Super admin seeded on first migration (username defined in `lib/db.ts`)
- `createPortal()` used for dropdowns to escape stacking context
- **Setter is a closer with `role='setter'`.** Everywhere a closer lookup happens, setters are included unless explicitly filtered (e.g., `getTeamStats` excludes them from closer leaderboards)
- **libSQL FK cascade is not guaranteed to fire** — explicit cleanup in `deleteCloser` covers appointments, deals.setter_id, notes, and note_shares (both owner and recipient directions)
- **Markdown rendering** uses react-markdown with default (safe) config — no `rehype-raw`, no `dangerouslySetInnerHTML`, raw HTML in user notes is escaped
- **Notes sharing** junction uses FK CASCADE on `note_shares.note_id`, loose text on `shared_with_id` — handled by explicit cleanup rather than relying on libSQL FK behavior
- **No role-based redirects in middleware for closer/setter routes.** Layout-level DB checks are authoritative (prevents loops when admin changes a user's role mid-session)
- **Client-side dashboards cap queries to what maps to a screen** — notes list 500, team no-shows 500, setter recent deals 50. Pagination is client-side where data is already bounded
- **Lead context enrichment** (`enrichNoShowsFromCalendar`) fetches a 2-year Google Calendar window on demand, cached 2 min server-side; without it, un-claimed no-shows would show as "No-show" with no client identity
- **GHL appointment status sync uses `Version: 2023-02-21`** for `/calendars/events/appointments/*`. Other GHL endpoint families use different versions (`/calendars/events` bulk uses the same, contacts uses 2021-07-28). Sending the wrong version returns 200 but silently no-ops the PUT. PUT body must include `calendarId` + `startTime` + `endTime` + `title` + `assignedUserId` alongside the status or the write doesn't persist — fetch the current appointment first and round-trip those fields
- **Bidirectional sync is opt-in per event** via the composite-key match. There is no manual override to "force-link" a Google event to a specific GHL appointment id — if titles or times don't match, the chip never appears and the event behaves as non-GHL. Surface this for support cases where ops expects the chip on a known-mismatched pair
- **GHL closer attribution uses display-name matching.** GHL `assignedUserId` → user name (via `/users` cached 10 min) → normalized lookup in `closers.display_name` (lowercase, whitespace-collapsed, cached 5 min). No `closers.ghl_user_id` column — renames in either system break attribution until names re-align. If this becomes a problem, add the column as a strictly additive migration. The GHL user roster is **per-sub-account** (different PIT = different `/users` namespace), so name resolution always reads the link's stamped `subAccountId` to pick the right roster
- **CRM funnel sync resolves pipeline + stage by NAME** (`lib/ghlCrmSync.ts` → `resolvePipelineStageByName`). The expected names are hard-coded: pipelines "MASTER PIPELINE" (agency) / "Website Leads" (peptide), stages "Showed didn't close" / "Active Client". Matching is case/whitespace/apostrophe-tolerant but a real **rename of a pipeline or stage in GHL silently disables the funnel sync** for that effect — it logs `[ghl-crm] pipeline/stage "…" not found` with the available names and no-ops (no opportunity is moved/created). First place to look when ops reports "leads stopped moving to Showed didn't close / Active Client." Fix is to re-align the GHL name or update the constant in `lib/ghlCrmSync.ts`
- **GHL bulk-listing cache is in-process only** — invalidation via `cache.delete(...)` after a PUT works on a single Node process but doesn't propagate across Vercel serverless instances. Drift detection catches the stale-cache window on the next read. Acceptable for current scale; would need a shared cache (Upstash / Redis) before fan-out becomes a problem
- **GHL sub-account registry** lives in `lib/ghl/subAccounts.ts`. All `lib/ghl/*` functions take an optional `subAccountId` (defaults to `peptide` for server-side backward compat with stored data); client-side hook defaults are `agency` (the UI's default tab). Every cache key is sub-account-scoped — concurrent reads of both accounts don't collide. The 50 r/s rate limiter is **shared across PITs** in process; if one account starves the other under load, split into per-PIT limiters
- **Per-sub-account in-process state**: `resolvedCalendarsPathBySub` (`lib/ghl/calendars.ts`), `resolvedUsersPathBySub` (`lib/ghl/users.ts`), and `cachedSingleflight` keys (`ghl:...:<subAccountId>:...`) all live per-process. Adding/removing a sub-account at runtime requires a redeploy to flush — Vercel does this on env var change automatically. `_closerNameMapCache` in `lib/ghl/appointments.ts` is global (sub-account-agnostic) because the dashboard `closers` table is shared across all sub-accounts
- **Multi-account discovery in `/api/calendar/attendance`** pulls bulk appointments from every configured sub-account in parallel via `Promise.allSettled` — one sub-account failing (rate limit, outage) doesn't break the other. Composite-key match priority = `SUB_ACCOUNTS` declaration order in `subAccounts.ts` (currently `agency` first, `peptide` second). Cross-sub-account composite-key collisions are logged once; same-sub collisions (duplicate Google events at the same time) are silently ignored after the first link
- **The link row is the routing key for all subsequent sync ops.** `ghl_appointment_links.ghl_sub_account_id` is stamped once at discovery time and never overwritten by `updateLinkSyncState`. Push/pull always read it to pick the right PIT; sub-accounts are never re-resolved. If the stamped sub-account's env vars are removed, sync returns `outcome: "ghl_unavailable"` and the chip stays out-of-sync — no silent re-routing to the wrong PIT
- **Migration self-healing for runtime-critical columns**: `lib/db.ts:ensureCriticalColumns` runs unconditionally on every cold start *before* the `SCHEMA_VERSION` probe. Column adds (incl. `ghl_sub_account_id`) use a SELECT-probe → ALTER pattern that's safe across concurrent Vercel cold starts (the rare `duplicate column name` from a race is caught and treated as success). The `SCHEMA_VERSION` body is for one-time CREATE TABLE / heavy migrations; anything runtime-critical belongs in `ensureCriticalColumns` so a stuck version stamp can't skip it
- **libSQL transactions** via `db.batch([...], "write")` — used in `attendanceSync.replaceAttendanceForEvent` (pull) and `conversations.clearConversationMessages`. Prefer this over sequential `db.execute` when two or more writes must succeed atomically
