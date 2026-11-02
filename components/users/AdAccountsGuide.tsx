"use client";

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
import { cn } from "@/lib/utils";
import { BadgeDot, StatusBadge, badgeTone, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { RebillStatus } from "@/lib/clientBilling";
import { REBILL_STATUS_META } from "./RebillStatusChip";

/**
 * In-app documentation for the Ad Accounts tab. A read-only slide-over drawer
 * written for a non-technical admin: what ad accounts are, how the monthly
 * billing schedule works, how invoicing + reconciliation connect to the Payout
 * DB, and the gotchas that trip people up. Triggered by the "Guide" button in
 * the AdAccountsDirectory toolbar. No data — purely explanatory.
 */
export function AdAccountsGuide({ onClose }: { onClose: () => void }) {
  // Radix Sheet: closes on Escape / backdrop click and locks body scroll.
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        className="w-full gap-0 overflow-y-auto overscroll-contain sm:max-w-2xl"
      >
        {/* Header */}
        <SheetHeader className="sticky top-0 z-10 flex-row items-center justify-between gap-2 space-y-0 border-b bg-popover/95 px-6 py-4 backdrop-blur">
          <SheetTitle className="flex items-center gap-2">
            <Megaphone className="size-4 text-muted-foreground" />
            Ad Accounts — how it works
          </SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close guide" className="bg-secondary">
              <X />
            </Button>
          </SheetClose>
        </SheetHeader>

        <div className="space-y-7 px-6 py-5 text-sm leading-relaxed text-foreground">
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
                <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">AC_&lt;client&gt;</code>.
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
              <StatusRow status="upcoming" label="Upcoming">
                Bill is further out than the alert window.
              </StatusRow>
              <StatusRow status="due" label="Due soon">
                Bill is within the alert window — time to invoice.
              </StatusRow>
              <StatusRow status="overdue" label="Overdue">
                Bill date has passed and nothing has been paid.
              </StatusRow>
              <StatusRow status="invoice_sent" label="Invoice sent">
                You&rsquo;ve invoiced this cycle; waiting for payment.
              </StatusRow>
              <StatusRow status="paused" label="Paused">
                Billing is turned off for this account.
              </StatusRow>
              <StatusRow status="extended" label="Extended">
                Bill has been deferred to a later date.
              </StatusRow>
            </div>
            <p className="mt-3">
              A separate green <Pill tone="success">Paid</Pill> chip can appear{" "}
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
                Use <strong>Send invoice</strong> in a row&rsquo;s &ldquo;&hellip;&rdquo; menu (or &ldquo;Send ad invoice&rdquo;
                in the toolbar for a one-off / free invoice with no account).
              </li>
              <li>
                When you send for an attached account, the account moves to{" "}
                <Pill tone="info">Invoice sent</Pill> and the invoice is stamped to the{" "}
                <strong>current next-bill cycle</strong>. It clears automatically to{" "}
                <Pill tone="success">Paid</Pill> once a matching payment lands (see below).
              </li>
              <li>
                Sending a new invoice for the <strong>same cycle</strong> replaces that
                cycle&rsquo;s still-unpaid invoice (the old one becomes &ldquo;Superseded&rdquo;
                and stays in the history). Unpaid invoices for <em>other</em> cycles are never
                touched — they keep waiting for payment — unless you tick{" "}
                <strong>Replace</strong> next to one in the send drawer because this invoice
                re-issues it (one from the <em>same month</em> — the cycle date moved — comes
                pre-ticked).
              </li>
              <li>
                One payment settles <strong>one</strong> awaiting invoice: when an account owes
                on several cycles, a payout in an invoice&rsquo;s own month settles that invoice
                first, otherwise the oldest open cycle. A payment that already settled an
                invoice is never reused for another.
              </li>
              <li>
                <strong>Chasing payment? Use Follow up, not a re-send.</strong> Every awaiting
                invoice (in the Sent invoices panel and the account&rsquo;s Invoices history) has
                a <strong>Follow up</strong> button: email a reminder that re-attaches the{" "}
                <em>original</em> PDF to the original recipient and CCs (editable, with an
                optional personal note), or log a call / message / note. The invoice itself is
                never changed — same number, amount, sent date and cycle — and every touch is kept
                in its history. Rows quiet for a week turn amber.
              </li>
              <li>
                <ReceiptText className="inline size-3.5 align-text-bottom text-muted-foreground" /> <strong>Invoices</strong> in a
                row&rsquo;s &ldquo;&hellip;&rdquo; menu opens that account&rsquo;s full invoice history.
              </li>
              <li>
                The bank details printed on these invoices (Local and International) are editable
                under <strong>Payment settings</strong> in the toolbar — they apply to ad-account
                invoices <em>only</em>, never deal or client re-bill invoices.
              </li>
              <li>
                The <strong>retainer</strong> and <strong>ad-spend fee</strong> lines are calculated
                from the Invoice components fields and are locked in the line list — change the
                amounts above, not the lines. Extra lines you add stay editable. An optional{" "}
                <strong>discount</strong> reduces the total (the recorded amount is the discounted
                total).
              </li>
              <li>
                Use the expand button in the drawer header for a wide editor with a live preview
                beside it; <strong>Preview</strong> shows the exact PDF before you send.
              </li>
              <li>
                <strong>Save draft</strong> keeps an invoice without sending it. Drafts — yours and
                ones prepared by agents through the API / MCP — wait under{" "}
                <strong>Drafts</strong> in the Client Directory header until someone opens one,
                reviews it and presses <strong>Approve &amp; send</strong> (or rejects it with a
                note). A draft never emails anyone on its own.
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
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="font-medium">Sent date</p>
                <p className="text-muted-foreground">
                  When the invoice actually went out. Record-keeping only — it does{" "}
                  <strong>not</strong> affect the account&rsquo;s status.
                </p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="font-medium">Cycle (billing date)</p>
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
              By default the dashboard reads the <strong>Payout DB</strong> rather than being told a payment landed.
              When a payout for the account&rsquo;s brand is flagged{" "}
              <strong>&ldquo;Ad Account&rdquo;</strong> in the Sales Rep column, the matching
              sent invoice auto-promotes to <Pill tone="success">Paid</Pill> and the account
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

          {/* Manual overrides */}
          <Section icon={CheckCircle2} title="Manual controls (when the automation gets it wrong)">
            <p>
              Payments arrive late, land under a different month, or get booked ahead —
              and the automatic matching above only ever moves an invoice from{" "}
              <Pill tone="info">Awaiting</Pill> to <Pill tone="success">Paid</Pill>. Every other
              transition is yours. Open an account&rsquo;s <strong>Invoices</strong> and use{" "}
              <strong>Manage</strong> on any row:
            </p>
            <ul className="mt-2 space-y-2">
              <li>
                <strong>Mark paid</strong> — settles the invoice&rsquo;s cycle by hand: the account
                shows Paid and its next bill moves one month on, exactly as if a payout had
                landed for that cycle. Optionally <strong>link a payout row</strong> from the
                brand&rsquo;s ledger to record which payment it was (also available later via{" "}
                <strong>Link payout</strong>). Linking is a record, not a move — if a payment was
                booked under the wrong month, edit its Payout Month on the Payouts page instead.
              </li>
              <li>
                <strong>Mark unpaid</strong> — records that the cycle went unpaid (works on paid
                invoices too). The schedule is not advanced.
              </li>
              <li>
                <strong>Reopen</strong> — puts a paid/unpaid invoice back to awaiting.
              </li>
              <li>
                <strong>Set cycle</strong> — moves the invoice to a previous or future billing
                cycle. Only an awaiting invoice on the <em>current</em> cycle lights the
                &ldquo;Invoice sent&rdquo; status, so align it here when a payout or a billing-day
                change has shifted the schedule.
              </li>
              <li>
                <strong>Resync</strong> — shown on rows you set by hand: clears the manual markers,
                returns the invoice to awaiting, and lets the Payout DB decide again.
              </li>
              <li>
                <strong>Superseded</strong> invoices (replaced by a re-send) are frozen — manage
                the newer invoice instead.
              </li>
            </ul>
            <p className="mt-2">
              Anything you set by hand is <strong>locked</strong> (a small &ldquo;manual&rdquo; tag) —
              the auto-matching leaves it alone until you Resync, so a stray payout can&rsquo;t undo
              your call. When sending a new invoice you can also pick the <strong>billing cycle</strong>{" "}
              it covers: a send replaces only an awaiting invoice for that <em>same</em> cycle (a
              re-send), so a delayed or upcoming month is recorded alongside the current one,
              like a registered backdated invoice.
            </p>
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

          <Section icon={Link2} title="Workspaces (separate books for outside teams)">
            <ul className="space-y-3">
              <li>
                Every ad account belongs to a <strong>workspace</strong> (book). Accounts
                created here land in your book; assigning a client moves the account into
                that client&rsquo;s book. Admins only see the accounts — and the summary
                cards, alerts and sent-invoice panels — of the book(s) they&rsquo;re
                assigned to; super admins and Admin Management see every book.
              </li>
              <li>
                <strong>Partner-book accounts match payouts by the explicit link only.</strong>{" "}
                For accounts outside the main book, the schedule and the auto-Paid
                reconciliation use the client&rsquo;s agency-managed <em>Payout brand</em>{" "}
                link with an exact match — never the fuzzy name match — so a name collision
                with another book&rsquo;s brand can&rsquo;t move their billing.
              </li>
              <li>
                <strong>External partner admins</strong> can send and register invoices for
                their own accounts, but not free invoices (no account), and the Payment
                settings (bank details) stay internal — invoices still carry the standard
                payment block automatically.
              </li>
            </ul>
          </Section>

          <p className="border-t pt-2 text-xs text-muted-foreground">
            Tip: the same retainer + ad-spend logic and the same &ldquo;cycle vs sent
            date&rdquo; rules apply to client re-bills on the Directory tab.
          </p>
        </div>
      </SheetContent>
    </Sheet>
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
        <Icon
          className={cn(
            "size-4 shrink-0",
            danger ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          )}
        />
        <h3 className="font-medium text-foreground">{title}</h3>
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
  tone?: "success" | "info";
}) {
  // Same chips the table renders: "Paid" = success, "Invoice sent" /
  // "Awaiting" = info; untoned pills name a field or a value. Spans, not the
  // kit's <div> Badge — these sit inside paragraphs.
  if (tone) {
    return (
      <span className={cn(badgeVariants({ variant: "outline", tone }), "gap-1.5 align-middle")}>
        <BadgeDot tone={tone} />
        {children}
      </span>
    );
  }
  return (
    <span className={cn(badgeVariants({ variant: "secondary" }), "align-middle")}>{children}</span>
  );
}

function StatusRow({
  status,
  label,
  children,
}: {
  status: RebillStatus;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-2xl p-3 ring-1 ring-foreground/5 dark:ring-foreground/10">
      <StatusBadge tone={REBILL_STATUS_META[status].tone} className="shrink-0">
        {label}
      </StatusBadge>
      <span className="text-xs text-muted-foreground">{children}</span>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className={cn("mt-3 rounded-2xl border px-4 py-3", badgeTone.warning)}>
      {children}
    </div>
  );
}
