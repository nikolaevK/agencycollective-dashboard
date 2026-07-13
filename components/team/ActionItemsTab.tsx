"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Zap, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/components/users/format";
import {
  useActionItemMutations,
  useTeamMemberOptions,
  type TeamMemberOption,
} from "./useTeamData";
import { SOURCE_META, TASK_STATUS_META } from "./presentation";
import type { MemberHubPayload, TeamActionItemRecord, TaskStatus } from "./types";

export function ActionItemsTab({
  hub,
  items,
  onOpenTask,
}: {
  hub: MemberHubPayload;
  items: TeamActionItemRecord[];
  onOpenTask: (id: string) => void;
}) {
  const { setItemStatus, reassignItem } = useActionItemMutations(hub.member.adminId);
  const { data: memberOptions = [] } = useTeamMemberOptions();
  const forwardTargets = memberOptions.filter(
    (m) => m.adminId !== hub.member.adminId
  );
  const [addOpen, setAddOpen] = useState(false);

  function forward(item: TeamActionItemRecord, toAdminId: string) {
    const target = forwardTargets.find((m) => m.adminId === toAdminId);
    if (!target) return;
    if (
      !confirm(
        `Forward this action item to ${target.name}? It moves to their inbox with full ownership (linked task included).`
      )
    )
      return;
    reassignItem(item.id, toAdminId).catch((err) =>
      alert(err instanceof Error ? err.message : String(err))
    );
  }

  const unsolved = items.filter((i) => i.status === "unsolved");
  const solved = items.filter((i) => i.status === "solved");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/[0.05] px-4 py-3">
        <Zap className="h-4 w-4 shrink-0 text-primary mt-0.5" />
        <p className="text-xs text-muted-foreground flex-1">
          Action items flagged in client Slack channels or dashboard threads are{" "}
          <span className="font-bold text-primary">relayed here by the reporting agent</span> and
          automatically added to {hub.member.name}&apos;s task board. Solving one completes the
          linked task — and completing the task solves it.
        </p>
        <button
          type="button"
          onClick={() => setAddOpen((o) => !o)}
          className="shrink-0 inline-flex items-center gap-1.5 h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
          Add item
        </button>
      </div>

      {addOpen && <AddItemForm hub={hub} onDone={() => setAddOpen(false)} />}

      {[...unsolved, ...solved].map((item) => (
        <ActionItemCard
          key={item.id}
          item={item}
          clientName={
            item.clientId
              ? hub.clients.find((c) => c.id === item.clientId)?.displayName ?? null
              : null
          }
          onFlip={(status) =>
            setItemStatus(item.id, status).catch((err) =>
              alert(err instanceof Error ? err.message : String(err))
            )
          }
          onOpenTask={onOpenTask}
          forwardTargets={forwardTargets}
          onForward={(toAdminId) => forward(item, toAdminId)}
        />
      ))}
      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No action items — inbox zero 🎉
        </p>
      )}
    </div>
  );
}

function ActionItemCard({
  item,
  clientName,
  onFlip,
  onOpenTask,
  forwardTargets,
  onForward,
}: {
  item: TeamActionItemRecord;
  clientName: string | null;
  onFlip: (status: "solved" | "unsolved") => void;
  onOpenTask: (id: string) => void;
  forwardTargets: TeamMemberOption[];
  onForward: (toAdminId: string) => void;
}) {
  const src = SOURCE_META[item.sourceType];
  const solved = item.status === "solved";
  const taskStatus = (item.linkedTask?.status ?? "todo") as TaskStatus;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4",
        solved ? "border-border/50 opacity-60" : "border-border/60 border-l-4 border-l-primary"
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold",
            src.chip
          )}
        >
          {src.symbol} {src.label}
          {item.sourceChannel && ` · ${item.sourceChannel}`}
        </span>
        {clientName && (
          <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
            {clientName}
          </span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {item.authorLabel && `${item.authorLabel} · `}
          {formatDate(item.externalTs ?? item.createdAt)}
        </span>
      </div>

      <p className="mt-2 text-sm text-foreground leading-relaxed">{item.body}</p>

      <div className="mt-3 flex items-center gap-2.5 flex-wrap">
        {item.linkedTask && (
          <button
            type="button"
            onClick={() => onOpenTask(item.linkedTask!.id)}
            className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/10 px-2 py-1 text-[11px] font-bold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 transition-colors"
          >
            ⚡ Linked task: “{item.linkedTask.title}”
            <span
              className={cn(
                "rounded px-1.5 py-0 text-[9px] font-black uppercase",
                TASK_STATUS_META[taskStatus]?.chip
              )}
            >
              {TASK_STATUS_META[taskStatus]?.label}
            </span>
          </button>
        )}
        {/* Sweep items (dedup-keyed) are per-member; the API rejects
            forwarding them. Agent-created 'system'-labeled items forward fine. */}
        {forwardTargets.length > 0 && item.dedupKey == null && (
          <select
            value=""
            onChange={(e) => e.target.value && onForward(e.target.value)}
            className="h-7 rounded-lg border border-input bg-background px-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            aria-label="Forward to another member"
            title="Moves this item (and its linked task) to the selected member's hub"
          >
            <option value="">Forward to…</option>
            {forwardTargets.map((m) => (
              <option key={m.adminId} value={m.adminId}>
                {m.name}
                {m.position ? ` — ${m.position}` : ""}
              </option>
            ))}
          </select>
        )}
        {solved ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            Solved
            {item.solvedBy === "task" && " (via task)"}
            {item.solvedBy === "system" && " (auto)"}
            <button
              type="button"
              onClick={() => onFlip("unsolved")}
              className="ml-2 text-muted-foreground hover:text-foreground font-semibold"
            >
              Reopen
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onFlip("solved")}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-foreground hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            Mark Solved
          </button>
        )}
      </div>
    </div>
  );
}

function AddItemForm({ hub, onDone }: { hub: MemberHubPayload; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [clientId, setClientId] = useState("");
  const [channel, setChannel] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/team/members/${hub.member.adminId}/action-items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: text,
            clientId: clientId || null,
            sourceType: "dashboard",
            sourceChannel: channel.trim() || null,
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(json?.error ?? `HTTP ${res.status}`);
        return;
      }
      // The POST created an item AND a linked task — refresh both caches.
      queryClient.invalidateQueries({ queryKey: ["team-action-items", hub.member.adminId] });
      queryClient.invalidateQueries({ queryKey: ["team-tasks", hub.member.adminId] });
      queryClient.invalidateQueries({ queryKey: ["team-member", hub.member.adminId] });
      onDone();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border p-4 space-y-2.5">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="What needs attention? A linked task is created automatically."
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="h-8 min-w-0 max-w-[180px] rounded-lg border border-input bg-background px-2 text-xs text-muted-foreground"
          aria-label="Client"
        >
          <option value="">No client</option>
          {hub.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="Source label (optional)"
          className="h-8 flex-1 min-w-[140px] rounded-lg border border-input bg-background px-2.5 text-xs text-foreground"
        />
        <button
          type="button"
          onClick={onDone}
          className="h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={submit}
          className="h-8 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Add item
        </button>
      </div>
    </div>
  );
}
