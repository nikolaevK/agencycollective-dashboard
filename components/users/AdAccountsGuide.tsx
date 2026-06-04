"use client";

import { useEffect } from "react";
import {
  X,
  Megaphone,
  DollarSign,
  CalendarClock,
  Send,
  ReceiptText,
  Link2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

/**
 * In-app documentation for the Ad Accounts tab. A read-only slide-over drawer
 * written for a non-technical admin: what ad accounts are, how the monthly
 * billing schedule works, how invoicing + reconciliation connect to the Payout
 * DB, and the gotchas that trip people up. Triggered by the "Guide" button in
 * the AdAccountsDirectory toolbar. No data — purely explanatory.
 */
export function AdAccountsGuide({ onClose }: { onClose: () => void }) {
  // Close on Escape, lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="relative h-full w-full max-w-2xl overflow-y-auto bg-card shadow-xl border-l border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-card/95 backdrop-blur px-5 py-4">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Ad Accounts — how it works</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="Close guide"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-7 text-sm leading-relaxed text-foreground">
          {/* Intro */}
          <p className="text-muted-foreground">
            An <strong className="text-foreground">ad account</strong> is an agency-owned
            advertising account a client can optionally rent from us to run their Meta,
            TikTok, or Google ads. Each account is billed monthly. This tab is where you
            create accounts, assign them to clients, send invoices, and track who has paid.
            It is completely separate from a client&rsquo;s portal login and their Meta
            account connection — adding or removing an ad account never touches those.
          </p>

          {/* What you're billing */}
          <Section icon={DollarSign} title="What a client pays">
            <p>Every ad account carries up to two charges:</p>
            <ul className="mt-2 space-y-2">
              <li>
                <Pill>Monthly retainer</Pill> a flat monthly fee (e.g. $1,500/mo). Set when
                you create the account.
              </li>
              <li>
                <Pill>Ad-spend fee</Pill> a percentage of what the client spent on ads that
                month — between <strong>2% and 7%</strong> (in 0.5% steps). Default is 3.5%.
              </li>
            </ul>
            <p className="mt-2">
              A single invoice can include <strong>one or both</strong> of these. If you only
              enter a retainer it&rsquo;s a retainer invoice; only a spend figure makes it an
              ad-spend invoice; both makes it a combined invoice. A line only appears on the
              PDF when its amount is above zero. All invoices use Agency Collective branding.
            </p>
          </Section>

          {/* Accounts & clients */}
          <Section icon={Link2} title="Accounts, clients & brands">
            <ul className="space-y-2">
              <li>
                An account can be <strong>attached to a client</strong> or left{" "}
                <Pill>Unattached</Pill>. Assigning a client auto-names the account{" "}
                <code className="px-1 rounded bg-muted text-xs">AC_&lt;client&gt;</code>.
              </li>
              <li>
                Attaching a client is what links the account to a <strong>brand</strong> in
                the Payout DB. That brand link is how payments are matched back to the
                account (see &ldquo;Getting paid&rdquo; below). An unattached account can be
                invoiced, but it won&rsquo;t auto-match to any payment.
              </li>
              <li>
                Deleting a client never deletes their ad account — it just sets the account
                back to Unattached so its billing history is preserved.
              </li>
              <li>
                The <strong>Total Value</strong> card adds up the monthly retainers of{" "}
                <em>every</em> account (active or not). <strong>Bills Due</strong> counts
                active accounts whose monthly bill is due or overdue.{" "}
                <strong>Invoices Sent</strong> counts invoices that are still awaiting
                payment.
              </li>
            </ul>
          </Section>

          {/* The billing schedule */}
          <Section icon={CalendarClock} title="The monthly billing schedule">
            <p>
              Each account bills once a month. The <strong>Next Bill</strong> column shows a
              colored status chip plus the next bill date:
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <StatusRow color="bg-sky-500/15 text-sky-600 dark:text-sky-400" label="Upcoming">
                Bill is further out than the alert window.
              </StatusRow>
              <StatusRow color="bg-amber-500/15 text-amber-600 dark:text-amber-400" label="Due soon">
                Bill is within the alert window — time to invoice.
              </StatusRow>
              <StatusRow color="bg-red-500/15 text-red-600 dark:text-red-400" label="Overdue">
                Bill date has passed and nothing has been paid.
              </StatusRow>
              <StatusRow color="bg-violet-500/15 text-violet-600 dark:text-violet-400" label="Invoice sent">
                You&rsquo;ve invoiced this cycle; waiting for payment.
              </StatusRow>
              <StatusRow color="bg-slate-500/15 text-slate-600 dark:text-slate-400" label="Paused">
                Billing is turned off for this account.
              </StatusRow>
              <StatusRow color="bg-blue-500/15 text-blue-600 dark:text-blue-400" label="Extended">
                Bill has been deferred to a later date.
              </StatusRow>
            </div>
            <p className="mt-3">
              A separate green <Pill tone="green">Paid</Pill> chip can appear{" "}
              <em>alongside</em> any status — it means the current cycle has been settled by a
              payment. So a row can read &ldquo;Paid&rdquo; <em>and</em> &ldquo;Upcoming&rdquo;
              at the same time: this month is covered, next month is on its way.
            </p>
          </Section>

          {/* Billing controls */}
          <Section icon={CalendarClock} title="Billing controls (on the account form)">
            <p>When you add or edit an account, the &ldquo;Billing schedule&rdquo; box has:</p>
            <ul className="mt-2 space-y-2">
              <li>
                <Pill>Billing day</Pill> the day of the month it bills. Leave blank and it
                defaults to the day the account was created.
              </li>
              <li>
                <Pill>Alert lead (days)</Pill> how many days early the &ldquo;Due soon&rdquo;
                alert appears (default 5).
              </li>
              <li>
                <Pill>Extend until</Pill> push the next bill out to a specific date (e.g. a
                client asked for an extra week).
              </li>
              <li>
                <Pill>Last billed</Pill> manually set when this account was last billed. The
                next bill becomes one month after this date.
              </li>
              <li>
                <Pill>Pause billing</Pill> stop all alerts and billing for the account.
              </li>
            </ul>
            <Callout>
              <strong>&ldquo;Last billed&rdquo; does two things, not one.</strong> It overrides
              the date the system derives from payments, <em>and</em> its day-of-month
              becomes the billing day (when no billing day is set). Example: set Last billed
              to <em>June 3</em> and the next bill jumps to <em>July 3</em> — the engine now
              treats June as already billed and bills on the 3rd going forward.
            </Callout>
          </Section>

          {/* Sending an invoice */}
          <Section icon={Send} title="Sending an invoice">
            <ul className="space-y-2">
              <li>
                Use <strong>Send invoice</strong> on a row (or &ldquo;Send ad invoice&rdquo;
                in the toolbar for a one-off / free invoice with no account).
              </li>
              <li>
                When you send for an attached account, the account moves to{" "}
                <Pill tone="violet">Invoice sent</Pill> and the invoice is stamped to the{" "}
                <strong>current next-bill cycle</strong>. It clears automatically to{" "}
                <Pill tone="green">Paid</Pill> once a matching payment lands (see below).
              </li>
              <li>
                Sending a new invoice for an account <strong>replaces</strong> any previous
                still-unpaid invoice for that account (the old one becomes
                &ldquo;Superseded&rdquo;).
              </li>
              <li>
                The <ReceiptText className="inline h-3.5 w-3.5" /> Invoices button on each row
                opens that account&rsquo;s full invoice history.
              </li>
            </ul>
          </Section>

          {/* Registering a backdated invoice */}
          <Section icon={ReceiptText} title="Registering a backdated invoice">
            <p>
              If an invoice was sent <em>outside</em> this tool (by email, before this feature
              existed, etc.), open an account&rsquo;s <strong>Invoices</strong> →{" "}
              <strong>Register backdated</strong> to record it without re-emailing anything.
              Two date fields do very different jobs:
            </p>
            <div className="mt-3 space-y-2">
              <div className="rounded-lg border border-border/50 p-3">
                <p className="font-semibold">Sent date</p>
                <p className="text-muted-foreground">
                  When the invoice actually went out. Record-keeping only — it does{" "}
                  <strong>not</strong> affect the account&rsquo;s status.
                </p>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <p className="font-semibold">Cycle (billing date)</p>
                <p className="text-muted-foreground">
                  Which monthly cycle the invoice <em>covers</em>. This is the field that
                  decides whether the row shows as &ldquo;Invoice sent&rdquo; for the current
                  cycle. It&rsquo;s pre-filled with the account&rsquo;s next bill date — leave
                  it as-is unless you really mean a different cycle.
                </p>
              </div>
            </div>
            <p className="mt-2">
              Backdated invoices are recorded <em>alongside</em> the current one (they
              don&rsquo;t replace it), and you can optionally attach the original PDF.
            </p>
          </Section>

          {/* Getting paid */}
          <Section icon={CheckCircle2} title="Getting paid (reconciliation)">
            <p>
              The dashboard never marks a payment by hand — it reads the <strong>Payout DB</strong>.
              When a payout for the account&rsquo;s brand is flagged{" "}
              <strong>&ldquo;Ad Account&rdquo;</strong> in the Sales Rep column, the matching
              sent invoice auto-promotes to <Pill tone="green">Paid</Pill> and the account
              shows Paid until its next bill.
            </p>
            <ul className="mt-2 space-y-2">
              <li>
                Matching is done by <strong>brand and month</strong>: a payout in the
                invoice&rsquo;s cycle month (or later) settles it.
              </li>
              <li>
                Matching is <strong>per brand, not per account</strong>. If one brand has two
                ad accounts, a single &ldquo;Ad Account&rdquo; payout for that brand settles
                both accounts&rsquo; invoices. (Correct when one payment covers them all; it
                can&rsquo;t split a payment between two accounts.)
              </li>
              <li>
                Renaming or removing the &ldquo;Ad Account&rdquo; marker in the Sales Rep
                column silently turns off this auto-matching.
              </li>
            </ul>
          </Section>

          {/* Gotchas */}
          <Section icon={AlertTriangle} title="Gotchas worth knowing" danger>
            <ul className="space-y-3">
              <li>
                <strong>&ldquo;Invoice sent&rdquo; only shows for the current cycle.</strong>{" "}
                The chip appears only while the invoice&rsquo;s cycle matches the
                account&rsquo;s <em>current</em> next-bill date. If a payment lands (or you
                change the billing day / last-billed) after sending, the cycle moves on and an
                invoice for the old cycle is treated as history — the chip won&rsquo;t show.
              </li>
              <li>
                <strong>Any payment advances the next bill — not just ad-account ones.</strong>{" "}
                The &ldquo;last billed&rdquo; date is derived from the most recent payout of{" "}
                <em>any</em> kind for the brand. So an unrelated payment in a given month can
                push the next bill forward a month. (Only the green &ldquo;Paid&rdquo; chip is
                strict about being an actual &ldquo;Ad Account&rdquo; payment.)
              </li>
              <li>
                <strong>An invoice can jump straight to Paid.</strong> Because matching is by
                month, if a qualifying payment already exists for the cycle&rsquo;s month, a
                freshly sent invoice settles immediately and you may never see the
                &ldquo;Invoice sent&rdquo; step.
              </li>
              <li>
                <strong>Custom billing day vs. send-time cycle.</strong> If you&rsquo;ve set a
                Billing day or Last billed that differs from the account&rsquo;s creation day,
                a freshly sent invoice may not light up &ldquo;Invoice sent&rdquo; right away —
                its cycle is figured from the creation day at send time. Registering the
                invoice (which pre-fills the correct next-bill cycle) avoids this.
              </li>
            </ul>
          </Section>

          <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
            Tip: the same retainer + ad-spend logic and the same &ldquo;cycle vs sent
            date&rdquo; rules apply to client re-bills on the Directory tab.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  danger,
}: {
  icon: typeof Megaphone;
  title: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={danger ? "h-4 w-4 text-amber-500" : "h-4 w-4 text-primary"} />
        <h3 className="font-bold text-foreground">{title}</h3>
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "green" | "violet";
}) {
  const cls =
    tone === "green"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : tone === "violet"
      ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
      : "bg-muted text-foreground";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}

function StatusRow({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/50 p-2">
      <span
        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}
      >
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{children}</span>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-amber-900 dark:text-amber-200">
      {children}
    </div>
  );
}
