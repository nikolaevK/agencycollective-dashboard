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
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, BadgeDot, StatusBadge, badgeVariants, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
 * live UI uses (labels + status tones), so they can't drift. No data fetches —
 * purely explanatory. Keep in sync with lib/teamHub.ts / teamRebill.ts /
 * teamTasks.ts / teamActionItems.ts and the v1 team surface.
 */
export function TeamGuide() {
  return (
    <div className="max-w-4xl space-y-4 text-sm leading-relaxed text-foreground">
      {/* Intro */}
      <p className="text-muted-foreground">
        The <strong className="font-semibold text-foreground">Team hub</strong> gives every team member one
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
            <strong>Every admin</strong> can open this page and view + manage{" "}
            <strong>their own hub</strong> (tasks, action items, comments).
          </li>
          <li>
            The overview shows <strong>only the cards you can open</strong>. Members without the{" "}
            <Pill>admin</Pill> permission who aren&rsquo;t a Head of Ads (e.g. media buyers)
            see just their own card — no other members, no book-wide metric cards. If
            they&rsquo;re not on the roster yet, the page says so.
          </li>
          <li>
            Opening <strong>another member&rsquo;s hub</strong>, managing the roster and goals,
            and running the CSM auto-split require the <Pill>admin</Pill> permission (or super
            admin). There is no separate &ldquo;team&rdquo; permission.
          </li>
          <li>
            <strong>Head of Ads manages their book.</strong> A roster member with the{" "}
            <em>Head of Ads (lead)</em> attribution can open the hubs of members in{" "}
            <strong>their own workspace(s)</strong> — view and manage their tasks, action
            items, comments, attachments, tags, and set their monthly goals — without the{" "}
            <Pill>admin</Pill> permission and without seeing any other book. Roster
            add/remove and the CSM auto-split stay privileged-only.
          </li>
          <li>
            Tasks and action items belonging to someone else read as{" "}
            <em>not found</em> for non-privileged admins — ids are never leaked.
          </li>
          <li>
            Every member can <strong>forward their own</strong> tasks and action items to
            another roster member — see <em>Reassignment</em> below.
          </li>
          <li>
            <strong>Workspaces (books).</strong> Admins assigned to a separate Client
            Directory workspace only see the team members, client rollups, and pickers of
            their own book(s); the whole-book re-billed headline is suppressed for
            external partner scopes. Supers and Admin Management see every book. An
            internal admin serving a partner book needs BOTH books in their workspace
            list (Admins page → Edit Admin) — otherwise assigned partner clients won&rsquo;t
            appear in their own hub view.
          </li>
        </ul>
      </Section>

      {/* Roster & attribution */}
      <Section icon={Users} title="Roster, attribution & goals">
        <p>
          The roster is manual: each member is an admin with a free-text position and an{" "}
          <strong>attribution</strong> that decides which clients count as theirs:
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(ATTRIBUTION_LABEL) as TeamAttribution[]).map((a) => (
            <InfoTile key={a} title={ATTRIBUTION_LABEL[a]}>
              {a === "book" && "The whole active book — every active client (COO view)."}
              {a === "lead" && "Clients where this admin is assigned as Head of Ads in the Directory."}
              {a === "media_buyer" && "Clients where this admin is the assigned Media Buyer."}
              {a === "csm" && "Clients where this admin is the assigned CSM. Auto-split eligible."}
            </InfoTile>
          ))}
        </div>
        <ul className="space-y-2">
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
          Member cards and the hub home show the same tracker for the current business month
          (the team-level &ldquo;Re-billed&rdquo; metric card shows its headline). Anatomy:
        </p>

        {/* Tracker anatomy mock — bar fills + legend tones come from MONTHLY_REBILL_META */}
        <div className="rounded-2xl p-4 ring-1 ring-foreground/5 dark:ring-foreground/10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Re-bills · July</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              $41,200{" "}
              <span className="text-xs font-normal text-muted-foreground">
                collected · 46% of MRR · 55% of goal
              </span>
            </span>
          </div>
          <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-muted">
            <span className={cn("h-full w-[46%]", MONTHLY_REBILL_META.collected.bar)} />
            <span className={cn("h-full w-[14%]", MONTHLY_REBILL_META.sent.bar)} />
            <span className={cn("h-full w-[10%]", MONTHLY_REBILL_META.due.bar)} />
            <span className={cn("h-full w-[6%]", MONTHLY_REBILL_META.overdue.bar)} />
          </div>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              <LegendItem bucket="collected" count={6} />
              <LegendItem bucket="sent" count={2} />
              <LegendItem bucket="due" count={1} />
              <LegendItem bucket="overdue" count={1} />
              <LegendItem bucket="scheduled" count={2} />
            </p>
            <span className="text-muted-foreground">
              Retention <span className="font-medium tabular-nums text-foreground">50%</span> (6/12)
            </span>
          </div>
        </div>

        <p>
          Every attributed client lands in <strong>exactly one bucket</strong>, checked top to
          bottom — first match wins — so bucket MRR always sums exactly to MRR managed and the
          bar can never overflow:
        </p>

        {/* Bucket decision flow */}
        <div className="space-y-2 rounded-2xl bg-muted/40 p-4 text-xs">
          <BucketRow bucket="untracked" cond="PepAds (manually billed), paused, or unscheduled — no computed cycle" />
          <BucketRow bucket="collected" cond="A qualifying REBILL-flagged payout was recorded in the Payout DB THIS month" />
          <BucketRow bucket="sent" cond="Re-bill invoice sent for the current cycle, awaiting the payout" />
          <BucketRow bucket="overdue" cond="Past the re-bill date, nothing landed" />
          <BucketRow bucket="due" cond="Inside the lead window, not yet billed" />
          <BucketRow bucket="scheduled" cond="Bill lands later in the cycle (upcoming / extended)" />
        </div>

        <ul className="space-y-2">
          <li>
            <strong>Collected is month-scoped</strong> — deliberately stricter than the Client
            Directory&rsquo;s <Pill tone="success">Paid</Pill> chip, which stays on for the whole
            billing cycle. A June payment whose cycle covers into July does <em>not</em> count as
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
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoTile title="Head of Ads · Media Buyer · CSM">
            Headline = Σ MRR of <em>their clients</em> in the Collected bucket — shown as
            &ldquo;collected&rdquo;. Percentages vs their MRR managed and their goal.
          </InfoTile>
          <InfoTile title={<>Entire book (COO) &amp; team Re-billed card</>}>
            Headline = Σ of the month&rsquo;s <strong>REBILL-flagged payout rows</strong>{" "}
            across the whole Payout DB — including brands without a directory client and
            manually-billed PepAds, but never unflagged one-off payments. Shown as
            &ldquo;re-billed · all book&rdquo;; can exceed 100% of book MRR, and every
            Entire-book member shows the same total (the drill notes it&rsquo;s not
            additive).
          </InfoTile>
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
        <div className="rounded-2xl bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs font-medium text-foreground">
            <span className={cn(TILE, "inline-flex items-center gap-1.5")}>
              <BadgeDot tone={MONTHLY_REBILL_META.collected.tone} />
              Clients collected this month · 6
            </span>
            <span className="text-base text-muted-foreground">÷</span>
            <span className={TILE}>Total clients managed · 12</span>
            <span className="text-base text-muted-foreground">=</span>
            <span className={cn(TILE, "font-semibold tabular-nums")}>50%</span>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Derived from the same buckets as the tracker bar — the card and its drill-down can
            never disagree.
          </p>
        </div>
        <ul className="space-y-2">
          <li>
            It <strong>fills toward 100%</strong> as the month&rsquo;s payouts land — low
            numbers early in the month are normal, which is why the card carries no alarm
            color.
          </li>
          <li>
            The denominator is the <em>whole</em> book, so PepAds / paused / unscheduled
            clients (which can never enter the Collected bucket) cap the ceiling — the
            Retention drill-down lists them separately so the gap is explainable.
          </li>
          <li>
            Shown in the tracker footer on member cards + hub home, and as a{" "}
            <strong>Retention</strong> card in the hub header.
          </li>
        </ul>
      </Section>

      {/* Header drilldowns */}
      <Section icon={MousePointerClick} title="Metric cards drill down">
        <p>
          Metric cards on the Team overview and in a hub&rsquo;s header expand an inline panel
          below the cards (click again to collapse; hub panels link to their full tab). The
          overview&rsquo;s cards break their number down <em>by member</em> (Book MRR, Re-billed,
          Tasks due, Overdue, Action items) or list the clients behind it (Rebills in the window,
          Client health); its Tasks Completed card is a trend only. In a hub:
        </p>
        <div className="space-y-2 rounded-2xl bg-muted/40 p-4 text-xs">
          <FlowRow from="Task cards" tool="task lists" note="All / Open / Completed / Overdue — rows open the task detail sheet" />
          <FlowRow from="MRR managed" tool="client list" note="MRR + live re-bill status chip; rows open the client page" />
          <FlowRow from="Re-billed / Retention" tool="two groups" note="Re-billed this month vs Not yet re-billed (+ untracked note)" />
          <FlowRow from="Action items" tool="inbox list" note="rows open the linked task" />
        </div>
        <p className="text-xs">
          The Retention drill uses the same bucket classifier as the card, so its group counts
          always sum to the card&rsquo;s ratio.
        </p>
      </Section>

      {/* Trends */}
      <Section icon={TrendingUp} title="Trend lines & Insights">
        <p>
          Cards and charts with a line read a read-only history — it never changes a money
          headline (the overview&rsquo;s Tasks Completed card, this week&rsquo;s count, is the
          only number taken from it):
        </p>
        <ul className="space-y-2">
          <li>
            <strong>Re-billed per month</strong> — 12 months of <Pill tone="neutral">REBILL</Pill>{" "}
            payouts. Entire-book members (and the overview when it shows the whole book) use the
            whole Payout DB, so the current month equals the headline; everyone else sums the
            payouts of the clients attributed to them <em>today</em>. The current month is still
            filling, so its bar sits low until the month&rsquo;s payouts land.
          </li>
          <li>
            <strong>Billed per month</strong> (under Book MRR / MRR managed) — MRR itself has no
            history (it&rsquo;s each client&rsquo;s latest payout month, read live), so like the
            Client Directory&rsquo;s MRR card the line shows what those clients were billed each
            month (all payouts). The current month is still filling.
          </li>
          <li>
            <strong>Goal line</strong> — a member&rsquo;s own monthly goal (carried forward like
            the hub&rsquo;s goal), on member cards and in the hub. The team-level card and the
            Insights chart draw none: goals overlap (an Entire-book
            member&rsquo;s goal covers everyone&rsquo;s clients), so they don&rsquo;t add up to a
            team goal.
          </li>
          <li>
            <strong>Tasks completed / created per week</strong> — 12 Monday–Sunday weeks on the
            business calendar, by <Code>completed_at</Code> / <Code>created_at</Code>. Tasks count
            for their <em>current</em> owner, so a reassigned task moves its history with it;
            deleted tasks drop out.
          </li>
        </ul>
        <p>
          The overview&rsquo;s <strong>Insights</strong> tab adds re-bill collection by member
          (the tracker&rsquo;s bar per person), workload (open tasks by urgency), MRR managed by
          member and client health across the book. It follows the workspace filter and the same
          visibility rules as the cards; self-only viewers don&rsquo;t get it.
        </p>
      </Section>

      {/* Tasks */}
      <Section icon={KanbanSquare} title="Tasks">
        <p>
          Tasks are assigned to <strong>one individual admin</strong> — never a team. They show
          as a list or a drag-and-drop board with four lanes:
        </p>
        {/* Board visual */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TASK_STATUS_ORDER.map((s) => (
            <div key={s} className="rounded-2xl bg-muted/40 p-3">
              <StatusBadge tone={TASK_STATUS_META[s].tone}>{TASK_STATUS_META[s].label}</StatusBadge>
              <div className="mt-2 space-y-1.5">
                <div className="h-6 rounded-lg bg-card ring-1 ring-foreground/5 dark:ring-foreground/10" />
                {s !== "complete" && (
                  <div className="h-6 rounded-lg bg-card ring-1 ring-foreground/5 dark:ring-foreground/10" />
                )}
              </div>
            </div>
          ))}
        </div>
        <ul className="space-y-2">
          <li>
            <strong>Priorities:</strong>{" "}
            <span className="inline-flex flex-wrap gap-1.5 align-middle">
              {TASK_PRIORITY_ORDER.map((p) => (
                <Pill key={p} tone={TASK_PRIORITY_META[p].tone}>
                  {TASK_PRIORITY_META[p].label}
                </Pill>
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
        {/* Sources are categories → neutral outline badges with their icon */}
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(SOURCE_META) as (keyof typeof SOURCE_META)[]).map((s) => {
            const SourceIcon = SOURCE_META[s].icon;
            return (
              <Badge key={s} variant="outline" className="gap-1.5">
                <SourceIcon className="text-muted-foreground" />
                {SOURCE_META[s].label}
              </Badge>
            );
          })}
        </div>
        <ul className="space-y-2">
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
        <div className="rounded-2xl bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-foreground">
            <span className={TILE}>
              Action item <span className="text-muted-foreground">solved</span>
            </span>
            <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn(TILE, "inline-flex items-center gap-1.5")}>
              Linked task{" "}
              <Pill tone={TASK_STATUS_META.complete.tone}>Complete</Pill>
            </span>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Solving one side updates the other, atomically — in both directions.
          </p>
        </div>
        <ul className="space-y-2">
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
        <div className="rounded-2xl bg-muted/40 p-4">
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-foreground">
            <HubTile name="Roxana">
              <HubTileRow icon={KanbanSquare}>Task</HubTileRow>
              <HubTileRow icon={Inbox}>Linked item</HubTileRow>
            </HubTile>
            <div className="flex shrink-0 flex-col items-center gap-0.5 text-muted-foreground">
              <ArrowRight className="size-4" />
              <span className="text-xs font-normal">one atomic batch</span>
            </div>
            <HubTile name="Sam">
              <HubTileRow icon={KanbanSquare}>Task → bottom of its lane</HubTileRow>
              <HubTileRow icon={Inbox}>Item → Sam&rsquo;s inbox</HubTileRow>
            </HubTile>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            The activity trail records &ldquo;Reassigned to Sam — by Roxana&rdquo;; the
            previous owner loses access.
          </p>
        </div>

        <ul className="space-y-2">
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
            <Code>PATCH {"{ reassignTo: <adminId> }"}</Code>{" "}
            on updateTeamTask / updateTeamActionItem (exclusive shape — other fields are
            ignored; tasks additionally take <Code>alsoTag</Code> + <Code>comment</Code>). An{" "}
            <Code>adminId</Code> echoed back in an
            update body is inert. Reassigning a task to the <em>current</em> owner is a{" "}
            <strong>share-without-transfer</strong>: ownership is untouched (no reassign
            activity/audit) but <Code>alsoTag</Code>{" "}
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
        <p>
          Note the <Pill>System</Pill> label appears on two different kinds of work:
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoTile title={<>Sweep-generated · &ldquo;by System&rdquo;</>}>
            Created by the sweep itself. De-dup keyed, auto-solved when the condition
            clears, <strong>not reassignable</strong> — it resolves by fixing the underlying
            condition, not by working the task.
          </InfoTile>
          <InfoTile title={<>Agent-created · &ldquo;by api:&hellip;&rdquo;</>}>
            Filed by the external agent with the <em>system</em> source label (styling
            only). Ordinary work: solvable, editable, and <strong>fully reassignable</strong>.
          </InfoTile>
        </div>
      </Section>

      {/* CSM auto-split */}
      <Section icon={Split} title="CSM auto-split">
        <p>
          &ldquo;CSM auto-split&rdquo; (&ldquo;Preview split&rdquo; in the roster dialog) assigns every active client that has no CSM across the{" "}
          <em>CSM-attribution</em> members — proportional to each member&rsquo;s{" "}
          <strong>Split&nbsp;%</strong> (set in the roster dialog; empty = equal share, 0 = opted
          out), balancing by MRR. A client only goes to a CSM who <strong>belongs to the
          client&rsquo;s workspace</strong> (no eligible CSM → it stays unassigned; the hub&rsquo;s
          &ldquo;Assign clients&rdquo; enforces the same rule). It always shows a{" "}
          <strong>preview first</strong>; nothing is
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

        <div className="rounded-2xl bg-muted/40 p-4">
          <div className="text-xs font-medium text-muted-foreground">
            Daily report → hub, per item
          </div>
          <div className="mt-2 space-y-2 text-xs">
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

        <p>
          <strong>Creating an item</strong> — <Code>POST /api/v1/team/action-items</Code>:
        </p>
        <Schema>{`{
  "adminId": "…",                    // routed ROSTER member (listTeamMembers) — required; else 404
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
        <p>
          The response includes the item&rsquo;s <Code>id</Code>{" "}
          and the linked <Code>taskId</Code> — keep
          both for follow-ups.
        </p>

        <p>
          <strong>Reassigning</strong> —{" "}
          <Code>PATCH /api/v1/team/tasks/&#123;id&#125;</Code>{" "}
          or <Code>/team/action-items/&#123;id&#125;</Code>:
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
        <p>
          <strong>Tags &amp; attachments</strong> —{" "}
          <Code>getTeamTask</Code> returns both
          (<Code>tags</Code>,{" "}
          <Code>documents</Code> metadata);{" "}
          <Code>listTeamTasks?taggedAdminId=</Code>{" "}
          lists a member&rsquo;s Tagged section. Tag/untag via{" "}
          <Code>POST /team/tasks/&#123;id&#125;/tags</Code>{" "}
          / <Code>DELETE …/tags/&#123;adminId&#125;</Code>;
          PDF bytes via{" "}
          <Code>…/documents/&#123;documentId&#125;?format=base64</Code>.
        </p>

        <ul className="space-y-2">
          <li>
            <strong>De-duplicate before creating.</strong> There is no idempotency key on the
            API path — the agent must list open items (
            <Code>GET /team/action-items?status=unsolved</Code>
            ) and match by client + body/timestamp, creating only what&rsquo;s genuinely new.
          </li>
          <li>
            <strong>Resolving people and clients:</strong>{" "}
            <Code>listTeamMembers</Code> for rostered
            members, <Code>getTeamOptions</Code> (client
            scope) for any admin id, <Code>listClients?search=</Code>{" "}
            for client ids. An unknown client is fine — <em>clientId is optional</em>.
          </li>
          <li>
            <strong>Token scopes:</strong> <Pill>team: write</Pill> to ingest,{" "}
            <Pill>client: read</Pill> to resolve names. API solves count as human solves — they
            survive task reopens.
          </li>
          <li>
            All mutations are audit-logged as{" "}
            <Code>api:&lt;token name&gt;</Code>; money
            is integer cents; dates are <Code>yyyy-mm-dd</Code>{" "}
            in US&nbsp;Pacific.
          </li>
        </ul>
      </Section>

      <p className="text-xs text-muted-foreground">
        Full API reference (all 19 team operations with schemas):{" "}
        <strong className="font-semibold text-foreground">Dashboard → API Docs</strong>, or{" "}
        <Code>GET /api/v1/openapi.json</Code>. MCP endpoint for agents:{" "}
        <Code>/api/mcp/mcp</Code>.
      </p>
    </div>
  );
}

/* ── local presentational helpers (AdAccountsGuide idiom, kit Card sections) ── */

/** Small framed tile used inside the muted diagram panels. */
const TILE = "rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/5 dark:ring-foreground/10";

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
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <CardTitle className="font-semibold tracking-tight">{title}</CardTitle>
      </CardHeader>
      {/* Body copy is muted; <strong> keywords lift back to the foreground. */}
      <CardContent className="space-y-3 text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: BadgeTone }) {
  // Toned = the same status chip the live UI renders (outline + dot); untoned
  // pills name a permission, field, tab or value. Spans, not the kit's <div>
  // Badge — these sit inside paragraphs.
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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {children}
    </code>
  );
}

function Schema({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl bg-muted/50 p-4 font-mono text-xs leading-relaxed text-foreground">
      {children}
    </pre>
  );
}

/** Titled explainer tile (attribution types, headline modes, sweep vs agent). */
function InfoTile({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/40 px-4 py-3">
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

function FlowRow({ from, tool, note }: { from: string; tool: string; note: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 font-medium text-foreground">{from}</span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
      <Code>{tool}</Code>
      <span className="text-muted-foreground">{note}</span>
    </div>
  );
}

/** One row of the bucket decision flow — condition → bucket chip. */
function BucketRow({ bucket, cond }: { bucket: MonthlyRebillBucket; cond: string }) {
  const meta = MONTHLY_REBILL_META[bucket];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-[220px] flex-1 text-muted-foreground">{cond}</span>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
    </div>
  );
}

/** Tracker-mock legend entry: tone dot + count + lower-cased bucket label. */
function LegendItem({ bucket, count }: { bucket: MonthlyRebillBucket; count: number }) {
  const meta = MONTHLY_REBILL_META[bucket];
  return (
    <span className="inline-flex items-center gap-1.5">
      <BadgeDot tone={meta.tone} />
      <span className="font-medium tabular-nums text-foreground">{count}</span>
      {meta.label.toLowerCase()}
    </span>
  );
}

/** A member hub in the reassignment diagram. */
function HubTile({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className={cn(TILE, "text-center")}>
      <div className="text-xs font-medium text-muted-foreground">Hub · {name}</div>
      <div className="mt-1 space-y-1">{children}</div>
    </div>
  );
}

function HubTileRow({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-2 py-1">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      {children}
    </div>
  );
}
