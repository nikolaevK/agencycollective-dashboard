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
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  SOURCE_META,
  ATTRIBUTION_LABEL,
} from "./presentation";
import type { TeamAttribution } from "./types";

/**
 * The Documentation tab on /dashboard/team. Read-only explainer for the whole
 * Team hub — roster & attribution, tasks, action items, the two-way sync, the
 * system sweep, CSM auto-split, and the external API/MCP agent workflow (with
 * payload schemas). No data fetches — purely explanatory. Keep in sync with
 * lib/teamHub.ts / teamTasks.ts / teamActionItems.ts and the v1 team surface.
 */
export function TeamGuide() {
  return (
    <div className="max-w-4xl space-y-8 text-sm leading-relaxed text-foreground">
      {/* Intro */}
      <p className="text-muted-foreground">
        The <strong className="text-foreground">Team hub</strong> gives every team member one
        workspace that combines their slice of the Client Directory (clients, MRR managed,
        re-bills, health) with a personal task board and an action-item inbox. The roster,
        goals, and client attribution live here; the client data itself always comes live from
        the Client Directory — nothing is duplicated.
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
            (PepAds manual MRR included) and is compared against the member&rsquo;s{" "}
            <strong>monthly goal</strong>.
          </li>
          <li>
            Goals are stored per month and <strong>carry forward</strong> — a month without an
            explicit goal inherits the latest earlier one.
          </li>
          <li>
            Re-bill rollups skip PepAds and paused/unscheduled clients — the same exclusions the
            alerts banner uses.
          </li>
          <li>
            An admin who has client assignments but no roster row shows up as an{" "}
            <em>unrostered assignee</em> notice so they can be added.
          </li>
        </ul>
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
            <em>activity rows</em> automatically (status moves, action-item solves) — a muted
            timeline in the task detail view.
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
          (13&nbsp;operations, one MCP tool each). This is how an agent relays client follow-up
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
        Full API reference (all 13 team operations with schemas): <strong>Dashboard → API
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
