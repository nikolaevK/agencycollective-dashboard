import {
  LayoutDashboard,
  Users,
  UserCog,
  Bell,
  Globe,
  KeyRound,
  ShieldCheck,
  CalendarDays,
  ImageIcon,
  LogIn,
} from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-5 py-4">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-4 text-sm text-muted-foreground leading-relaxed space-y-3">
        {children}
      </div>
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

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
      {children}
    </code>
  );
}

export default function DocumentationPage() {
  return (
    <DashboardShell>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Platform Documentation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything you need to know about operating the Agency Collective dashboard.
          </p>
        </div>

        {/* Platform Overview */}
        <Section icon={LayoutDashboard} title="Platform Overview">
          <p>
            The Agency Collective dashboard is an internal admin tool that connects to the
            Meta (Facebook) Ads API and surfaces campaign performance data for your clients.
            Each client gets a private, password-protected portal at their own URL where they
            can view their own account metrics — without seeing any other client&apos;s data.
          </p>
          <p>
            The platform has two distinct areas:
          </p>
          <ul className="space-y-1.5 list-none pl-0">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span>
                <span className="font-medium text-foreground">Admin dashboard</span>{" "}
                (<Pill>/dashboard</Pill>) — visible only to authenticated admins. Manage
                all client accounts, view cross-account analytics, and configure the platform.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span>
                <span className="font-medium text-foreground">Client portal</span>{" "}
                (<Pill>/[slug]/portal/overview</Pill>) — each client sees only their own
                spend, impressions, CTR, top ads, and performance chart.
              </span>
            </li>
          </ul>
        </Section>

        {/* Overview & Analytics */}
        <Section icon={CalendarDays} title="Overview & Date Range Filtering">
          <p>
            The <span className="font-medium text-foreground">Overview</span> page aggregates
            spend, impressions, reach, clicks, CTR, CPC, ROAS, and conversions across all
            connected Meta ad accounts.
          </p>
          <p>
            Use the <span className="font-medium text-foreground">date range picker</span> in
            the top-right of any page to filter data by a preset (Last 7 days, Last 30 days,
            This month, Last month) or a custom range. The selected range applies to all charts,
            KPI cards, and top-ads lists simultaneously. Client portals have the same date
            picker so clients can explore their own data.
          </p>
          <p>
            The <span className="font-medium text-foreground">Performance Over Time</span> chart
            shows daily spend (bars) and CTR (line) for the selected period. Hover over any
            data point for exact figures.
          </p>
        </Section>

        {/* Managing Users */}
        <Section icon={Users} title="Managing Client Users">
          <p>
            Go to <Pill>/dashboard/users</Pill> to create and manage client portal accounts.
            Each user record links a login identity to a specific Meta ad account.
          </p>
          <div className="space-y-2">
            <p className="font-medium text-foreground">Creating a user:</p>
            <div className="space-y-2">
              <Step n={1}>
                Click <span className="font-medium text-foreground">Add User</span> and fill in
                the <span className="font-medium text-foreground">Display Name</span> (shown in
                their portal), <span className="font-medium text-foreground">User ID</span>{" "}
                (their login username — no spaces), and the{" "}
                <span className="font-medium text-foreground">Meta Account ID</span> in the
                format <Pill>act_123456789</Pill>.
              </Step>
              <Step n={2}>
                Optionally upload a <span className="font-medium text-foreground">brand logo</span>{" "}
                (PNG, JPG, WEBP, or SVG, max 2 MB). It appears in the client&apos;s portal top bar.
              </Step>
              <Step n={3}>
                Save. The user is created with no password. Their portal URL is automatically
                generated from their display name, e.g.{" "}
                <Pill>/inner-glow/portal/overview</Pill>.
              </Step>
              <Step n={4}>
                Share the portal URL and their User ID with the client. On first visit they
                will be prompted to create their own password.
              </Step>
            </div>
          </div>
          <div className="space-y-2 pt-1">
            <p className="font-medium text-foreground">Editing a user:</p>
            <p>
              Click the edit icon on any row to update the Meta Account ID or replace the brand
              logo. Display name and User ID cannot be changed after creation. To reset a
              client&apos;s password, delete and re-create the user (their portal URL will be
              preserved if the display name is the same).
            </p>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <span className="font-semibold">Note:</span> The Meta Account ID must exactly match
              the account in Meta Business Manager. Use the format{" "}
              <Pill>act_123456789</Pill> — the dashboard will add the <Pill>act_</Pill> prefix
              automatically if you omit it.
            </p>
          </div>
        </Section>

        {/* Client Portal */}
        <Section icon={Globe} title="Client Portal">
          <p>
            Each client accesses their portal at a unique URL based on their display name slug:
          </p>
          <div className="rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">
            https://yourdomain.com/[client-slug]/portal/overview
          </div>
          <p>
            The portal shows the client&apos;s own data only — aggregated KPIs, a daily
            performance chart, and the top 3 ads by spend with creative thumbnails, campaign
            name, impressions, clicks, CTR, and CPC. The date range picker works the same way
            as in the admin dashboard.
          </p>
          <div className="space-y-2">
            <p className="font-medium text-foreground">Client login flow:</p>
            <div className="space-y-2">
              <Step n={1}>Client visits their portal URL or <Pill>/login</Pill>.</Step>
              <Step n={2}>They enter their User ID (provided by you).</Step>
              <Step n={3}>
                First time: they create a password. Returning: they enter their password.
              </Step>
              <Step n={4}>They land directly on their overview page.</Step>
            </div>
          </div>
          <p>
            Client sessions are separate from admin sessions — logging into the client portal
            does not grant any admin access, and vice versa.
          </p>
        </Section>

        {/* Password Management */}
        <Section icon={KeyRound} title="Password Management">
          <p>
            Passwords are hashed server-side (bcrypt) and never stored in plain text. Neither
            admins nor clients can view each other&apos;s passwords.
          </p>
          <ul className="space-y-2 list-none pl-0">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span>
                <span className="font-medium text-foreground">Client passwords</span> — set by
                the client on their first login. The Users table shows a{" "}
                <span className="font-medium text-foreground">Pending</span> badge until
                the client completes setup.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span>
                <span className="font-medium text-foreground">Admin passwords</span> — set by
                each admin on their first sign-in at <Pill>/admin/login</Pill>. The Admins
                table shows the same Pending / Set status.
              </span>
            </li>
          </ul>
          <p>
            To reset a password: delete the user or admin account and re-create it. On next
            login, the password setup flow will trigger again.
          </p>
        </Section>

        {/* Logo / Branding */}
        <Section icon={ImageIcon} title="Client Branding (Logos)">
          <p>
            Each client user can have a brand logo that appears in the top bar of their portal.
            Upload it from the Users page when creating or editing a user.
          </p>
          <ul className="space-y-1.5 list-none pl-0">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span>Accepted formats: PNG, JPG, WEBP, SVG</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span>Maximum file size: 2 MB</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span>
                Logos are stored in <Pill>/public/uploads/logos/</Pill> and served directly
                as static files. Use SVG or PNG with transparency for best results on both
                light and dark themes.
              </span>
            </li>
          </ul>
          <p>
            To remove a logo, click the remove (×) button on the user row. To replace it,
            upload a new file — the old file is overwritten automatically.
          </p>
        </Section>

        {/* Admin Management */}
        <Section icon={UserCog} title="Admin Accounts">
          <p>
            Admin accounts control who can access <Pill>/dashboard</Pill>. There is one
            permanent super admin (<Pill>agencycollective</Pill>) that cannot be deleted.
            Only the super admin can create or remove other admin accounts.
          </p>
          <div className="space-y-2">
            <p className="font-medium text-foreground">Creating a new admin:</p>
            <div className="space-y-2">
              <Step n={1}>
                Sign in as <Pill>agencycollective</Pill> and go to{" "}
                <Pill>/dashboard/admins</Pill>.
              </Step>
              <Step n={2}>
                Enter the new admin&apos;s username (lowercase, no spaces) and click{" "}
                <span className="font-medium text-foreground">Add Admin</span>.
              </Step>
              <Step n={3}>
                Share the username with the new admin and direct them to{" "}
                <Pill>/admin/login</Pill> to create their password.
              </Step>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs">
              Regular admins have full dashboard access (all client data, alerts, users) but
              cannot access the Admins management page — that is exclusive to the super admin.
            </p>
          </div>
        </Section>

        {/* Alerts */}
        <Section icon={Bell} title="Alerts">
          <p>
            The <span className="font-medium text-foreground">Alerts</span> page monitors all
            connected Meta ad accounts for common issues and surfaces them in one place.
          </p>
          <ul className="space-y-1.5 list-none pl-0">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
              <span>
                <span className="font-medium text-foreground">Critical</span> — requires
                immediate attention (e.g. zero spend on an active campaign, billing issues).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              <span>
                <span className="font-medium text-foreground">Warning</span> — notable but not
                urgent (e.g. high CPC, low CTR, budget nearly exhausted).
              </span>
            </li>
          </ul>
          <p>
            Alert counts are shown as a badge on the sidebar icon. Use the{" "}
            <span className="font-medium text-foreground">Refresh</span> button in the top bar to
            fetch the latest data from Meta without waiting for the cache to expire (default
            cache: 5 minutes).
          </p>
        </Section>

        {/* Signing in */}
        <Section icon={LogIn} title="Signing In & Out">
          <ul className="space-y-2 list-none pl-0">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span>
                <span className="font-medium text-foreground">Admin login:</span>{" "}
                <Pill>/admin/login</Pill> — enter your username, then your password.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span>
                <span className="font-medium text-foreground">Client login:</span>{" "}
                <Pill>/login</Pill> — enter your User ID, then your password.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
              <span>
                <span className="font-medium text-foreground">Log out:</span> click the{" "}
                <span className="font-medium text-foreground">Log out</span> button at the
                bottom of the sidebar. Sessions expire automatically after 7 days.
              </span>
            </li>
          </ul>
          <p>
            Admin and client sessions are stored in separate, HTTP-only cookies and never
            interfere with each other. Visiting <Pill>/admin/login</Pill> while already signed
            in as admin redirects to the dashboard; visiting <Pill>/login</Pill> while signed in
            as a client redirects to the client portal.
          </p>
        </Section>
      </div>
    </DashboardShell>
  );
}
