"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, ChevronDown, ChevronRight, Flag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/components/users/format";
import { DueLabel } from "./MemberHub";
import { TASK_STATUS_META, TASK_PRIORITY_META } from "./presentation";
import type { MemberHubPayload, TaggedTaskRecord } from "./types";

/**
 * The hub's Tagged section — tasks (owned by OTHER members) this member was
 * tagged on. This is the tag's notification surface: the tab badge counts
 * open tagged tasks, and a row expands to the task's description. Dismiss
 * removes the tag (a member may always remove their own).
 */
export function TaggedTab({
  hub,
  tasks,
  today,
}: {
  hub: MemberHubPayload;
  tasks: TaggedTaskRecord[];
  today: string;
}) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function dismiss(task: TaggedTaskRecord) {
    if (!confirm(`Remove this tag? "${task.title}" leaves the Tagged section.`)) return;
    const res = await fetch(
      `/api/admin/team/tasks/${task.id}/tags/${hub.member.adminId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      alert(json?.error ?? `HTTP ${res.status}`);
      return;
    }
    queryClient.setQueryData<TaggedTaskRecord[]>(
      ["team-tagged-tasks", hub.member.adminId],
      (prev) => (prev ?? []).filter((t) => t.id !== task.id)
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-border p-10 text-center">
        <AtSign className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-semibold text-foreground">No tagged tasks</p>
        <p className="mt-1 text-xs text-muted-foreground">
          When a teammate tags {hub.member.name} on one of their tasks, it shows up here.
        </p>
      </div>
    );
  }

  const open = tasks.filter((t) => t.status !== "complete");
  const done = tasks.filter((t) => t.status === "complete");

  const row = (t: TaggedTaskRecord) => {
    const expanded = expandedId === t.id;
    return (
      <div key={t.id} className="rounded-lg border border-border/60 bg-card">
        <div className="flex w-full items-center gap-2.5 px-2.5 py-2">
          <button
            type="button"
            onClick={() => setExpandedId(expanded ? null : t.id)}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className={cn("h-2 w-2 shrink-0 rounded-sm", TASK_STATUS_META[t.status].dot)} />
            <span
              className={cn(
                "flex-1 truncate text-sm font-semibold",
                t.status === "complete"
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              )}
            >
              {t.title}
            </span>
            <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground truncate max-w-[140px]">
              {t.ownerName ? `${t.ownerName}'s hub` : "Unknown hub"}
            </span>
            <DueLabel task={t} today={today} />
            <Flag className={cn("h-3.5 w-3.5 shrink-0", TASK_PRIORITY_META[t.priority].flag)} />
          </button>
          <button
            type="button"
            onClick={() => dismiss(t)}
            className="shrink-0 p-1 text-muted-foreground hover:text-red-500"
            title="Remove tag (leaves this section)"
            aria-label="Remove tag"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {expanded && (
          <div className="border-t border-border/60 px-9 py-2.5 text-xs space-y-1.5">
            {t.description ? (
              <p className="whitespace-pre-wrap text-foreground">{t.description}</p>
            ) : (
              <p className="text-muted-foreground">No description.</p>
            )}
            <p className="text-muted-foreground">
              {TASK_STATUS_META[t.status].label} · {TASK_PRIORITY_META[t.priority].label}
              {t.taggedByName ? ` · Tagged by ${t.taggedByName}` : ""} ·{" "}
              {formatDate(t.taggedAt)}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Tasks in other members&apos; hubs that {hub.member.name} is tagged on. Ask the
        task&apos;s owner (or a privileged admin) for changes — tags are a heads-up, not
        ownership.
      </p>
      <div className="space-y-1.5">{open.map(row)}</div>
      {done.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Completed · {done.length}
          </p>
          {done.map(row)}
        </div>
      )}
    </div>
  );
}
