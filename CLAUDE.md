# Agency Collective Dashboard

## Overview

SaaS dashboard for managing Meta (Facebook) ad accounts with AI-powered analytics, multi-role access control, and client/closer portals. Built for Agency Collective to manage ad campaigns, sales pipeline, and client reporting.

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
  dashboard/              # Admin dashboard pages
  admin/login/            # Admin login
  [slug]/portal/          # Client portal (dynamic slug)
  closer/                 # Closer portal
components/
  ui/                     # shadcn/ui base components (button, dialog, table, etc.)
  layout/                 # DashboardShell, DashboardClientShell
  providers/              # AdminProvider, QueryProvider, ThemeProvider
  overview/               # KPI widgets, AccountsTable, SpendDonutChart
  charts/                 # Recharts visualizations
  closers/                # Closer management UI
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
  closerSession.ts        # Closer session (c_sess cookie)
  permissions.ts          # 7-key RBAC system
  cache.ts                # In-memory TTL cache (5-min default)
  admins.ts               # Admin CRUD
  users.ts                # User CRUD
  closers.ts              # Closer CRUD
  deals.ts                # Deal CRUD
  auditLog.ts             # Audit log writes/reads
  meta/
    client.ts             # Meta API client (rate limiting, error classes)
    endpoints.ts          # Meta API endpoint helpers
    schemas.ts            # Zod schemas for Meta API responses
  google/
    oauth.ts              # Google OAuth 2.0 flow
    calendar.ts           # Google Calendar integration
    tokenStorage.ts       # AES-256-GCM encrypted token storage
types/
  dashboard.ts            # Domain types (AccountSummary, CampaignRow, InsightMetrics)
  api.ts                  # API response types (ApiResponse<T>)
  alerts.ts               # Alert types
middleware.ts             # Edge: auth verification, route permission checks
instrumentation.ts        # DB migration trigger on startup
```

## Architecture

### Authentication

Three separate session types with HMAC-SHA256 signed tokens:
- `a_sess` — Admin dashboard (7-day expiry)
- `c_sess` — Closer portal (7-day expiry)
- `u_sess` — Client portal (7-day expiry)

Token format: base64url payload + hex HMAC-SHA256 signature. Constant-time comparison via `crypto.timingSafeEqual`. Passwords hashed with scrypt (N=16384, r=8, p=1, dkLen=64, 16-byte salt).

### Authorization (RBAC)

7 permission keys enforced at middleware + API route level:
| Key | Access |
|-----|--------|
| `dashboard` | Core metrics/overview |
| `analyst` | AI chat analysis |
| `studio` | Image generation |
| `adcopy` | Ad copy management |
| `users` | User management |
| `closers` | Closer/deal management |
| `admin` | Admin panel |

Super admins (`isSuper`) bypass all permission checks. Cannot set `isSuper` via API.

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
**Closer Portal** (`/closer/*`) — requires `c_sess`

### Database

Turso (libSQL) with raw parameterized SQL (no ORM). Tables:
- `users` — Client portal users (slug, email, status, mrr, category)
- `client_accounts` — Many-to-many user-to-Meta-account mapping
- `admins` — Dashboard admins with permission columns (`perm_*`)
- `closers` — Sales team (commission in basis points, quota in cents)
- `deals` — Sales pipeline (linked to closers and optionally to users)
- `audit_log` — Admin action log
- `google_calendar_config` — Encrypted OAuth tokens

Migrations are code-driven in `lib/db.ts`, run automatically via `instrumentation.ts` on startup. Idempotent and safe for concurrent calls.

### Caching

In-memory TTL cache (`lib/cache.ts`):
- Accounts, Insights, Campaigns, AdSets, Ads, Creatives, Pages: 5 min
- Alerts, Activities: 3 min
- Pixel Health: 10 min

HTTP: `Cache-Control: private, max-age=60, stale-while-revalidate=240`

### External Integrations

- **Meta Graph API** — Ad accounts, campaigns, insights, creatives, pixels. Zod-validated responses. Rate limit handling (code 80000) with exponential backoff. Concurrency limit configurable via `META_CONCURRENCY_LIMIT`.
- **Google Calendar** — OAuth 2.0 (read-only scope). Tokens encrypted with AES-256-GCM at rest. Auto-refresh with 5-min buffer.
- **Anthropic Claude** — Chat analytics with rate limiting (20 req/min per admin). Streaming responses.
- **Google Gemini** — Image generation capabilities.

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

- Database migrations run on every app startup — keep `migrate()` idempotent
- All SQL uses parameterized queries (no string concatenation) — SQL injection safe
- Passwords never exposed in API responses (stripped via destructuring)
- Google OAuth tokens encrypted at rest with AES-256-GCM derived from SESSION_SECRET
- Audit log is fire-and-forget (errors suppressed to not block operations)
- Multi-account support: users can have multiple Meta ad accounts via `client_accounts` junction table
- Commission rates stored in basis points, quotas in cents (integer math)
- Super admin seeded on first migration (`agencycollective`)
- `createPortal()` used for dropdowns to escape stacking context
