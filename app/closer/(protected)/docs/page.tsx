import {
  LayoutDashboard,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Plus,
  StickyNote,
  Users,
  Network,
  PhoneCall,
  Flag,
  RefreshCw,
  AlertTriangle,
  KeyRound,
  BookOpen,
  Mail,
  Share2,
  Archive,
} from "lucide-react";

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

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function CloserDocsPage() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Portal documentation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            A walkthrough of everything you can do in the closer + setter
            portal. The sections below match the sidebar items on the left.
          </p>
        </div>

        {/* ------------------------------------------------------ */}
        {/* Welcome / who this portal is for                        */}
        {/* ------------------------------------------------------ */}
        <Section icon={BookOpen} title="What this portal does">
          <p>
            The portal is for the sales team — closers handling deals and
            setters preparing them. You sign in once and the sidebar
            adjusts to your role.
          </p>
          <ul className="space-y-1.5 list-none pl-0">
            <Bullet>
              <span className="font-medium text-foreground">Closers</span>{" "}
              see: Dashboard, Calendar, New Deal, Notes, GHL Contacts.
            </Bullet>
            <Bullet>
              <span className="font-medium text-foreground">Setters</span>{" "}
              see: Dashboard, Appointments, Notes, GHL Contacts.
            </Bullet>
          </ul>
          <p>
            Notes and GHL Contacts work the same for both roles. The other
            tabs are role-specific.
          </p>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Sign in                                                 */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={KeyRound}
          title="Signing in"
          subtitle="/closer/login"
        >
          <p>
            Use the email and password you were given. On first login the
            system prompts you to set a new password — choose something
            strong (min 8 characters).
          </p>
          <p>
            Your session lasts 7 days. After that or after logging out
            (button at the bottom of the sidebar) you&apos;ll be asked to
            sign in again.
          </p>
          <Note>
            Closer and admin sessions are independent. If you have both,
            logging into one doesn&apos;t grant access to the other.
          </Note>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Closer Dashboard                                        */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={LayoutDashboard}
          title="Dashboard (closer)"
          subtitle="/closer/dashboard"
        >
          <p>
            Your landing page. Shows your performance over a chosen time
            window plus deals that need attention.
          </p>
          <SubSection title="What you see">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">
                  KPI cards
                </span>{" "}
                — appointments, deals closed, revenue, show rate. Each card
                shows the absolute number for the selected window.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Time-frame selector
                </span>{" "}
                — week, month, quarter, or custom. Every KPI updates as you
                change it.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Recent deals
                </span>{" "}
                — your last 50 deals with status, value, and a link to edit
                each.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  No-show follow-ups
                </span>{" "}
                — events you personally marked No Show. Click any row to
                see the lead&apos;s context (Google event, setter notes,
                attendance history) and start a follow-up. Once they
                attend, mark them Showed and they recover from this list.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Showed follow-ups
                </span>{" "}
                — same idea for events you marked Showed but haven&apos;t
                yet converted to a deal.
              </Bullet>
            </ul>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Setter Dashboard                                        */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={LayoutDashboard}
          title="Dashboard (setter)"
          subtitle="/closer/setter"
        >
          <p>
            Setter-specific home page. Surfaces appointments you set, your
            show rate, revenue attributed to your prep work, and the deals
            you&apos;ve been credited for.
          </p>
          <SubSection title="What you see">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">
                  Appointments set
                </span>{" "}
                — count of Google Calendar events you&apos;ve claimed.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Show rate
                </span>{" "}
                — % of your claimed appointments where the closer marked
                Showed. Computed across the time window.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Revenue attributed
                </span>{" "}
                — sum of <Pill>deal_value</Pill> for deals where you&apos;re
                the credited setter.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Commission earned
                </span>{" "}
                — calculated from the tier you picked on each appointment
                (see Tiers below). Only paid deals contribute.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Pending / active / recovered no-show sections
                </span>{" "}
                — your appointments grouped by status so you know who to
                chase, who&apos;s still waiting, and who came back.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Deals credited
                </span>{" "}
                — every deal that names you as the setter, with the
                tier and amount.
              </Bullet>
            </ul>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Calendar (closer only)                                  */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={CalendarDays}
          title="Calendar (closer)"
          subtitle="/closer/calendar"
        >
          <p>
            Team-wide Google Calendar view. Each event card shows the time,
            attendees, Google Meet link, and any setter prep work.
            You&apos;ll see every closer&apos;s events, not just yours —
            but only you can mark your own attendance on each event.
          </p>
          <SubSection title="Marking show / no show">
            <p>
              Every card has two buttons at the bottom:
            </p>
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <CheckCircle2 className="inline h-3 w-3 text-emerald-600" />{" "}
                <span className="font-medium text-foreground">Showed</span>{" "}
                — the prospect attended the call.
              </Bullet>
              <Bullet>
                <XCircle className="inline h-3 w-3 text-red-600" />{" "}
                <span className="font-medium text-foreground">No Show</span>{" "}
                — they didn&apos;t.
              </Bullet>
            </ul>
            <p>
              Click again on the same button to clear the mark (you might
              have hit it by mistake or need to revise). A spinner shows
              while the click is being saved.
            </p>
          </SubSection>
          <SubSection title="What marking does">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                Writes the attendance to your dashboard immediately — your
                stats update right away.
              </Bullet>
              <Bullet>
                If the event is linked to a GoHighLevel appointment, also
                updates GHL automatically so the two systems stay in step.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Event card details">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">
                  Calendar owner
                </span>{" "}
                — small grey badge naming whose Google calendar the event
                came from.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Deal Linked
                </span>{" "}
                — green pill if a deal already exists for this event.
                Click <span className="font-medium text-foreground">Edit Deal</span>{" "}
                to open it.
              </Bullet>
              <Bullet>
                <Flag className="inline h-3 w-3 text-sky-600" />{" "}
                <span className="font-medium text-foreground">
                  Setter: NAME
                </span>{" "}
                — sky pill naming the setter who prepped the call. Their
                pre/post-call notes appear in a panel below.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Link as Deal
                </span>{" "}
                — button on un-linked events. Opens a quick modal to create
                a deal from the event (pulls title + date as defaults).
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Week navigation">
            <p>
              Arrows at the top jump weeks. The label shows the current
              window. &quot;Back to this week&quot; resets the view. If
              multiple Google calendars are connected, filter chips above
              the events let you focus on one calendar&apos;s events.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* GHL sync                                                 */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={RefreshCw}
          title="GoHighLevel sync chip"
          subtitle="On every calendar event linked to a GHL appointment"
        >
          <p>
            When an event has a matching GoHighLevel appointment, the card
            shows a sync chip just below the Show / No Show buttons. There
            are three states:
          </p>
          <SubSection title="States">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <CheckCircle2 className="inline h-3 w-3 text-emerald-600" />{" "}
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  Synced with GHL
                </span>{" "}
                — both systems agree. Nothing to do.
              </Bullet>
              <Bullet>
                <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[11px] font-semibold">
                  <AlertTriangle className="h-3 w-3" /> Out of sync with GHL
                </span>{" "}
                — they disagree. The chip names both observed values:
                &quot;Dashboard: X · GHL: Y&quot;.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Syncing…
                </span>{" "}
                — spinner during an in-flight click.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Reconciling out-of-sync">
            <p>
              When you see the amber chip, decide which side has the
              correct value and click the matching button:
            </p>
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">
                  Push to GHL
                </span>{" "}
                — sends the dashboard&apos;s current mark to GHL. Use this
                when the dashboard is right.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Pull from GHL
                </span>{" "}
                — pulls GHL&apos;s current value and overwrites the
                dashboard. Use this when someone updated GHL directly and
                that&apos;s the truth.
              </Bullet>
            </ul>
            <p>
              After either click the chip flips back to{" "}
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                Synced
              </span>{" "}
              within a second or two.
            </p>
          </SubSection>
          <SubSection title="When the chip doesn't appear">
            <p>
              No chip means the event isn&apos;t linked to a GHL
              appointment. Most likely the title or time differs between
              Google Calendar and GHL, so the system can&apos;t pair them.
              In that case dashboard marks only affect the dashboard side —
              no GHL update.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* New Deal (closer only)                                  */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Plus}
          title="New Deal"
          subtitle="/closer/new-deal"
        >
          <p>
            Create a deal record from a Google Calendar event. The
            preferred workflow is to use the{" "}
            <span className="font-medium text-foreground">Link as Deal</span>{" "}
            button on the Calendar — it pre-fills everything. New Deal
            covers the case when you want to enter a deal manually.
          </p>
          <SubSection title="Required fields">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">
                  Client name
                </span>
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Deal value
                </span>{" "}
                (USD)
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Status</span>{" "}
                — closed, not_closed, pending_signature, rescheduled, or
                follow_up
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Optional fields">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                Service category (picks a default contract template + invoice
                pre-fill)
              </Bullet>
              <Bullet>Industry, brand, website</Bullet>
              <Bullet>Closing date</Bullet>
              <Bullet>Client email + additional CC emails (for invoice / contract sends)</Bullet>
              <Bullet>Notes (free-form)</Bullet>
              <Bullet>Google event link — when present, deals auto-mark Showed and the deal credits the setter who prepped the event (if they declared a tier)</Bullet>
              <Bullet>Payment type — local (Zelle / wire US) or international (SWIFT)</Bullet>
            </ul>
          </SubSection>
          <SubSection title="What happens after save">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                If status = <Pill>closed</Pill>: an invoice draft is
                generated automatically using the agency&apos;s sender
                details + the service catalog.
              </Bullet>
              <Bullet>
                If a contract template matches the service category, a
                DocuSeal submission is created and a signing URL becomes
                available.
              </Bullet>
              <Bullet>
                Attendance is auto-marked Showed for the linked event (and
                pushed to GHL if it&apos;s linked there too).
              </Bullet>
              <Bullet>
                Admins get a push notification when a deal lands closed.
              </Bullet>
            </ul>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Setter Appointments                                     */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={CalendarDays}
          title="Appointments (setter)"
          subtitle="/closer/setter/appointments"
        >
          <p>
            Claim Google Calendar events you prepped and track them with
            pre / post-call statuses, client info, free-form notes, and
            your commission tier choice.
          </p>
          <SubSection title="Claiming an event">
            <Step n={1}>
              Find a Google Calendar event you set up. Click{" "}
              <span className="font-medium text-foreground">
                Claim appointment
              </span>{" "}
              on the card.
            </Step>
            <Step n={2}>
              Set the pre-call status (Confirmed, Voicemail, Triaged /
              Confirmed, etc.) as you work the lead.
            </Step>
            <Step n={3}>
              After the call, set post-call status (Followed up, Needs
              follow-up, Qualified, Disqualified) and pick a{" "}
              <span className="font-medium text-foreground">tier</span> to
              claim commission credit.
            </Step>
            <Step n={4}>
              Add notes (client details, objections, anything the closer
              should know). These show up on the closer&apos;s calendar
              card.
            </Step>
          </SubSection>
          <SubSection title="Pre-call statuses">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <Pill>not_called</Pill> — initial state
              </Bullet>
              <Bullet>
                <Pill>auto_confirmed</Pill> — confirmed via automated text /
                self-service
              </Bullet>
              <Bullet>
                <Pill>auto_no_answer</Pill> — automation failed to confirm
              </Bullet>
              <Bullet>
                <Pill>triaged_confirmed</Pill> — you triaged and confirmed
              </Bullet>
              <Bullet>
                <Pill>confirmed</Pill> — direct confirmation
              </Bullet>
              <Bullet>
                <Pill>no_answer</Pill> — couldn&apos;t reach them
              </Bullet>
              <Bullet>
                <Pill>voicemail</Pill> — left voicemail
              </Bullet>
              <Bullet>
                <Pill>rescheduled</Pill> — moved to a new slot
              </Bullet>
              <Bullet>
                <Pill>cancelled</Pill> — they cancelled
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Post-call statuses">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <Pill>followed_up</Pill> — touched base after the call
              </Bullet>
              <Bullet>
                <Pill>needs_followup</Pill> — they need another touch
              </Bullet>
              <Bullet>
                <Pill>qualified</Pill> — passes for a closer call
              </Bullet>
              <Bullet>
                <Pill>disqualified</Pill> — not a fit
              </Bullet>
              <Bullet>
                <Pill>no_answer</Pill> — never connected
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Commission tiers">
            <p>
              You must declare a tier on each appointment to be credited
              for any deal that closes from it. The tiers come from your
              1099 contract:
            </p>
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  Tier A — Setter-Sourced
                </span>
                : 3 % of collected gross revenue. You found the lead.
              </Bullet>
              <Bullet>
                <span className="font-medium text-sky-700 dark:text-sky-400">
                  Tier B — Setter-Recovered
                </span>
                : 2 % of collected gross revenue. The lead was nurtured by
                automation; you recovered it.
              </Bullet>
              <Bullet>
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  Tier C — Setter-Confirmed (Self-Booked)
                </span>
                : $25 flat per attended call ≥ 2 minutes. You only
                confirmed an already-self-booked appointment.
              </Bullet>
              <Bullet>
                <span className="font-medium text-muted-foreground">
                  Tier D — System-Nurtured
                </span>
                : no commission. You logged the appointment but didn&apos;t
                add value.
              </Bullet>
            </ul>
            <Note tone="warn">
              If you don&apos;t pick a tier you get no commission on that
              appointment&apos;s deal, even if it closes. Pick deliberately.
            </Note>
          </SubSection>
          <SubSection title="Multiple setters">
            <p>
              If two setters claim the same event, the most recently
              updated claim wins for attribution. If Setter A claims, then
              B claims later, B is credited. If A later edits their notes,
              A reclaims credit. Be intentional about who works what.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Notes                                                   */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={StickyNote}
          title="Notes"
          subtitle="/closer/notes  ·  /closer/setter/notes"
        >
          <p>
            Personal scratchpad with priority, tags, due dates, lead
            linkage, and sharing. Setters and closers use the same notes
            page; each user sees only their own notes plus notes shared
            with them.
          </p>
          <SubSection title="Creating a note">
            <Step n={1}>
              Click <span className="font-medium text-foreground">New note</span>.
            </Step>
            <Step n={2}>
              Enter a title and markdown body. The editor supports common
              Markdown — bold, italic, lists, links. Raw HTML is escaped.
            </Step>
            <Step n={3}>
              Set priority (high / medium / low), optional due date, and
              free-form tags.
            </Step>
            <Step n={4}>
              Link a lead (optional) — pick from your appointments, deals,
              or no-show follow-ups. Once linked, opening the note shows a
              context panel with the lead&apos;s Google event, attendance
              history, setter notes, and deal status.
            </Step>
            <Step n={5}>
              Optionally share with teammates (next subsection).
            </Step>
          </SubSection>
          <SubSection title="Grouping">
            <p>
              Use the toggle at the top of the board to group by Priority,
              Due Date, Tag, or Linked Lead. Grouping is client-side and
              only affects how notes are displayed — the data is unchanged.
            </p>
          </SubSection>
          <SubSection title="Sharing">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <Share2 className="inline h-3 w-3" />{" "}
                <span className="font-medium text-foreground">
                  Share with…
                </span>{" "}
                — search teammates by name. Up to 50 recipients per note.
              </Bullet>
              <Bullet>
                Recipients see the note read-only on their own board with a{" "}
                <span className="font-medium text-foreground">
                  Shared by X
                </span>{" "}
                badge.
              </Bullet>
              <Bullet>
                Only the owner can edit or delete the note. Recipients get
                a 403 if they try.
              </Bullet>
              <Bullet>
                <Archive className="inline h-3 w-3" />{" "}
                <span className="font-medium text-foreground">Archive</span>{" "}
                — a recipient can dismiss a shared note from their board.
                The owner&apos;s copy and other recipients are unaffected.
                Archived notes show in a collapsed section at the bottom
                with an unarchive action.
              </Bullet>
              <Bullet>
                If the owner deletes the note, every recipient&apos;s copy
                disappears too (FK cascade).
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Unread badge">
            <p>
              When someone shares a note with you, a red dot appears on
              the Notes item in the sidebar with the unread count. Opening
              the notes page clears the badge.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* GHL Contacts                                            */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Users}
          title="GHL Contacts"
          subtitle="/closer/ghl-contacts"
        >
          <p>
            Browse the agency&apos;s GoHighLevel contacts directly. This
            view is read-only: you can search, filter, and inspect
            contacts but can&apos;t edit them from here.
          </p>
          <SubSection title="What you can do">
            <ul className="space-y-1.5 list-none pl-0">
              <Bullet>
                <span className="font-medium text-foreground">Search</span>{" "}
                — by name, email, or phone. Live as you type.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">Sort</span>{" "}
                — recently added, alphabetical, last appointment date.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Filter chips
                </span>{" "}
                — by tag (e.g., a specific campaign), source, DND status,
                whether they have open opportunities, and what their
                appointment statuses look like.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Open a contact
                </span>{" "}
                — full profile with messages thread, opportunities pipeline,
                appointment history, and existing GHL notes.
              </Bullet>
              <Bullet>
                <span className="font-medium text-foreground">
                  Add a note
                </span>{" "}
                — you can create new notes on GHL contacts directly from
                their profile. New notes appear in GHL and in this view
                within a minute.
              </Bullet>
            </ul>
          </SubSection>
          <SubSection title="Cross-reference with Google Calendar">
            <p>
              On the Calendar page, each event has a small chip with the
              contact name when the system can match the event to a GHL
              contact. Click the chip to jump straight to that
              contact&apos;s profile here.
            </p>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Lead context modal                                      */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={PhoneCall}
          title="Lead context modal"
          subtitle="Available from many surfaces"
        >
          <p>
            Anywhere you see a linked-lead chip (notes, no-show follow-ups,
            shared notes), clicking it opens the{" "}
            <span className="font-medium text-foreground">
              Lead Context modal
            </span>{" "}
            — a single panel showing everything the system knows about a
            lead:
          </p>
          <ul className="space-y-1.5 list-none pl-0">
            <Bullet>The Google Calendar event (time, title, attendees, Meet link)</Bullet>
            <Bullet>Every setter claim on this event (with pre/post-call notes)</Bullet>
            <Bullet>Every attendance mark across all closers</Bullet>
            <Bullet>Every linked deal (status, value, closer)</Bullet>
            <Bullet>The matched GHL contact, if any (with link to their profile)</Bullet>
          </ul>
          <p>
            One modal, every piece of context. Use this before calling a
            no-show or following up on a stalled deal.
          </p>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* Tips                                                    */}
        {/* ------------------------------------------------------ */}
        <Section
          icon={Mail}
          title="Common workflows"
        >
          <SubSection title="As a closer, after a call">
            <Step n={1}>
              Open <span className="font-medium text-foreground">Calendar</span> and find the event.
            </Step>
            <Step n={2}>
              Click <span className="font-medium text-foreground">Showed</span>{" "}
              or <span className="font-medium text-foreground">No Show</span>.
              GHL updates automatically if it&apos;s linked.
            </Step>
            <Step n={3}>
              If they closed: click <span className="font-medium text-foreground">Link as Deal</span>,
              fill in deal value + status = closed. Invoice + contract are
              auto-generated.
            </Step>
            <Step n={4}>
              If they no-showed: the event lands in your dashboard&apos;s
              No-show follow-ups for tracking.
            </Step>
          </SubSection>
          <SubSection title="As a setter, working a fresh lead">
            <Step n={1}>
              From the appointments page, claim the Google Calendar event.
            </Step>
            <Step n={2}>
              Triage / confirm the appointment. Update pre-call status as
              you work it.
            </Step>
            <Step n={3}>
              After the call (whether or not it happened): set the
              post-call status and pick the tier that reflects your
              contribution.
            </Step>
            <Step n={4}>
              Add a note with anything the closer should know. They&apos;ll
              see it on their calendar card.
            </Step>
          </SubSection>
          <SubSection title="Resolving an out-of-sync chip">
            <Step n={1}>
              Read both values shown on the amber chip.
            </Step>
            <Step n={2}>
              Decide which is correct. If you just updated GHL and want
              the dashboard to match, click{" "}
              <span className="font-medium text-foreground">Pull from GHL</span>.
              If the dashboard is right, click{" "}
              <span className="font-medium text-foreground">Push to GHL</span>.
            </Step>
            <Step n={3}>
              Wait a second — the chip flips green. You&apos;re done.
            </Step>
          </SubSection>
        </Section>

        {/* ------------------------------------------------------ */}
        {/* FAQ                                                     */}
        {/* ------------------------------------------------------ */}
        <Section icon={Network} title="FAQ">
          <SubSection title="Why don't I see a GHL chip on this event?">
            <p>
              The system pairs Google events with GHL appointments by
              matching <span className="font-medium text-foreground">title</span>
              , <span className="font-medium text-foreground">start time</span>
              , and{" "}
              <span className="font-medium text-foreground">end time</span>{" "}
              exactly. If even one of those differs between Google and GHL,
              they don&apos;t pair and no chip appears. Your dashboard
              mark still works, it just isn&apos;t pushed to GHL.
            </p>
          </SubSection>
          <SubSection title="Why does the chip keep flipping to out of sync after I push?">
            <p>
              Most likely a GHL workflow / automation is overwriting the
              status right after our push (e.g., a trigger that sets
              <Pill>confirmed</Pill> on certain conditions). Ask an admin to
              check the GHL automation rules for that calendar.
            </p>
          </SubSection>
          <SubSection title="Can I undo a Pull?">
            <p>
              Click the opposite Show / No Show button to overwrite the
              pulled value, or hit Push immediately to send the dashboard
              value back to GHL. There&apos;s no built-in &quot;undo&quot;
              — but every mark is reversible.
            </p>
          </SubSection>
          <SubSection title="A setter changed their tier and now my deal stats look different">
            <p>
              Correct — tier changes flow through to commission math live.
              If the setter rescinds a tier, the deal&apos;s setter credit
              disappears.
            </p>
          </SubSection>
          <SubSection title="My password is forgotten / locked">
            <p>
              Ask an admin to delete and re-create your account. Your
              display name and existing data are preserved if they
              re-create with the same email. On next login you set a fresh
              password.
            </p>
          </SubSection>
        </Section>
      </div>
    </main>
  );
}
