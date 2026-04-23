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
      attendance/         # Team-wide show/no-show map
    closer/               # Closer/setter-session endpoints
      setter/             # Setter-only: stats, appointments
      notes/              # Notes CRUD + share + archive + lead-context
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
  users/                  # User management UI
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
  notes.ts                # Notes CRUD + sharing + archive + validation helpers
  auditLog.ts             # Audit log writes/reads
  meta/
    client.ts             # Meta API client (rate limiting, error classes)
    endpoints.ts          # Meta API endpoint helpers
    schemas.ts            # Zod schemas for Meta API responses
  google/
    oauth.ts              # Google OAuth 2.0 flow
    calendar.ts           # Google Calendar integration (scope-keyed, server-cached)
    tokenStorage.ts       # AES-256-GCM encrypted token storage (NODE_ENV scope)
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
- `/dashboard/users` — User management (requires `users` perm)
- `/dashboard/closers` — Closer management (requires `closers` perm)
- `/dashboard/admins` — Admin management (requires `admin` perm)

**Client Portal** (`/[slug]/portal/*`) — requires `u_sess`

**Closer Portal** (`/closer/*`) — requires `c_sess`. Closer-only sub-routes (gated by role in the layout tree):
- `/closer/dashboard` — metrics + deals + no-show follow-ups (closer-scoped)
- `/closer/calendar` — team-wide attendance view, show/no-show marking (closer writes)
- `/closer/new-deal` — deal creation with Google event linkage
- `/closer/notes` — personal notes + shared-with-me

**Setter Portal** (`/closer/setter/*`) — same `c_sess` cookie, role=`setter` required:
- `/closer/setter` — dashboard (appointments set, show rate, revenue attributed, commission earned, active + recovered no-show sections, deals credited)
- `/closer/setter/appointments` — claim Google events + set pre/post-call flags + notes
- `/closer/setter/notes` — same notes component as closer

### Database

Turso (libSQL) with raw parameterized SQL (no ORM). Tables:
- `users` — Client portal users (slug, email, status, mrr, category)
- `client_accounts` — Many-to-many user-to-Meta-account mapping
- `admins` — Dashboard admins with permission columns (`perm_*`)
- `closers` — Sales team AND setters (discriminated by `role` column; commission in basis points, quota in cents)
- `deals` — Sales pipeline. `closer_id` (NOT NULL, CASCADE) + `setter_id` (nullable, auto-resolved from appointments by shared `google_event_id`)
- `appointments` — Setter claims on Google Calendar events. UNIQUE(`setter_id`, `google_event_id`); carries pre/post-call status + client info + notes
- `event_attendance` — Closer-marked show/no-show per event. PK (`google_event_id`, `closer_id`)
- `notes` — Personal scratchpad per user (title, markdown body, priority, due date, tags JSON, linked `google_event_id` / `deal_id`)
- `note_shares` — Junction for note sharing. (`note_id` FK CASCADE, `shared_with_id`, `archived_at` nullable — recipient soft-dismiss)
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
- `GET /api/calendar/attendance` — team-wide show/no-show map. Admin + closer + setter all read; closers write via their own endpoint.
- `GET /api/calendar/appointments` — team-wide setter-claim index. Admin + closer read; setters blocked (they use their own endpoint).

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
```

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
