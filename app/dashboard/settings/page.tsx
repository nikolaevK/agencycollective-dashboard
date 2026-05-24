import {
  LayoutDashboard,
  Bell,
  Sparkles,
  ImageIcon,
  Braces,
  PenTool,
  FileText,
  Users,
  Handshake,
  UserCog,
  CalendarDays,
  Banknote,
  FileSignature,
  Network,
  BarChart3,
  Target,
  MessageSquare,
  ShieldCheck,
  KeyRound,
  Globe,
  RefreshCw,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";

/* ------------------------------------------------------------------ */
/* Layout primitives                                                   */
/* ------------------------------------------------------------------ */

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border bg-muted/40 px-5 py-4">
        <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="px-5 py-4 text-sm text-muted-foreground leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 pt-1">
      <p className="font-semibold text-foreground text-[13px]">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary mt-0.5">
        {n}
      </span>
      <span>{children}</span>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
      <span>{children}</span>
    </li>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
      {children}
    </code>
  );
}

function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn";
  children: React.ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400"
      : "border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-400";
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-xs ${cls}`}>
      {children}
    </div>
  );
}

function Tabs({ items }: { items: { name: string; what: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-background/50">
      <table className="w-full text-xs">
        <thead className="bg-muted/30">
          <tr>
            <th className="text-left font-semibold text-foreground px-3 py-2 w-1/3">
              Tab
            </th>
            <th className="text-left font-semibold text-foreground px-3 py-2">
              Purpose
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.name} className="border-t border-border">
              <td className="px-3 py-2 font-medium text-foreground align-top">
                {t.name}
              </td>
              <td className="px-3 py-2 align-top">{t.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AdminDocumentationPage() {
  return (
    <DashboardShell>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold">Admin Documentation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A page-by-page reference for everything in the admin dashboard.
            Use the section links in the left sidebar to navigate to any
            surface; this page documents what each one does.
          </p>
        </div>

        {/* ------------------------------------------------------ */}
        {/* Platform map                                            */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={LayoutDashboard}
          title="Platform map"
          subtitle="How the dashboard is organized"
        >
          <p>
            The dashboard is built around three surfaces, each with its own
            session cookie and permission scope:
          </p>
          <ul className="space-y-2 list-none pl-0">
            <Bullet>
              <span className="font-medium text-foreground">
                Admin dashboard
              </span>{" "}
              <Pill>/dashboard/*</Pill> — the surface you&apos;re on now.
              Sees every client, every ad account, every closer, and every
              deal. Gated by <Pill>a_sess</Pill> cookie.
            </Bullet>
            <Bullet>
              <span className="font-medium text-foreground">
                Client portal
              </span>{" "}
              <Pill>/[slug]/portal/*</Pill> — each client sees only their own
              Meta ad account metrics, no cross-tenant data. Gated by{" "}
              <Pill>u_sess</Pill>.
            </Bullet>
            <Bullet>
              <span className="font-medium text-foreground">
                Closer + setter portal
              </span>{" "}
              <Pill>/closer/*</Pill> — sales-team-facing surface for marking
              attendance, creating deals, claiming appointments, taking notes.
              Gated by <Pill>c_sess</Pill>. Setters and closers share the
              cookie; routes are gated by role inside the layout tree, not
              in middleware.
            </Bullet>
          </ul>
          <p>
            The admin sidebar shows only items your account has permission
            for. The super admin (<Pill>agencycollective</Pill>) sees
            everything, including the Admins management page.
          </p>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Overview                                                */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={LayoutDashboard}
          title="Overview"
          subtitle="/dashboard"
        >
          <p>
            The landing page after sign-in. Aggregates Meta Ads insights
            across every client account into one view.
          </p>
          <SubSection title="What you see">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">KPI grid</span> —
                spend, impressions, reach, clicks, CTR, CPC, CPM, ROAS,
                conversions, conversion value, cost-per-purchase, frequency.
                Each card shows the absolute number and a delta vs the
                previous comparable window.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Spend by Account chart
                </span>{" "}
                — donut showing how spend is distributed across your client
                accounts. Useful for spotting one client absorbing the
                majority of spend.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Alert feed (right column)
                </span>{" "}
                — the same alerts shown on the Alerts page, but filtered to
                the currently selected time window.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Accounts table
                </span>{" "}
                — every connected ad account, with its own KPIs and a click
                target into the per-account drill-down.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Date range picker">
            <p>
              The picker in the top-right applies to KPIs, charts, and the
              accounts table simultaneously. Presets: Last 7 days, Last 30
              days, This month, Last month. Custom range available too. The
              selected range is mirrored into client portals so clients see
              the same window when they log in.
            </p>
          </SubSection>
          <SubSection title="Setup banner">
            <p>
              If <Pill>META_ACCESS_TOKEN</Pill> is missing or expired you&apos;ll
              see a setup banner at the top with a link to the Settings page.
              The dashboard tolerates a missing token (you can still use the
              closer / users areas), but nothing under Overview will render
              until it&apos;s configured.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Account drill-downs                                     */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={BarChart3}
          title="Account drill-downs"
          subtitle="/dashboard/accounts/[accountId]"
        >
          <p>
            Click any row in the Accounts table on Overview to drill into a
            single Meta ad account. The drill-down has three nested levels.
          </p>
          <SubSection title="Account level">
            <p>
              KPIs scoped to one account, daily performance chart, and a list
              of campaigns. Click a campaign to descend.
            </p>
          </SubSection>
          <SubSection title="Campaign level">
            <p>
              <Pill>/dashboard/accounts/[accountId]/campaigns/[campaignId]</Pill> —
              campaign-scoped KPIs, the ad sets inside the campaign, and
              insight history.
            </p>
          </SubSection>
          <SubSection title="Ad set level">
            <p>
              <Pill>.../adsets/[adsetId]</Pill> — ad set-scoped KPIs, the ads
              inside the ad set, audience info, and creative thumbnails.
            </p>
          </SubSection>
          <Note>
            <span className="font-semibold">Caching:</span> Meta data is
            cached server-side for 5 minutes by default
            (<Pill>META_CACHE_TTL_SECONDS</Pill>). Use the refresh button to
            force a fresh fetch.
          </Note>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Alerts                                                  */}
        {/* ------------------------------------------------------ */}
        <Section icon={Bell} title="Alerts" subtitle="/dashboard/alerts">
          <p>
            Continuously scans every connected ad account for known failure
            modes and surfaces them on one page. The sidebar shows a badge
            with the current count, red if any alerts are critical.
          </p>
          <SubSection title="Severities">
            <ul className="space-y-1.5 list-none pl-0">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span>
                  <span className="font-medium text-foreground">Critical</span>{" "}
                  — needs immediate attention (zero spend on an active
                  campaign, billing failure, expired token, disabled pixel).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>
                  <span className="font-medium text-foreground">Warning</span>{" "}
                  — notable but not urgent (CPC unusually high, CTR low,
                  budget almost spent).
                </span>
              </li>
            </ul>
          </SubSection>
          <SubSection title="What to do">
            <p>
              Each alert links into the affected account, campaign, or ad
              set so you can investigate. Alerts are read-only — there&apos;s
              no &quot;dismiss&quot;; they disappear automatically when the
              underlying condition resolves (e.g., spend resumes, CTR
              recovers).
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* AI Analyst                                              */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Sparkles}
          title="AI Analyst"
          subtitle="/dashboard/chat · permission: analyst"
        >
          <p>
            Streaming Claude-powered chat that has live tool access to your
            ad data. Ask questions like &quot;Which client&apos;s CPC went up
            the most this week?&quot; or &quot;Compare ROAS across our top 3
            accounts for last month.&quot;
          </p>
          <SubSection title="What the analyst can do">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                Query insights, accounts, campaigns, ad sets, and ads through
                Meta&apos;s API on demand — no manual data uploads.
              </Bullet>
              <Bullet>
                Compare time windows, compute aggregates, surface outliers,
                and summarize what changed.
              </Bullet>
              <Bullet>
                Show its reasoning step by step (tool calls + their results
                are visible inline).
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Limits">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                20 requests per minute per admin (rate limited server-side
                to protect Meta API quota).
              </Bullet>
              <Bullet>
                The analyst sees the data you have permission to see — it
                won&apos;t cross-tenant a client&apos;s account.
              </Bullet>
              <Bullet>
                Conversations are not persisted across reloads (yet) — copy
                anything you want to keep.
              </Bullet>
            </ul>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Image Generator                                         */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={ImageIcon}
          title="Image Generator"
          subtitle="/dashboard/generate · permission: studio"
        >
          <p>
            Google Gemini-powered image generation for creative ideation.
            Type a description and the studio produces variations you can
            download.
          </p>
          <SubSection title="Workflow">
            <Step n={1}>
              Write a prompt describing the creative you want (style,
              subject, mood, aspect ratio).
            </Step>
            <Step n={2}>
              Click Generate. Multiple variations are rendered side by side.
            </Step>
            <Step n={3}>
              Download any variation as PNG, or iterate by editing your
              prompt and regenerating.
            </Step>
          </SubSection>
          <Note tone="warn">
            Generated images are not auto-saved to your Meta library — this
            is a brainstorming surface, not a publishing surface. Use the Ad
            Copy page to draft accompanying copy for the creative you settle on.
          </Note>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* JSON Editor                                             */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Braces}
          title="JSON Editor"
          subtitle="/dashboard/json-editor · permission: jsoneditor"
        >
          <p>
            A scratchpad for crafting and validating Meta Ads API payloads
            (custom audiences, complex targeting blocks, ad creative specs).
            Provides syntax highlighting, error checking, and Claude-assisted
            suggestions for valid Meta JSON shapes.
          </p>
          <p>
            Use it when you need to hand-craft a payload Meta&apos;s UI
            doesn&apos;t expose, or when validating a payload before sending
            it via the Meta SDK in another tool.
          </p>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Ad Copy                                                 */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={PenTool}
          title="Ad Copy"
          subtitle="/dashboard/ad-copy · permission: adcopy"
        >
          <p>
            Draft, organize, and iterate on ad copy for each client account.
            Pull existing creative copy from Meta as a starting point; save
            drafts locally as you refine.
          </p>
          <SubSection title="What you can do">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                Browse existing ad creatives by account and pull their copy
                into the editor.
              </Bullet>
              <Bullet>
                Generate copy variations using Claude (tone, length, hook
                style controls).
              </Bullet>
              <Bullet>
                Save drafts; they persist across sessions.
              </Bullet>
              <Bullet>
                Publish back to Meta — the &quot;publish draft&quot; endpoint
                pushes the edited copy to the live creative.
              </Bullet>
            </ul>
          </SubSection>
          <Note tone="warn">
            Publishing changes the creative on the live account. Coordinate
            with the client before pushing changes to ads currently spending.
          </Note>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Invoice                                                 */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={FileText}
          title="Invoice"
          subtitle="/dashboard/invoice · permission: invoice"
        >
          <p>
            Build, preview, and send client invoices. Pre-fills with agency
            sender details and supports both local (Zelle/Wire) and
            international (SWIFT) payment instructions.
          </p>
          <SubSection title="Components">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">
                  Service catalog
                </span>{" "}
                — admin-managed presets (Ad Management Retainer, Email
                Marketing, Premium Package, etc.) with default rates. Add to
                an invoice with one click.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Sender / receiver details
                </span>{" "}
                — agency info defaults from <Pill>agency_config</Pill> table;
                receiver fields are per-invoice.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Payment instructions
                </span>{" "}
                — auto-injected based on the chosen payment type (local vs
                international).
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">PDF + send</span>{" "}
                — renders a PDF and emails it via the linked deal&apos;s
                contact email. Status (draft / sent / paid) tracks on the row.
              </Bullet>
            </ul>
          </SubSection>
          <p>
            Deals created in the Closers section auto-generate an invoice
            when the deal is marked <Pill>closed</Pill>. The invoice appears
            in this surface where you can review and send it.
          </p>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Clients (Users) — tabs                                  */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Users}
          title="Client Directory"
          subtitle="/dashboard/users · permission: users"
        >
          <p>
            Full-screen directory of client portal accounts, cross-referenced
            with the Payout DB. The page has three tabs:
          </p>
          <Tabs
            items={[
              {
                name: "Directory",
                what:
                  "Full-width table of every client with payout-derived Monthly MRR, total revenue, date joined, last re-bill, and next re-bill status. Summary cards, a re-bill alerts banner, and filters sit above it. Click a row to open the per-client page.",
              },
              {
                name: "Support",
                what:
                  "Live admin↔client chat across all client conversations. Unread count surfaces as a red badge on the tab. Replies appear in the client portal instantly via polling.",
              },
              {
                name: "Welcome Kit",
                what:
                  "A builder for the global client onboarding kit — add, edit, reorder, and delete sections and content blocks, with a live preview. Publish a no-login public link anyone can open. Edits update what every client sees in their portal.",
              },
            ]}
          />
          <Note>
            The redesign is additive and does{" "}
            <span className="font-medium">not</span> change how clients log in or
            how Meta ad accounts are linked — only a new client↔Payout-DB brand
            link was added.
          </Note>
          <SubSection title="Adding a client">
            <p>
              <span className="font-medium text-foreground">Add Client</span>{" "}
              opens a modal with two paths:
            </p>
            <ul className="space-y-2 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">From Payout DB</span>{" "}
                — pick a brand that exists in the Payout tracker but isn&apos;t in
                the directory yet. Defaults to brands joined in the past week;
                widen the date window to pull older ones. Date joined and MRR are
                seeded from the matching payout record and the client is linked to
                that brand.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Manual entry</span>{" "}
                — name, email, category, logo. The slug (portal URL) is
                auto-derived, e.g. <Pill>/inner-glow/portal/overview</Pill>.
                Email can be added later; the client can&apos;t log in until it
                is.
              </Bullet>
            </ul>
            <Note>
              Adding from the pool never duplicates an existing client — a brand
              already represented (by link or name) is rejected.
            </Note>
          </SubSection>
          <SubSection title="Payout cross-reference">
            <p>
              Each client maps to a brand in the Payout DB via an explicit{" "}
              <Pill>payout_brand</Pill> link (set when added from the pool, or
              editable in the client&apos;s Settings tab). That link drives the
              directory&apos;s{" "}
              <span className="font-medium text-foreground">Monthly MRR</span>{" "}
              (latest payout month), total revenue, payment history, and the
              invoices/scopes shown on the Documents tab. Unlinked clients fall
              back to fuzzy brand-name matching until linked.
            </p>
          </SubSection>
          <SubSection title="Re-bill schedule & alerts">
            <p>
              Every client has a monthly re-bill schedule anchored on their join
              date. The model is{" "}
              <span className="font-medium text-foreground">hybrid</span>: the
              last re-bill is derived from the Payout DB (a payout row for a month
              = that month&apos;s re-bill) and can be overridden manually.
              Per-client exceptions live on the Billing tab —{" "}
              <span className="font-medium text-foreground">pause</span> (skip
              re-billing) and{" "}
              <span className="font-medium text-foreground">extend</span> (defer
              the next bill to a date), plus billing day and alert lead time.
            </p>
            <p>
              Clients that are due or overdue surface in a live{" "}
              <span className="font-medium text-foreground">Re-bill alerts</span>{" "}
              banner at the top of the directory (with a count badge), alongside
              any due client reminders. It&apos;s recomputed on each load — no
              background job.
            </p>
          </SubSection>
          <SubSection title="Filters">
            <p>
              Filter the directory by search, status, category, re-bill status,
              MRR range, date-joined range, and last-re-bill range. The{" "}
              <span className="font-medium text-foreground">Re-bills Due</span>{" "}
              summary card opens the alerts banner.
            </p>
          </SubSection>
          <SubSection title="Welcome Kit builder">
            <p>
              The <span className="font-medium text-foreground">Welcome Kit</span>{" "}
              tab edits the single, global client onboarding kit — the same kit
              every client sees at <Pill>/[client]/portal/welcome-kit</Pill>.
              Build it from content blocks and watch the live preview update as
              you type.
            </p>
            <ul className="space-y-2 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">Sections &amp; blocks</span>{" "}
                — add, reorder (↑/↓), and delete sections. Inside each section,
                add content blocks: text, callout, stat, checklist, cards,
                columns, and label/tag rows. Each block has its own simple form
                and an icon picker.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Save</span> — the
                Save button is enabled only when there are unsaved changes;
                Discard reverts to the last save. Saving updates every
                client&apos;s portal kit immediately.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Downloadable PDF</span>{" "}
                — in the closing call-to-action, upload a PDF (up to 10 MB) that
                appears as a &ldquo;Download PDF&rdquo; button and a sidebar link
                wherever the kit shows. Replace or remove it anytime; an uploaded
                file takes precedence over a typed PDF URL. Uploading/removing is
                immediate (no Save needed).
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Public link</span>{" "}
                — toggle <span className="font-medium text-foreground">Publish</span>{" "}
                to expose a no-login page at <Pill>/welcome-kit</Pill> that anyone
                with the link can open. Copy or open the link from the same card.
                Toggle it off to take the public page down.
              </Bullet>
            </ul>
            <Note>
              There is one kit for all clients (not per-client). Until you edit
              it, the portal shows the original built-in kit, so nothing changes
              for clients until you save.
            </Note>
          </SubSection>
          <SubSection title="Per-client page">
            <p>
              Clicking a row opens <Pill>/dashboard/users/[userId]</Pill> with
              tabs:
            </p>
            <Tabs
              items={[
                {
                  name: "Overview",
                  what:
                    "Profile, onboarding progress, and linked Meta accounts with per-account KPI cards (plus a combined-performance chart when 2+ accounts).",
                },
                {
                  name: "Billing",
                  what:
                    "Re-bill schedule + config (pause, extend, billing day, manual last-rebill, lead days), the client's payout payment history, and a Send re-bill invoice action.",
                },
                {
                  name: "Documents",
                  what:
                    "Invoices and project scopes pulled from the Payout DB for this client's brand, with download.",
                },
                {
                  name: "Notes & Reminders",
                  what:
                    "Internal admin notes; a note with a remind-on date becomes a reminder that surfaces in the directory's alerts when due.",
                },
                {
                  name: "Settings",
                  what:
                    "Edit profile / status / category, toggle AI Analyst, manage Meta accounts, and edit the Payout-DB brand link + join date.",
                },
              ]}
            />
          </SubSection>
          <SubSection title="Re-bill invoicing">
            <p>
              The <span className="font-medium text-foreground">Billing</span> tab
              has a{" "}
              <span className="font-medium text-foreground">
                Send re-bill invoice
              </span>{" "}
              button. It opens an invoice composer prefilled with the
              client&apos;s details and a line item from their monthly amount
              (agency sender, payment terms, and a unique invoice number come from
              your settings). Adjust line items, descriptions, CC, dates, and
              local/international payment terms, then preview, download, or send.
            </p>
            <p>
              Sending emails the client a{" "}
              <span className="font-medium text-foreground">re-bill</span> message
              (distinct from the new-client onboarding email) and files the PDF
              under the client&apos;s brand &mdash; so it appears in both this
              client&apos;s{" "}
              <span className="font-medium text-foreground">Documents</span> tab
              and the Payout page&apos;s brand documents.
            </p>
            <Note>
              Sending an invoice does <span className="font-medium">not</span>{" "}
              record a payment or advance the next re-bill date &mdash; the
              re-bill schedule is still driven by the Payout page. (Email requires
              SMTP to be configured.)
            </Note>
          </SubSection>
          <SubSection title="Multi-account support">
            <p>
              A client can own more than one Meta ad account. Manage links from
              the <span className="font-medium text-foreground">Settings</span>{" "}
              tab of the per-client page; the client&apos;s portal aggregates
              data across all their accounts with an account selector.{" "}
              <span className="font-medium text-foreground">
                Portal login and account linking are unchanged by the directory
                redesign.
              </span>
            </p>
          </SubSection>
          <SubSection title="Support inbox">
            <p>
              The Support tab aggregates every client&apos;s conversation
              into one inbox. The conversation list shows the latest message
              preview, unread count, and timestamp. Open any conversation to
              reply inline. Feedback (sentiment + rating + free-form body)
              from clients appears alongside their messages so you can act
              on it without leaving the page.
            </p>
            <p>
              Admin presence is heartbeated every 30 seconds while you have
              the tab focused — clients see &quot;Team is online&quot; in
              their portal when any admin is active.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Closers — sub-nav                                       */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Handshake}
          title="Closers"
          subtitle="/dashboard/closers · permission: closers"
        >
          <p>
            The sales-pipeline command center. Manages the closer + setter
            team, deals, calendar, payouts, contracts, and the GHL contact
            catalog. Sub-nav tabs at the top switch between surfaces:
          </p>
          <Tabs
            items={[
              {
                name: "Overview",
                what:
                  "Team-wide KPIs over a chosen time window (week / month / quarter / custom). Leaderboard ranks closers by closed revenue. Team output chart shows daily deal counts.",
              },
              {
                name: "Manage",
                what:
                  "CRUD for closers and setters. Add a new team member, set role (closer / setter / senior_closer / account_executive / inbound_specialist), commission rate (basis points), and quota (cents). Each row has a quick-link into the closer's individual dashboard.",
              },
              {
                name: "Deals",
                what:
                  "Team-wide deal queue across every closer. Filter by status (closed, follow_up, rescheduled, pending_signature, not_closed), service category, or date. Admin can override fields on any deal (closer, setter, tier, paid_status, status).",
              },
              {
                name: "Calendar",
                what:
                  "Team-wide Google Calendar view with attendance state and GHL sync chips. Admin can Push/Pull individual events to reconcile dashboard ↔ GHL for any closer.",
              },
              {
                name: "Payouts",
                what:
                  "Monthly payout tracker. Per-brand rows with sales rep, amount due/paid, signed status, contract scope and invoice docs attached. Filters by month/year/vertical/sales rep.",
              },
              {
                name: "Contracts",
                what:
                  "DocuSeal template manager. Create, edit, and assign default templates per service category. Track signing status across deals.",
              },
              {
                name: "GHL Contacts",
                what:
                  "Read-only browser for the connected GoHighLevel sub-account. Search, filter by tag / source / DND / opportunities count, view individual contact pages with messages, opportunities, appointments, and notes.",
              },
            ]}
          />
          <SubSection title="Closer detail (/dashboard/closers/[closerId])">
            <p>
              Click any closer in the Manage tab to open their detail page.
              Shows their:
            </p>
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">
                  Personal info
                </span>{" "}
                — display name, email, role, commission rate, quota,
                status, avatar.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Stats (current window)
                </span>{" "}
                — appointments set / closed, show rate, revenue attributed,
                commission earned, pending deals.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Deals list
                </span>{" "}
                — every deal they&apos;ve closed or are working with
                statuses + linked invoice / contract states.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Appointments
                </span>{" "}
                — for setters: their claimed Google Calendar events with
                pre/post-call statuses, notes, and tier picks.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Activity log
                </span>{" "}
                — admin actions taken on this closer&apos;s record (role
                changes, commission updates, status toggles).
              </Bullet>
            </ul>
            <p>
              The <Pill>/dashboard/closers/[closerId]/dashboard</Pill>{" "}
              sub-route renders the closer&apos;s OWN portal view as it
              appears to them — handy for support / debugging without
              shadowing their session.
            </p>
          </SubSection>
          <SubSection title="Setter tier system (1099 contract)">
            <p>
              Setters declare a tier on each appointment to claim
              commission per the contract:
            </p>
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">
                  Tier A — Setter-Sourced
                </span>{" "}
                — 3 % of collected gross revenue
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Tier B — Setter-Recovered
                </span>{" "}
                — 2 % of collected gross revenue
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Tier C — Setter-Confirmed (Self-Booked)
                </span>{" "}
                — $25 flat per attended call ≥ 2 minutes
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Tier D — System-Nurtured
                </span>{" "}
                — no commission
              </Bullet>
            </ul>
            <p>
              On the Deals tab, admin can override a deal&apos;s tier and
              toggle <Pill>no_retainer</Pill> to cap tier-A/B payouts at
              $500 per the no-retainer-deal clause. Setter dashboards
              recompute commission immediately when these flip.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Closers — Calendar deep-dive                            */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={CalendarDays}
          title="Team Calendar"
          subtitle="/dashboard/closers/calendar"
        >
          <p>
            Team-wide Google Calendar view scoped to the connected calendars.
            Same component as the closer portal calendar, in admin
            (read-only attendance) mode.
          </p>
          <SubSection title="What each event card shows">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                Title, time, calendar owner, attendees, Google Meet link.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Pills</span> —
                Deal Linked (green) if a deal references this event;
                Setter: NAME (sky) if a setter has claimed this event;
                Tentative / Cancelled if the Google event has that status.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Attendance badge
                </span>{" "}
                — read-only Showed / No Show indicator showing the team-wide
                latest mark across all closers who interacted with this
                event.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Setter claim panel
                </span>{" "}
                — when a setter has claimed: pre-call status (Confirmed,
                Voicemail, Rescheduled, etc.), post-call status, client name
                / email, free-form setter notes.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">GHL sync chip</span>{" "}
                — Synced / Out of sync / Syncing. On out-of-sync, exposes{" "}
                <span className="font-medium text-foreground">
                  [Push to GHL]
                </span>{" "}
                and{" "}
                <span className="font-medium text-foreground">
                  [Pull from GHL]
                </span>{" "}
                buttons. See the GHL Sync section below.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Filtering and navigation">
            <p>
              Week navigator at the top (← / →) jumps weeks. The calendar
              owner filter chip row lets you focus on events from a single
              Google calendar when multiple are connected. &quot;Back to
              this week&quot; resets the view.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* GHL sync                                                 */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={RefreshCw}
          title="GoHighLevel appointment status sync"
          subtitle="Bidirectional · /closer/calendar + /dashboard/closers/calendar"
        >
          <p>
            Show/no-show marks in the dashboard and GHL&apos;s{" "}
            <Pill>appointmentStatus</Pill> stay in step automatically. No
            webhooks or GHL automations are required — outbound is real-time,
            inbound is on-demand via the chip.
          </p>
          <SubSection title="How matching works">
            <p>
              GHL doesn&apos;t expose the synced Google event id, so a
              Google event is matched to a GHL appointment via a composite
              key: <Pill>(title | startMs | endMs)</Pill>. The first match
              is persisted in a link table and reused for every subsequent
              sync — direct id lookups after that, no re-matching.
            </p>
          </SubSection>
          <SubSection title="Mark mapping">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                Dashboard <span className="font-medium text-foreground">Showed</span>{" "}
                → GHL <Pill>showed</Pill>
              </Bullet>
              <Bullet>
                Dashboard <span className="font-medium text-foreground">No Show</span>{" "}
                → GHL <Pill>noshow</Pill>
              </Bullet>
              <Bullet>
                Dashboard <span className="font-medium text-foreground">Unselected</span>{" "}
                (cleared) → GHL <Pill>confirmed</Pill>
              </Bullet>
              <Bullet>
                GHL <Pill>cancelled / invalid / new</Pill> on Pull → all
                dashboard rows for the event are wiped.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="The sync chip">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  Synced
                </span>{" "}
                — dashboard and GHL agree.
              </Bullet>
              <Bullet>
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  Out of sync
                </span>{" "}
                — they disagree. The chip shows both observed values and
                exposes the two recovery buttons.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Syncing…</span>{" "}
                — spinner while a click is in flight.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Push / Pull (manual recovery)">
            <p>
              <span className="font-medium text-foreground">Push to GHL</span>{" "}
              — sends the team-wide latest dashboard mark to GHL, then
              verifies. The PUT request carries{" "}
              <Pill>appointmentStatus</Pill> + canonical identity fields
              (calendarId, startTime, endTime, title, assignedUserId)
              against GHL API version <Pill>2023-02-21</Pill>.
            </p>
            <p>
              <span className="font-medium text-foreground">Pull from GHL</span>{" "}
              — reads GHL&apos;s current status and overwrites the
              dashboard side, attributing the row to whichever closer GHL
              has as the assigned user (matched by display name). Pull
              wipes existing event_attendance rows for the event before
              inserting the new one so a teammate&apos;s stale opposite
              mark can&apos;t outweigh the pulled value.
            </p>
          </SubSection>
          <SubSection title="Closer attribution on Pull">
            <p>
              The pulled row is attributed by matching GHL&apos;s assigned
              user (<Pill>assignedUserId</Pill> → user name via the GHL
              users endpoint) to the dashboard <Pill>closers.display_name</Pill>{" "}
              column. Names must match (lowercase, whitespace-collapsed). If
              no match, the Pull returns{" "}
              <Pill>outcome: needs_attribution</Pill> and the chip stays
              out of sync — the names need to be aligned (or a{" "}
              <Pill>ghl_user_id</Pill> column added).
            </p>
          </SubSection>
          <SubSection title="When sync stays silent">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                Event has no GHL counterpart (composite-key mismatch) — no
                chip rendered. Behaves like the pre-sync dashboard.
              </Bullet>
              <Bullet>
                No GHL sub-account configured (<Pill>GHL_PIT</Pill> +{" "}
                <Pill>GHL_LOCATION_ID</Pill> for Peptide Ads and/or{" "}
                <Pill>GHL_PIT_AGENCY</Pill> +{" "}
                <Pill>GHL_LOCATION_ID_AGENCY</Pill> for Agency Collective) —
                chip never appears anywhere.
              </Bullet>
              <Bullet>
                GHL automation immediately overwrites your push — chip flips
                to Out of sync on next refetch. Click Push again or
                investigate the GHL workflow.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Auto-discovery on load">
            <p>
              When the calendar page mounts, it POSTs every visible
              event&apos;s <Pill>{`{id, title, start, end}`}</Pill> to the
              attendance endpoint, which composite-matches against the
              cached GHL bulk listing and creates link rows in parallel for
              any matches. Result: the chip appears on first page load,
              not after first click.
            </p>
          </SubSection>
          <SubSection title="Auto-poll cadence">
            <p>
              The calendar refetches every 120 seconds while open so GHL-side
              changes surface without a manual refresh. The GHL bulk listing
              is cached 5 minutes server-side and busted automatically after
              any successful Push.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Closers — Deals deep-dive                               */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Target}
          title="Deal queue"
          subtitle="/dashboard/closers/deals"
        >
          <p>
            Cross-team deal queue with full admin override on every field.
          </p>
          <SubSection title="Filters">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                Status — closed, follow_up, rescheduled, pending_signature,
                not_closed
              </Bullet>
              <Bullet>Date range / month</Bullet>
              <Bullet>Closer, setter, service category, brand</Bullet>
              <Bullet>Paid / unpaid</Bullet>
            </ul>
          </SubSection>
          <SubSection title="Per-row actions">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">Edit</span> —
                inline override of any field (closer, setter, tier,
                no_retainer, paid_status, status, deal_value, notes).
                Changes are audit-logged.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Invoice</span>{" "}
                — link to the generated invoice, view PDF, mark paid.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Contract</span>{" "}
                — link to the DocuSeal submission, view signing URL, view
                completed document.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Calendar link
                </span>{" "}
                — if <Pill>google_event_id</Pill> is set, opens the deal in
                the calendar view.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Auto-show on close">
            <p>
              Changing a deal&apos;s status to <Pill>closed</Pill> with a
              calendar link attached auto-marks <Pill>event_attendance</Pill>{" "}
              as <Pill>showed</Pill> for the deal&apos;s closer and pushes
              the same to GHL (if the event is linked). Saves a manual
              calendar click.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Closers — Payouts deep-dive                             */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Banknote}
          title="Payouts"
          subtitle="/dashboard/closers/payouts"
        >
          <p>
            Monthly payout tracker. One row per brand per month with payment
            state, signed contract state, and document attachments.
          </p>
          <SubSection title="Per-row data">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>Payout month / year</Bullet>
              <Bullet>Brand, vertical, point of contact, service</Bullet>
              <Bullet>
                Sales rep, commission split (cents), referral + referral %
              </Bullet>
              <Bullet>
                Amount due / amount paid, payment notes, pay-distributed
                flag with timestamp
              </Bullet>
              <Bullet>
                Signed contract, paid, added to Slack — boolean toggles
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Document attachments">
            <p>
              Each brand can have a project scope and an invoice attached
              (stored as BLOBs in the <Pill>payout_documents</Pill> table —
              max ~2 MB per file, PDF / image / standard doc formats).
              Upload from the row; download anytime; replace by uploading
              over the existing file.
            </p>
          </SubSection>
          <SubSection title="Sales rep / vertical / referral options">
            <p>
              Tag values (sales rep names, verticals, referral sources) are
              admin-managed lists. Adding a new option once makes it
              available across every row going forward.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Closers — Contracts deep-dive                           */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={FileSignature}
          title="Contracts"
          subtitle="/dashboard/closers/contracts"
        >
          <p>
            DocuSeal template manager. Pre-configured templates are uploaded
            into DocuSeal; this page lets you map templates to service
            categories so the right contract is sent automatically when a
            deal is created.
          </p>
          <SubSection title="Template fields">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">Name</span> —
                friendly label
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  DocuSeal template id
                </span>{" "}
                — numeric id from DocuSeal&apos;s template library
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Service keys
                </span>{" "}
                — JSON array of deal service categories this template covers
                (e.g. <Pill>[&quot;Meta Ads&quot;]</Pill>)
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Default</span>{" "}
                — fallback template when no service-key match
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Per-deal overrides">
            <p>
              Editing a contract&apos;s template from a deal clones the
              parent template into a deal-specific override (<Pill>
                docuseal_template_override_id
              </Pill>
              ). Subsequent changes to the parent don&apos;t affect already-sent
              contracts.
            </p>
          </SubSection>
          <SubSection title="DocuSeal webhook">
            <p>
              When a client signs, DocuSeal POSTs a webhook to{" "}
              <Pill>/api/webhooks/docuseal</Pill> which updates the
              corresponding deal_contract row to <Pill>signed</Pill> with
              the signed_at timestamp and document URLs.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Closers — GHL Contacts deep-dive                        */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Network}
          title="GHL Contacts"
          subtitle="/dashboard/closers/ghl-contacts"
        >
          <p>
            Read-only browser for connected GoHighLevel sub-accounts. Two
            tabs at the top: <strong>Agency Collective</strong> (configured
            via <Pill>GHL_PIT_AGENCY</Pill> + <Pill>GHL_LOCATION_ID_AGENCY</Pill>,
            default tab) and <strong>Peptide Ads</strong> (
            <Pill>GHL_PIT</Pill> + <Pill>GHL_LOCATION_ID</Pill>). Each tab
            scopes search, contact list, notes, appointments, conversations
            and tag/pipeline catalogs to its own location. Refreshes
            server-side with a 5-minute cache, per sub-account.
          </p>
          <SubSection title="What you can do">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">Search</span>{" "}
                — by name, email, or phone. Hits GHL&apos;s contact-search
                endpoint server-side (100 per page).
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Sort</span> —
                Recently added, alphabetical, last appointment, etc.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Filter chips
                </span>{" "}
                — by tag, source, DND flag, opportunities count, appointment
                status set.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Open a contact
                </span>{" "}
                — drill into their messages thread, opportunities pipeline,
                appointments history (every event tied to their email /
                phone), and notes.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Composite-key cross-reference">
            <p>
              The dashboard&apos;s Google calendar pages cross-reference
              each Google event to a GHL contact via the same composite
              key used by the appointment-status sync. The cross-reference
              chip on each event card (<Pill>GhlEventChip</Pill>) links to
              the contact&apos;s GHL Contacts row when there&apos;s a match.
            </p>
          </SubSection>
          <SubSection title="Rate limits">
            <p>
              Outbound GHL calls go through a token-bucket limiter (50 r/s
              sustained, 20-burst) with transparent 429 retry honoring{" "}
              <Pill>Retry-After</Pill>. Bulk endpoints (contacts list,
              appointments) are server-cached 5 minutes; per-contact notes
              are cached 60 seconds so new notes appear quickly.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Admins                                                  */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={UserCog}
          title="Admins"
          subtitle="/dashboard/admins · permission: admin"
        >
          <p>
            Super-admin-only surface for managing the admin team. The
            seeded super admin (<Pill>agencycollective</Pill>) cannot be
            deleted and is the only account that can promote others to
            super.
          </p>
          <SubSection title="Permission keys (9)">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <Pill>dashboard</Pill> — Overview + per-account drill-downs
              </Bullet>
              <Bullet>
                <Pill>analyst</Pill> — AI Analyst chat
              </Bullet>
              <Bullet>
                <Pill>studio</Pill> — Image Generator
              </Bullet>
              <Bullet>
                <Pill>jsoneditor</Pill> — JSON Editor
              </Bullet>
              <Bullet>
                <Pill>adcopy</Pill> — Ad Copy
              </Bullet>
              <Bullet>
                <Pill>invoice</Pill> — Invoice
              </Bullet>
              <Bullet>
                <Pill>users</Pill> — Clients + Support
              </Bullet>
              <Bullet>
                <Pill>closers</Pill> — Closers section (all sub-tabs)
              </Bullet>
              <Bullet>
                <Pill>admin</Pill> — Admins page (this one)
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Creating a new admin">
            <Step n={1}>
              Sign in as <Pill>agencycollective</Pill>.
            </Step>
            <Step n={2}>
              Enter the new admin&apos;s username (lowercase, no spaces).
            </Step>
            <Step n={3}>
              Toggle each permission on/off as needed. Super status (full
              bypass) can only be granted by the seed super admin.
            </Step>
            <Step n={4}>
              Share the username and direct them to{" "}
              <Pill>/admin/login</Pill> to set their password on first
              visit.
            </Step>
          </SubSection>
          <SubSection title="Audit log">
            <p>
              Every admin action (deal edits, user creates / deletes,
              permission grants, closer changes) writes to{" "}
              <Pill>audit_log</Pill>. Available on each closer / user
              detail page, scoped to that target. Audit writes are
              fire-and-forget so they never block an operation.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Auth                                                    */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={KeyRound}
          title="Sessions, login, security"
          subtitle="How authentication works across the platform"
        >
          <SubSection title="Three session types">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <Pill>a_sess</Pill> — Admin dashboard (7-day expiry).
              </Bullet>
              <Bullet>
                <Pill>c_sess</Pill> — Closer + setter portal (7-day expiry,
                role embedded in token).
              </Bullet>
              <Bullet>
                <Pill>u_sess</Pill> — Client portal (7-day expiry).
              </Bullet>
            </ul>
            <p>
              All three are HMAC-SHA256 signed, HTTP-only cookies. Sessions
              do not interfere — logging in as admin doesn&apos;t grant
              client / closer access and vice versa.
            </p>
          </SubSection>
          <SubSection title="Password handling">
            <p>
              Passwords are hashed with scrypt (N=16384, r=8, p=1, dkLen=64)
              and never stored or returned in plain text. To reset: delete
              the user / admin / closer and re-create; on next login the
              password setup flow fires again. Display names and slugs are
              preserved if you re-create with the same identity.
            </p>
          </SubSection>
          <SubSection title="Login URLs">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                Admin: <Pill>/admin/login</Pill>
              </Bullet>
              <Bullet>
                Closer / setter: <Pill>/closer/login</Pill>
              </Bullet>
              <Bullet>
                Client: <Pill>/login</Pill>
              </Bullet>
            </ul>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Client portal preview                                   */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Globe}
          title="Client portal (what your clients see)"
          subtitle="/[slug]/portal/*"
        >
          <p>
            Every client gets a portal at{" "}
            <Pill>/[slug]/portal/overview</Pill>. They see only their own
            ad accounts, never any other client&apos;s. Surfaces include:
          </p>
          <ul className="space-y-1.5 list-none pl-0">
            <Bullet>
              <span className="font-medium text-foreground">Overview</span>{" "}
              — KPI cards, daily performance chart, top 3 ads by spend with
              creative thumbnails.
            </Bullet>
            <Bullet>
              <span className="font-medium text-foreground">
                Account selector
              </span>{" "}
              — switch between Meta accounts if they own multiple.
            </Bullet>
            <Bullet>
              <span className="font-medium text-foreground">AI Analyst</span>{" "}
              — Claude-powered chat scoped to their data. Toggleable per-user
              via the Clients page.
            </Bullet>
            <Bullet>
              <span className="font-medium text-foreground">Support chat</span>{" "}
              — direct line to admins. Their messages appear in the Clients
              → Support tab.
            </Bullet>
            <Bullet>
              <span className="font-medium text-foreground">Feedback</span>{" "}
              — sentiment + rating + free-form. Admins review on the user
              detail page.
            </Bullet>
            <Bullet>
              <span className="font-medium text-foreground">Onboarding</span>{" "}
              — checklist that fades out as the client completes steps.
            </Bullet>
          </ul>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Caching and refresh                                     */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={RefreshCw}
          title="Caching and freshness"
          subtitle="How fresh the numbers are at any given moment"
        >
          <SubSection title="Server-side TTLs">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">
                  Meta data
                </span>{" "}
                — Accounts, Insights, Campaigns, Ad Sets, Ads, Creatives,
                Pages: 5 min default (configurable via{" "}
                <Pill>META_CACHE_TTL_SECONDS</Pill>).
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Alerts</span>{" "}
                + activity: 3 min.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Pixel health
                </span>{" "}
                — 10 min.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Google Calendar events
                </span>{" "}
                — 2 min. Scope-keyed by NODE_ENV so dev + prod tokens don&apos;t
                fight.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  GHL bulk listings
                </span>{" "}
                — 5 min. Busted automatically after any successful Push to
                GHL.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  GHL users / per-contact notes
                </span>{" "}
                — 10 min / 60 sec respectively.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Client-side polling">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                Setter + closer dashboards: 120 sec refetch interval
                (matches Google cache TTL so polling lands on cached data).
              </Bullet>
              <Bullet>
                Calendar attendance + GHL sync: 120 sec.
              </Bullet>
              <Bullet>
                Admin Support unread badge: 90 sec.
              </Bullet>
              <Bullet>
                Notes + lead-context: 30–60 sec.
              </Bullet>
            </ul>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Environment                                             */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={ShieldCheck}
          title="Environment variables"
          subtitle="What the platform expects to find in .env.local"
        >
          <SubSection title="Required">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <Pill>SESSION_SECRET</Pill> — HMAC signing key, min 32 chars
              </Bullet>
              <Bullet>
                <Pill>TURSO_DATABASE_URL</Pill> + <Pill>TURSO_AUTH_TOKEN</Pill>{" "}
                — libSQL database
              </Bullet>
              <Bullet>
                <Pill>META_ACCESS_TOKEN</Pill> — Meta Graph API token
              </Bullet>
              <Bullet>
                <Pill>ANTHROPIC_API_KEY</Pill> — Claude API
              </Bullet>
              <Bullet>
                <Pill>GEMINI_API_KEY</Pill> — Google Gemini (image gen)
              </Bullet>
              <Bullet>
                <Pill>GOOGLE_CLIENT_ID</Pill> + <Pill>GOOGLE_CLIENT_SECRET</Pill>{" "}
                + <Pill>GOOGLE_REDIRECT_URI</Pill> — Google OAuth (Calendar)
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Optional">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <Pill>GHL_PIT</Pill> + <Pill>GHL_LOCATION_ID</Pill> —
                Peptide Ads GHL sub-account. Enables the GHL contact browser
                tab + appointment status sync for events scheduled through
                Peptide Ads. Degrades silently when unset.
              </Bullet>
              <Bullet>
                <Pill>GHL_PIT_AGENCY</Pill> +{" "}
                <Pill>GHL_LOCATION_ID_AGENCY</Pill> — Agency Collective GHL
                sub-account. Enables the same surfaces for events scheduled
                through Agency Collective. Either sub-account can be
                configured independently of the other.
              </Bullet>
              <Bullet>
                <Pill>META_API_VERSION</Pill> (default <Pill>v25.0</Pill>),{" "}
                <Pill>META_CONCURRENCY_LIMIT</Pill> (default <Pill>5</Pill>),{" "}
                <Pill>META_CACHE_TTL_SECONDS</Pill> (default{" "}
                <Pill>300</Pill>)
              </Bullet>
            </ul>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Need help                                               */}
        {/* ------------------------------------------------------ */}
        <Section icon={MessageSquare} title="Need help?">
          <p>
            Something not working as documented? Open the support chat from
            the Clients tab and tag a super admin. For an end-user reference
            (closer / setter portal), see the documentation page inside the{" "}
            <Pill>/closer/*</Pill> portal — accessible from the closer
            sidebar.
          </p>
        </Section>
      </div>
    </DashboardShell>
  );
}
