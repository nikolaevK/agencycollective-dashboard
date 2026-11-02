"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, ChevronDown, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/components/users/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/use-confirm";
import { DueLabel, PriorityFlag, TaskStatusDot } from "./TeamBits";
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
  const { confirm, dialog: confirmDialog } = useConfirm();

  async function dismiss(task: TaggedTaskRecord) {
    if (
      !(await confirm({
        title: "Remove this tag?",
        description: `"${task.title}" leaves the Tagged section.`,
        confirmText: "Remove tag",
      }))
    )
      return;
    let res: Response;
    try {
      res = await fetch(
        `/api/admin/team/tasks/${task.id}/tags/${hub.member.adminId}`,
        { method: "DELETE" }
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      return;
    }
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
      <>
        <Card className="p-10 text-center">
          <AtSign className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">No tagged tasks</p>
          <p className="mt-1 text-xs text-muted-foreground">
            When a teammate tags {hub.member.name} on one of their tasks, it shows up here.
          </p>
        </Card>
        {confirmDialog}
      </>
    );
  }

  const open = tasks.filter((t) => t.status !== "complete");
  const done = tasks.filter((t) => t.status === "complete");

  const row = (t: TaggedTaskRecord) => {
    const expanded = expandedId === t.id;
    return (
      <div key={t.id}>
        <div className="flex w-full items-center gap-2 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setExpandedId(expanded ? null : t.id)}
            // flex-wrap + the title's min-w floor: on phones the owner chip /
            // due / flag wrap below instead of crushing the title.
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 py-1 text-left"
          >
            {expanded ? (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <TaskStatusDot status={t.status} />
            <span
              className={cn(
                "min-w-[55%] flex-1 truncate text-sm font-medium",
                t.status === "complete"
                  ? "text-muted-foreground line-through"
                  : "text-foreground"
              )}
            >
              {t.title}
            </span>
            <Badge
              variant="outline"
              className="block max-w-[140px] truncate font-normal text-muted-foreground"
            >
              {t.ownerName ? `${t.ownerName}'s hub` : "Unknown hub"}
            </Badge>
            <DueLabel task={t} today={today} />
            <PriorityFlag priority={t.priority} />
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => dismiss(t)}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Remove tag (leaves this section)"
            aria-label="Remove tag"
          >
            <X />
          </Button>
        </div>
        {expanded && (
          <div className="space-y-1.5 border-t px-9 py-2.5 text-xs">
            {t.description ? (
              <p className="whitespace-pre-wrap break-words text-foreground">{t.description}</p>
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
      {open.length > 0 && <Card className="divide-y">{open.map(row)}</Card>}
      {done.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Completed · {done.length}
          </p>
          <Card className="divide-y">{done.map(row)}</Card>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
