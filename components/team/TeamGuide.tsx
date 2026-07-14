"use client";

import {
  Users,
  KanbanSquare,
  Inbox,
  RefreshCcw,
  Bot,
  ShieldCheck,
  Split,
  Radar,
  ArrowRight,
  ArrowLeftRight,
  Gauge,
  Percent,
  MousePointerClick,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  SOURCE_META,
  ATTRIBUTION_LABEL,
  MONTHLY_REBILL_META,
} from "./presentation";
import type { TeamAttribution, MonthlyRebillBucket } from "./types";

/**
 * The Documentation tab on /dashboard/team. Read-only explainer for the whole
 * Team hub — roster & attribution, the monthly re-bill tracker + retention,
 * header drilldowns, tasks, action items, the two-way sync, reassignment, the
 * system sweep, CSM auto-split, and the external API/MCP agent workflow (with
 * payload schemas). Diagrams render from the SAME presentation constants the
 * live UI uses, so colors/labels can't drift. No data fetches — purely
 * explanatory. Keep in sync with lib/teamHub.ts / teamRebill.ts /
 * teamTasks.ts / teamActionItems.ts and the v1 team surface.
 */
export function TeamGuide() {
  return (
    <div className="max-w-4xl space-y-8 text-sm leading-relaxed text-foreground">
      {/* Intro */}
      <p className="text-muted-foreground">
        The <strong className="text-foreground">Team hub</strong> gives every team member one
        workspace that combines their slice of the Client Directory (clients, MRR managed,
        monthly re-bill collection, retention, health) with a personal task board and an
        action-item inbox. The roster, goals, and client attribution live here; the client and
        payout data itself always comes live from the Client Directory and the Payout DB —
        nothing is duplicated or entered twice.
      </p>

      {/* Access */}
      <Section icon={ShieldCheck} title="Who sees what">
        <ul className="space-y-2">
          <li>
            <strong>Every admin</strong> can open this page, see the team overview cards, and
            view + manage <strong>their own hub</strong> (tasks, action items, comments).
          </li>
          <li>
            Opening <strong>another member&rsquo;s hub</strong>, managing the roster and goals,
            and running the CSM auto-split require the <Pill>admin</Pill> permission (or super
            admin). There is no separate &ldquo;team&rdquo; permission.
          </li>
          <li>
            Tasks and action items belonging to someone else read as{" "}
            <em>not found</em> for non-privileged admins — ids are never leaked.
          </li>
          <li>
            Every member can <strong>forward their own</strong> tasks and action items to
            another roster member — see <em>Reassignment</em> below.
          </li>
        </ul>
      </Section>

      {/* Roster & attribution */}
      <Section icon={Users} title="Roster, attribution & goals">
        <p>
          The roster is manual: each member is an admin with a free-text position and an{" "}
          <strong>attribution</strong> that decides which clients count as theirs:
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(Object.keys(ATTRIBUTION_LABEL) as TeamAttribution[]).map((a) => (
            <div key={a} className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
              <div className="text-xs font-bold text-foreground">{ATTRIBUTION_LABEL[a]}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {a === "book" && "The whole active book — every active client (COO view)."}
                {a === "lead" && "Clients where this admin is assigned as Head of Ads in the Directory."}
                {a === "media_buyer" && "Clients where this admin is the assigned Media Buyer."}
                {a === "csm" && "Clients where this admin is the assigned CSM. Auto-split eligible."}
              </div>
            </div>
          ))}
        </div>
        <ul className="mt-3 space-y-2">
          <li>
            <strong>MRR managed</strong> sums each attributed client&rsquo;s effective MRR
            (PepAds manual MRR included). The <strong>monthly goal</strong> is the expected
            re-bill <em>collection</em> for the month — it is compared against collected
            re-bills (the tracker&rsquo;s &ldquo;% of goal&rdquo; and the hub&rsquo;s goal
            ring), never against MRR managed.
          </li>
          <li>
            Goals are stored per month and <strong>carry forward</strong> — a month without an
            explicit goal inherits the latest earlier one.
          </li>
          <li>
            An admin who has client assignments but no roster row shows up as an{" "}
            <em>unrostered assignee</em> notice so they can be added.
          </li>
        </ul>
      </Section>

      {/* Monthly re-bill tracker */}
      <Section icon={Gauge} title="The monthly re-bill tracker">
        <p>
          Member cards, the hub home, and the team-level &ldquo;Re-billed&rdquo; KPI tile all
          show the same tracker for the current business month. Anatomy:
        </p>

        {/* Tracker anatomy mock — classes come from MONTHLY_REBILL_META */}
        <div className="mt-3 rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Re-bills · July
            </span>
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
              $41,200{" "}
              <span className="text-[11px] font-semibold text-muted-foreground">
                collected · 66% of MRR · 55% of goal
              </span>
            </span>
          </div>
          <div className="mt-1.5 flex h-2 gap-0.5 rounded-full bg-muted overflow-hidden">
            <span className={cn("h-full w-[46%]", MONTHLY_REBILL_META.collected.bar)} />
            <span className={cn("h-full w-[14%]", MONTHLY_REBILL_META.sent.bar)} />
            <span className={cn("h-full w-[10%]", MONTHLY_REBILL_META.due.bar)} />
            <span className={cn("h-full w-[6%]", MONTHLY_REBILL_META.overdue.bar)} />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2 flex-wrap text-[11px]">
            <p>
              <span className={cn("font-semibold", MONTHLY_REBILL_META.collected.text)}>6 collected</span>
              <span className="text-muted-foreground/50"> · </span>
              <span className={cn("font-semibold", MONTHLY_REBILL_META.sent.text)}>2 sent</span>
              <span className="text-muted-foreground/50"> · </span>
              <span className={cn("font-semibold", MONTHLY_REBILL_META.due.text)}>1 due</span>
              <span className="text-muted-foreground/50"> · </span>
              <span className={cn("font-semibold", MONTHLY_REBILL_META.overdue.text)}>1 overdue</span>
              <span className="text-muted-foreground/50"> · </span>
              <span className={cn("font-semibold", MONTHLY_REBILL_META.scheduled.text)}>2 upcoming</span>
            </p>
            <span className="font-semibold text-muted-foreground">
              Retention <span className="font-bold text-foreground">50%</span> (6/12)
            </span>
          </div>
        </div>

        <p className="mt-4">
          Every attributed client lands in <strong>exactly one bucket</strong>, checked top to
          bottom — first match wins — so bucket MRR always sums exactly to MRR managed and the
          bar can never overflow:
        </p>

        {/* Bucket decision flow */}
        <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5 text-xs">
          <BucketRow bucket="untracked" cond="PepAds (manually billed), paused, or unscheduled — no computed cycle" />
          <BucketRow bucket="collected" cond="A qualifying REBILL-flagged payout was recorded in the Payout DB THIS month" />
          <BucketRow bucket="sent" cond="Re-bill invoice sent for the current cycle, awaiting the payout" />
          <BucketRow bucket="overdue" cond="Past the re-bill date, nothing landed" />
          <BucketRow bucket="due" cond="Inside the lead window, not yet billed" />
          <BucketRow bucket="scheduled" cond="Bill lands later in the cycle (upcoming / extended)" />
        </div>

        <ul className="mt-3 space-y-2">
          <li>
            <strong>Collected is month-scoped</strong> — deliberately stricter than the Client
            Directory&rsquo;s green <em>Paid</em> chip, which stays on for the whole billing
            cycle. A June payment whose cycle covers into July does <em>not</em> count as
            collected for July; the tracker starts each month near zero and fills as payouts
            land.
          </li>
          <li>
            Fully <strong>reactive</strong>: a payout recorded on the Closers page or an
            invoice sent from the Client Directory moves a segment on the next load. Nothing
            is entered on the Team page.
          </li>
          <li>
            <strong>Two headline modes</strong> (the bar is always bucket-based):
          </li>
        </ul>

        {/* Headline modes comparison */}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
            <div className="text-xs font-bold text-foreground">
              Head of Ads · Media Buyer · CSM
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Headline = Σ MRR of <em>their clients</em> in the Collected bucket — shown as
              &ldquo;collected&rdquo;. Percentages vs their MRR managed and their goal.
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
            <div className="text-xs font-bold text-foreground">
              Entire book (COO) &amp; team KPI tile
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Headline = Σ of the month&rsquo;s <strong>REBILL-flagged payout rows</strong>{" "}
              across the whole Payout DB — including brands without a directory client and
              manually-billed PepAds, but never unflagged one-off payments. Shown as
              &ldquo;re-billed · all book&rdquo;; can exceed 100% of book MRR, and every
              Entire-book member shows the same total (the drill notes it&rsquo;s not
              additive).
            </div>
          </div>
        </div>
      </Section>

      {/* Retention */}
      <Section icon={Percent} title="Retention">
        <p>
          Retention answers &ldquo;how much of my book re-billed this month?&rdquo; — the
          Collected bucket&rsquo;s <em>client count</em> over the member&rsquo;s{" "}
          <strong>total clients managed</strong>:
        </p>
        {/* Formula visual */}
        <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center justify-center gap-2.5 text-xs font-semibold flex-wrap">
            <span className={cn("rounded-md bg-card border border-border/60 px-3 py-2", MONTHLY_REBILL_META.collected.text)}>
              Clients collected this month · 6
            </span>
            <span className="text-lg font-black text-muted-foreground">÷</span>
            <span className="rounded-md bg-card border border-border/60 px-3 py-2 text-foreground">
              Total clients managed · 12
            </span>
            <span className="text-lg font-black text-muted-foreground">=</span>
            <span className="rounded-md bg-card border border-border/60 px-3 py-2 font-black text-foreground">
              50%
            </span>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Derived from the same buckets as the tracker bar — the chip and its drill-down can
            never disagree.
          </p>
        </div>
        <ul className="mt-3 space-y-2">
          <li>
            It <strong>fills toward 100%</strong> as the month&rsquo;s payouts land — low
            numbers early in the month are normal, which is why the chip carries no alarm
            color.
          </li>
          <li>
            The denominator is the <em>whole</em> book, so PepAds / paused / unscheduled
            clients (which can never enter the Collected bucket) cap the ceiling — the
            Retention drill-down lists them separately so the gap is explainable.
          </li>
          <li>
            Shown in the tracker footer on member cards + hub home, and as a{" "}
            <strong>Retention</strong> chip in the hub header.
          </li>
        </ul>
      </Section>

      {/* Header drilldowns */}
      <Section icon={MousePointerClick} title="Hub header chips drill down">
        <p>
          Every metric chip in a hub&rsquo;s header is clickable and expands an inline panel
          below the strip (click again to collapse; each panel links to its full tab):
        </p>
        <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5 text-xs">
          <FlowRow from="Tasks / Pending / Done / Overdue" tool="task lists" note="rows open the task detail sheet" />
          <FlowRow from="Clients" tool="client list" note="MRR + live re-bill status chip; rows open the client page" />
          <FlowRow from="Retention" tool="two groups" note="Re-billed this month vs Not yet re-billed (+ untracked note)" />
          <FlowRow from="Unsolved" tool="inbox list" note="rows open the linked task" />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The Retention drill uses the same bucket classifier as the chip, so its group counts
          always sum to the chip&rsquo;s ratio.
        </p>
      </Section>

      {/* Tasks */}
      <Section icon={KanbanSquare} title="Tasks">
        <p>
          Tasks are assigned to <strong>one individual admin</strong> — never a team. They show
          as a list or a drag-and-drop board with four lanes:
        </p>
        {/* Board visual */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TASK_STATUS_ORDER.map((s) => (
            <div key={s} className="rounded-lg border border-border/60 bg-muted/30 p-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  TASK_STATUS_META[s].chip
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", TASK_STATUS_META[s].dot)} />
                {TASK_STATUS_META[s].label}
              </span>
              <div className="mt-2 space-y-1.5">
                <div className="h-6 rounded-md bg-card border border-border/50" />
                {s !== "complete" && <div className="h-6 rounded-md bg-card border border-border/50" />}
              </div>
            </div>
          ))}
        </div>
        <ul className="mt-3 space-y-2">
          <li>
            <strong>Priorities:</strong>{" "}
            <span className="inline-flex flex-wrap gap-1.5 align-middle">
              {TASK_PRIORITY_ORDER.map((p) => (
                <span
                  key={p}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    TASK_PRIORITY_META[p].chip
                  )}
                >
                  {TASK_PRIORITY_META[p].label}
                </span>
              ))}
            </span>
          </li>
          <li>
            Optional extras: a <strong>client tag</strong>, a <strong>due date</strong>, a{" "}
            <strong>checklist</strong>, and a <Pill>Lineup</Pill> pin for the member&rsquo;s
            current focus list.
          </li>
          <li>
            Board order is computed <strong>server-side</strong> when you drop a card — two
            people dragging at once converge instead of overwriting each other.
          </li>
          <li>
            Each task has a <strong>comment trail</strong> that also records{" "}
            <em>activity rows</em> automatically (status moves, action-item solves,
            reassignments, tags, attachments) — a muted timeline in the task detail view.
          </li>
          <li>
            <strong>Attachments:</strong> PDFs up to 10&nbsp;MB attach from the task detail
            view (stored in the database, so they survive deploys). Removing one is recorded
            on the trail. Attachments move with the task on reassignment — but deleting the
            task (or its owner&rsquo;s admin account) deletes them too.
          </li>
          <li>
            <strong>Tagging teammates:</strong> the detail view&rsquo;s <em>Tagged</em> row
            loops in another roster member without transferring ownership. The tagged member
            is notified in their hub — the task appears under their <Pill>Tagged</Pill> tab
            (badge = open tagged tasks) until it completes or they dismiss the tag. Tags are
            a heads-up, not ownership: the assignee keeps the task, and a tagged member can
            always remove <em>their own</em> tag.
          </li>
        </ul>
      </Section>

      {/* Action items */}
      <Section icon={Inbox} title="Action items">
        <p>
          Action items are the member&rsquo;s <strong>inbox</strong>: reports routed to exactly
          one person, each carrying a source label:
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(SOURCE_META) as (keyof typeof SOURCE_META)[]).map((s) => (
            <span
              key={s}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                SOURCE_META[s].chip
              )}
            >
              {SOURCE_META[s].symbol} {SOURCE_META[s].label}
            </span>
          ))}
        </div>
        <ul className="mt-3 space-y-2">
          <li>
            <Pill>Slack</Pill> and <Pill>Dashboard</Pill> are labels only — Slack items arrive
            via the external API relay (see the agent section below), not a direct integration.
          </li>
          <li>
            Creating an action item <strong>always auto-creates a linked task</strong> on the
            member&rsquo;s board, so the inbox never diverges from the work.
          </li>
          <li>
            An item is either <strong>Unsolved</strong> or <strong>Solved</strong>. Progress
            in-between (&ldquo;in motion&rdquo;) lives on the linked task&rsquo;s status.
          </li>
          <li>
            Deleting an item keeps its task; deleting a task keeps its item (the link is
            detached).
          </li>
        </ul>
      </Section>

      {/* Two-way sync */}
      <Section icon={RefreshCcw} title="The two-way sync">
        {/* Sync visual */}
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center justify-center gap-3 text-xs font-semibold flex-wrap">
            <span className="rounded-md bg-card border border-border/60 px-3 py-2">
              Action item <span className="text-muted-foreground">solved</span>
            </span>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="rounded-md bg-card border border-border/60 px-3 py-2">
              Linked task{" "}
              <span className={cn("rounded-full px-1.5 py-0.5", TASK_STATUS_META.complete.chip)}>
                Complete
              </span>
            </span>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Solving one side updates the other, atomically — in both directions.
          </p>
        </div>
        <ul className="mt-3 space-y-2">
          <li>
            <strong>Solve an item</strong> → its task is marked Complete.{" "}
            <strong>Complete a task</strong> → its item is solved (recorded as solved{" "}
            <em>by the task</em>).
          </li>
          <li>
            <strong>Reopening a task</strong> only un-solves items the task itself solved. A
            human&rsquo;s explicit <em>Mark Solved</em> is never reverted by a task edit.
          </li>
          <li>Every sync flip is recorded as an activity row on the task&rsquo;s timeline.</li>
        </ul>
      </Section>

      {/* Reassignment */}
      <Section icon={Send} title="Reassignment — moving work between hubs">
        <p>
          Work that landed in the wrong hub can be forwarded to the correct member. Ownership
          transfers <strong>fully and atomically</strong> — the task and its linked action
          item always move together, in one database batch:
        </p>

        {/* Transfer flow visual */}
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center justify-center gap-3 text-xs font-semibold flex-wrap">
            <div className="rounded-md bg-card border border-border/60 px-3 py-2 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Hub · Roxana
              </div>
              <div className="mt-1 space-y-1">
                <div className="rounded bg-muted/60 px-2 py-1">▣ Task</div>
                <div className="rounded bg-muted/60 px-2 py-1">⚡ Linked item</div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <ArrowRight className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-bold text-primary">one atomic batch</span>
            </div>
            <div className="rounded-md bg-card border border-primary/50 px-3 py-2 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Hub · Sam
              </div>
              <div className="mt-1 space-y-1">
                <div className="rounded bg-muted/60 px-2 py-1">▣ Task → bottom of its lane</div>
                <div className="rounded bg-muted/60 px-2 py-1">⚡ Item → Sam&rsquo;s inbox</div>
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            The activity trail records &ldquo;Reassigned to Sam — by Roxana&rdquo;; the
            previous owner loses access.
          </p>
        </div>

        <ul className="mt-3 space-y-2">
          <li>
            <strong>Who can:</strong> the <em>current assignee</em> can forward their own work
            anywhere on the roster (that&rsquo;s the point — misrouted work escapes); admins
            with the <Pill>admin</Pill> permission can reassign anyone&rsquo;s.
          </li>
          <li>
            <strong>How:</strong> the task sheet&rsquo;s <em>Assignee</em> select, or the{" "}
            <em>Forward to…</em> picker on an action-item card. Both confirm before moving —
            and the task confirm takes an <strong>optional handoff note</strong> that lands
            on the trail as a comment from you, so the new owner sees <em>why</em> it arrived.
          </li>
          <li>
            <strong>Multiple recipients:</strong> the task confirm also offers{" "}
            <em>Also tag</em> checkboxes — ownership stays with the <strong>one</strong> new
            assignee (a task never has two owners), and everyone checked is{" "}
            <strong>tagged</strong> instead, so the task lands in each of their hubs&rsquo;{" "}
            <Pill>Tagged</Pill> tabs in the same action. Tag the <em>previous</em> assignee to
            keep them looped in on work they handed off. If the new assignee was already
            tagged on the task, that tag is <strong>removed automatically</strong> — an
            assignee is never tagged on their own task.
          </li>
          <li>
            <strong>Handoff note timing:</strong> the note is posted whenever the action did
            something — an ownership transfer <em>or</em> at least one new tag. A call that
            changes nothing (same owner, no new tags) drops it. A failed reassign keeps the
            dialog open, so the typed note and checked tags survive for a retry.
          </li>
          <li>
            <strong>Targets:</strong> Team roster members only — an unrostered admin&rsquo;s
            hub would be unreachable from this page.
          </li>
          <li>
            <strong>Not reassignable:</strong> sweep-generated work (&ldquo;by System&rdquo;) —
            the sweep creates and auto-solves it per member, so forwarding would duplicate it.
            Agent-created work that merely wears the <Pill>System</Pill> source label
            (&ldquo;by api:&hellip;&rdquo;) forwards normally.
          </li>
          <li>
            <strong>Over the API/MCP:</strong>{" "}
            <code className="rounded bg-muted px-1 text-xs">PATCH {"{ reassignTo: <adminId> }"}</code>{" "}
            on updateTeamTask / updateTeamActionItem (exclusive shape — other fields are
            ignored; tasks additionally take{" "}
            <code className="rounded bg-muted px-1 text-xs">alsoTag</code> +{" "}
            <code className="rounded bg-muted px-1 text-xs">comment</code>). An{" "}
            <code className="rounded bg-muted px-1 text-xs">adminId</code> echoed back in an
            update body is inert. Reassigning a task to the <em>current</em> owner is a{" "}
            <strong>share-without-transfer</strong>: ownership is untouched (no reassign
            activity/audit) but <code className="rounded bg-muted px-1 text-xs">alsoTag</code>{" "}
            members are still tagged — without alsoTag it&rsquo;s a pure idempotent no-op.
          </li>
          <li>
            <strong>Caution:</strong> deleting an admin deletes their hub&rsquo;s tasks and
            action items, <em>including forwarded ones</em> — reassign work out of a hub
            before deleting the account.
          </li>
        </ul>
      </Section>

      {/* System sweep */}
      <Section icon={Radar} title="System sweep">
        <p>
          On load (at most every 5 minutes), the hub audits the Directory: an{" "}
          <strong>active client with no team assigned at all</strong> raises a{" "}
          <Pill>System</Pill> action item + task for every <em>Entire book</em> member. Items
          are de-duplicated, so the same condition never piles up. When the condition clears
          (team assigned, client paused/removed), the sweep auto-solves the item — and if a
          human dismissed it early, that dismissal holds until the condition actually clears.
        </p>
        <p className="mt-2">
          Note the <Pill>System</Pill> label appears on two different kinds of work:
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
            <div className="text-xs font-bold text-foreground">Sweep-generated · &ldquo;by System&rdquo;</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Created by the sweep itself. De-dup keyed, auto-solved when the condition
              clears, <strong>not reassignable</strong> — it resolves by fixing the underlying
              condition, not by working the task.
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
            <div className="text-xs font-bold text-foreground">Agent-created · &ldquo;by api:&hellip;&rdquo;</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Filed by the external agent with the <em>system</em> source label (styling
              only). Ordinary work: solvable, editable, and <strong>fully reassignable</strong>.
            </div>
          </div>
        </div>
      </Section>

      {/* CSM auto-split */}
      <Section icon={Split} title="CSM auto-split">
        <p>
          &ldquo;Auto-split book&rdquo; assigns every active client that has no CSM across the{" "}
          <em>CSM-attribution</em> members — proportional to each member&rsquo;s{" "}
          <strong>Split&nbsp;%</strong> (set in the roster dialog; empty = equal share, 0 = opted
          out), balancing by MRR. It always shows a <strong>preview first</strong>; nothing is
          written until you confirm. The result is ordinary Directory team assignments you can
          adjust by hand afterwards — from the client row or from the CSM&rsquo;s hub.
        </p>
      </Section>

      {/* Agent / API workflow */}
      <Section icon={Bot} title="Feeding the hub from outside (API / MCP agent)">
        <p>
          The Team hub is exposed on the external API under the <Pill>team</Pill> scope
          (19&nbsp;operations, one MCP tool each). This is how an agent relays client follow-up
          reports — e.g. a daily Slack sweep — into members&rsquo; inboxes.
        </p>

        <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Daily report → hub, per item
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            <FlowRow from="NEW item" tool="createTeamActionItem" note="creates the item + linked task" />
            <FlowRow from="SOLVED" tool="updateTeamActionItem" note='{ status: "solved" } — completes the task too' />
            <FlowRow from="IN MOTION" tool="updateTeamTask" note='{ status: "in_progress" } on the linked task' />
            <FlowRow from="Aging update" tool="createTeamTaskComment" note='"still unsolved, day 3" on the task trail' />
            <FlowRow from="MISROUTED" tool="updateTeamActionItem" note='{ reassignTo: "<adminId>" } — moves item + task to the right hub' />
            <FlowRow from="Loop someone in" tool="createTeamTaskTag" note='{ adminId } — task lands in their hub&#39;s Tagged tab' />
            <FlowRow from="Evidence file" tool="uploadTeamTaskDocument" note="{ fileBase64, fileName } — PDF ≤10 MB on the task" />
            <FlowRow from="UNSOLVED" tool="—" note="leave the existing item open (no call)" />
          </div>
        </div>

        <p className="mt-3">
          <strong>Creating an item</strong> — <code className="rounded bg-muted px-1 text-xs">POST /api/v1/team/action-items</code>:
        </p>
        <Schema>{`{
  "adminId": "…",                    // routed member (one individual) — required
  "body": "Client asked how to track the ads — 3rd time, unanswered.",
  "clientId": "…",                   // optional client tag
  "sourceType": "slack",             // slack | dashboard | system
  "sourceChannel": "#elite-bio-peptides",
  "authorLabel": "Follow-up sweep",
  "externalTs": "2026-07-12T09:42:00-07:00",
  "taskTitle": "Answer ad-tracking question",   // optional (default: body head)
  "dueDate": "2026-07-13",           // linked task due date
  "priority": "urgent"               // urgent | high | normal | low
}`}</Schema>
        <p className="mt-2">
          The response includes the item&rsquo;s <code className="rounded bg-muted px-1 text-xs">id</code>{" "}
          and the linked <code className="rounded bg-muted px-1 text-xs">taskId</code> — keep
          both for follow-ups.
        </p>

        <p className="mt-3">
          <strong>Reassigning</strong> —{" "}
          <code className="rounded bg-muted px-1 text-xs">PATCH /api/v1/team/tasks/&#123;id&#125;</code>{" "}
          or <code className="rounded bg-muted px-1 text-xs">/team/action-items/&#123;id&#125;</code>:
        </p>
        <Schema>{`{
  "reassignTo": "…",  // roster member admin id — EXCLUSIVE shape:
                      // other fields in the same body are ignored.
                      // adminId echoed from a GET is inert — safe to send.
                      // = current owner → share-without-transfer: ownership
                      // untouched, alsoTag members still get tagged.
  "alsoTag": ["…"],   // tasks only, optional: MORE roster members to reach —
                      // they're TAGGED (not co-owners); ownership stays single.
                      // A stale tag on the new assignee is auto-removed.
  "comment": "…"      // tasks only, optional: handoff note posted to the
                      // task's trail — lands when the call transferred
                      // ownership OR added a new tag (pure no-op drops it)
}`}</Schema>
        <p className="mt-3">
          <strong>Tags &amp; attachments</strong> —{" "}
          <code className="rounded bg-muted px-1 text-xs">getTeamTask</code> returns both
          (<code className="rounded bg-muted px-1 text-xs">tags</code>,{" "}
          <code className="rounded bg-muted px-1 text-xs">documents</code> metadata);{" "}
          <code className="rounded bg-muted px-1 text-xs">listTeamTasks?taggedAdminId=</code>{" "}
          lists a member&rsquo;s Tagged section. Tag/untag via{" "}
          <code className="rounded bg-muted px-1 text-xs">POST /team/tasks/&#123;id&#125;/tags</code>{" "}
          / <code className="rounded bg-muted px-1 text-xs">DELETE …/tags/&#123;adminId&#125;</code>;
          PDF bytes via{" "}
          <code className="rounded bg-muted px-1 text-xs">…/documents/&#123;documentId&#125;?format=base64</code>.
        </p>

        <ul className="mt-3 space-y-2">
          <li>
            <strong>De-duplicate before creating.</strong> There is no idempotency key on the
            API path — the agent must list open items (
            <code className="rounded bg-muted px-1 text-xs">GET /team/action-items?status=unsolved</code>
            ) and match by client + body/timestamp, creating only what&rsquo;s genuinely new.
          </li>
          <li>
            <strong>Resolving people and clients:</strong>{" "}
            <code className="rounded bg-muted px-1 text-xs">listTeamMembers</code> for rostered
            members, <code className="rounded bg-muted px-1 text-xs">getTeamOptions</code> (client
            scope) for any admin id, <code className="rounded bg-muted px-1 text-xs">listClients?search=</code>{" "}
            for client ids. An unknown client is fine — <em>clientId is optional</em>.
          </li>
          <li>
            <strong>Token scopes:</strong> <Pill>team: write</Pill> to ingest,{" "}
            <Pill>client: read</Pill> to resolve names. API solves count as human solves — they
            survive task reopens.
          </li>
          <li>
            All mutations are audit-logged as{" "}
            <code className="rounded bg-muted px-1 text-xs">api:&lt;token name&gt;</code>; money
            is integer cents; dates are <code className="rounded bg-muted px-1 text-xs">yyyy-mm-dd</code>{" "}
            in US&nbsp;Pacific.
          </li>
        </ul>
      </Section>

      <p className="text-xs text-muted-foreground">
        Full API reference (all 19 team operations with schemas): <strong>Dashboard → API
        Docs</strong>, or <code className="rounded bg-muted px-1">GET /api/v1/openapi.json</code>.
        MCP endpoint for agents: <code className="rounded bg-muted px-1">/api/mcp/mcp</code>.
      </p>
    </div>
  );
}

/* ── local presentational helpers (AdAccountsGuide idiom) ────────────────── */

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-base font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
      {children}
    </span>
  );
}

function Schema({ children }: { children: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-3 text-[11px] leading-relaxed text-foreground">
      {children}
    </pre>
  );
}

function FlowRow({ from, tool, note }: { from: string; tool: string; note: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-28 shrink-0 font-semibold text-foreground">{from}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <code className="rounded bg-card border border-border/50 px-1.5 py-0.5 font-semibold">
        {tool}
      </code>
      <span className="text-muted-foreground">{note}</span>
    </div>
  );
}

/** One row of the bucket decision flow — condition → bucket chip. */
function BucketRow({ bucket, cond }: { bucket: MonthlyRebillBucket; cond: string }) {
  const meta = MONTHLY_REBILL_META[bucket];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="flex-1 min-w-[220px] text-muted-foreground">{cond}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-card border border-border/60 px-2 py-0.5 font-semibold", meta.text)}>
        {meta.bar && <span className={cn("h-2 w-2 rounded-full", meta.bar)} />}
        {meta.label}
      </span>
    </div>
  );
}
