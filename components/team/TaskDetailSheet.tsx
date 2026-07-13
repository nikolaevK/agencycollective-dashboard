"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Flag, Pin, PinOff, Trash2, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/components/users/format";
import { useTeamMemberOptions, type TaskMutations } from "./useTeamData";
import {
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
  SOURCE_META,
} from "./presentation";
import type {
  MemberHubPayload,
  TeamTaskRecord,
  TeamTaskComment,
  TaskChecklistItem,
} from "./types";

const INPUT_CLS =
  "rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Slide-over task detail: status/priority/due/client/lineup, checklist, comments. */
export function TaskDetailSheet({
  task: t,
  hub,
  today,
  mutations,
  onClose,
}: {
  task: TeamTaskRecord;
  hub: MemberHubPayload;
  today: string;
  mutations: TaskMutations;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: memberOptions = [] } = useTeamMemberOptions();
  const [title, setTitle] = useState(t.title);
  const [description, setDescription] = useState(t.description);
  const [newItem, setNewItem] = useState("");
  const [comment, setComment] = useState("");

  function reassign(toAdminId: string) {
    const target = memberOptions.find((m) => m.adminId === toAdminId);
    if (!target || toAdminId === hub.member.adminId) return;
    if (
      !confirm(
        `Reassign "${t.title}" to ${target.name}? It moves to their hub with full ownership (linked action item included).`
      )
    )
      return;
    mutations
      .reassignTask(t.id, toAdminId)
      .then(onClose) // the task no longer belongs to this hub
      .catch((err) => alert(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape inside an editor cancels the field (blur fires the pending
      // save) instead of tearing down the sheet mid-edit.
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")
      ) {
        el.blur();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { data: comments = [] } = useQuery<TeamTaskComment[]>({
    queryKey: ["team-task-comments", t.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/team/tasks/${t.id}/comments`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      return json.data.comments as TeamTaskComment[];
    },
    staleTime: 15_000,
  });

  const patch = (changes: Record<string, unknown>) =>
    mutations
      .patchTask(t.id, changes)
      .catch((err) => alert(err instanceof Error ? err.message : String(err)));

  const overdue = t.status !== "complete" && !!t.dueDate && t.dueDate < today;
  const statusIdx = TASK_STATUS_ORDER.indexOf(t.status);
  const nextStatus = TASK_STATUS_ORDER[(statusIdx + 1) % TASK_STATUS_ORDER.length];
  const ckDone = t.checklist.filter((c) => c.done).length;

  function setChecklist(next: TaskChecklistItem[]) {
    patch({ checklist: next });
  }

  async function submitComment() {
    const body = comment.trim();
    if (!body) return;
    setComment("");
    const res = await fetch(`/api/admin/team/tasks/${t.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      alert(json?.error ?? `HTTP ${res.status}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["team-task-comments", t.id] });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3 rounded-t-2xl">
          <p className="text-xs text-muted-foreground">
            Team / <span className="font-bold text-foreground">{hub.member.name}</span> / Tasks
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => patch({ lineup: !t.lineup })}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                t.lineup
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:bg-accent"
              )}
              title={t.lineup ? "Unpin from Lineup" : "Pin to Lineup"}
            >
              {t.lineup ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this task?")) {
                  mutations
                    .removeTask(t.id)
                    .then(onClose)
                    .catch((err) => alert(err instanceof Error ? err.message : String(err)));
                }
              }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-accent transition-colors"
              aria-label="Delete task"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Status + priority controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex">
              <button
                type="button"
                onClick={() => patch({ status: nextStatus })}
                className={cn(
                  "rounded-l-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wide",
                  TASK_STATUS_META[t.status].chip
                )}
                title={`Advance to ${TASK_STATUS_META[nextStatus].label}`}
              >
                {TASK_STATUS_META[t.status].label}
              </button>
              <button
                type="button"
                onClick={() => patch({ status: nextStatus })}
                className={cn(
                  "rounded-r-lg px-2 py-1.5 text-xs font-black border-l border-background/40",
                  TASK_STATUS_META[t.status].chip
                )}
                aria-label="Advance status"
              >
                →
              </button>
            </span>
            <select
              value={t.priority}
              onChange={(e) => patch({ priority: e.target.value })}
              className={cn(INPUT_CLS, "h-8 py-0 text-xs font-semibold")}
              aria-label="Priority"
            >
              {TASK_PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_META[p].label}
                </option>
              ))}
            </select>
            <Flag className={cn("h-4 w-4", TASK_PRIORITY_META[t.priority].flag)} />
            {overdue && (
              <span className="text-xs font-bold text-red-600 dark:text-red-400">Overdue</span>
            )}
          </div>

          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const trimmed = title.trim();
              if (trimmed && trimmed !== t.title) patch({ title: trimmed });
              else if (!trimmed) setTitle(t.title); // cleared — revert, never save blank
            }}
            className="w-full bg-transparent text-lg font-black text-foreground focus:outline-none border-b border-transparent focus:border-border pb-1"
            aria-label="Task title"
          />

          {/* Fields */}
          <div className="grid grid-cols-[100px_1fr] gap-y-2.5 items-center text-sm">
            <span className="text-muted-foreground text-xs font-semibold">Assignee</span>
            {/* Controlled by the hub owner — a declined confirm or failed
                reassign simply re-renders back to the current assignee.
                Only true SWEEP tasks (created_by='system') are locked —
                agent-created tasks with a 'system' source label reassign fine. */}
            <select
              value={hub.member.adminId}
              onChange={(e) => reassign(e.target.value)}
              disabled={t.source === "system" && t.createdBy === "system"}
              className={cn(INPUT_CLS, "h-8 py-0 w-56 max-w-full text-xs disabled:opacity-60")}
              aria-label="Assignee"
              title={
                t.source === "system" && t.createdBy === "system"
                  ? "Sweep-generated tasks can't be reassigned — the sweep routes them per member"
                  : "Reassigning moves this task (and its linked action item) to the selected member's hub"
              }
            >
              {!memberOptions.some((m) => m.adminId === hub.member.adminId) && (
                <option value={hub.member.adminId}>{hub.member.name}</option>
              )}
              {memberOptions.map((m) => (
                <option key={m.adminId} value={m.adminId}>
                  {m.name}
                  {m.position ? ` — ${m.position}` : ""}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground text-xs font-semibold">Due date</span>
            <input
              type="date"
              value={t.dueDate ?? ""}
              onChange={(e) => patch({ dueDate: e.target.value || null })}
              className={cn(INPUT_CLS, "h-8 py-0 w-44 text-xs", overdue && "text-red-500 font-bold")}
              aria-label="Due date"
            />
            <span className="text-muted-foreground text-xs font-semibold">Client</span>
            <select
              value={t.clientId ?? ""}
              onChange={(e) => patch({ clientId: e.target.value || null })}
              className={cn(INPUT_CLS, "h-8 py-0 w-56 max-w-full text-xs")}
              aria-label="Client"
            >
              <option value="">No client</option>
              {hub.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground text-xs font-semibold">Source</span>
            <span className="text-xs font-semibold text-foreground">
              {t.source === "manual"
                ? "Manual"
                : t.source === "system"
                  ? `${SOURCE_META.system.symbol} System`
                  : "⚡ Action item"}
              {t.createdByName && (
                <span className="text-muted-foreground font-normal"> · by {t.createdByName}</span>
              )}
            </span>
            <span className="text-muted-foreground text-xs font-semibold">Created</span>
            <span className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</span>
          </div>

          {/* Description */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Description
            </p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                if (description !== t.description) patch({ description });
              }}
              placeholder="Add description…"
              rows={3}
              className={cn(INPUT_CLS, "w-full resize-y text-xs leading-relaxed")}
            />
          </div>

          {/* Checklist */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              Checklist{" "}
              {t.checklist.length > 0 && (
                <span className="normal-case tracking-normal font-semibold">
                  {ckDone}/{t.checklist.length}
                </span>
              )}
            </p>
            <div className="space-y-1">
              {t.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <button
                    type="button"
                    onClick={() =>
                      setChecklist(
                        t.checklist.map((c) =>
                          c.id === item.id ? { ...c, done: !c.done } : c
                        )
                      )
                    }
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      item.done
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-input"
                    )}
                    aria-label={item.done ? "Uncheck" : "Check"}
                  >
                    {item.done && <Check className="h-3 w-3" />}
                  </button>
                  <span
                    className={cn(
                      "flex-1 text-xs",
                      item.done ? "text-muted-foreground line-through" : "text-foreground"
                    )}
                  >
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setChecklist(t.checklist.filter((c) => c.id !== item.id))
                    }
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-red-500"
                    aria-label="Remove item"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newItem.trim()) {
                      setChecklist([
                        ...t.checklist,
                        { id: crypto.randomUUID(), text: newItem.trim(), done: false },
                      ]);
                      setNewItem("");
                    }
                  }}
                  placeholder="Add checklist item…"
                  className="flex-1 bg-transparent py-1 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Activity & comments — one chronological trail */}
          <div className="border-t border-border pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Activity
            </p>
            <div className="space-y-2">
              {comments.map((c) =>
                c.kind === "activity" ? (
                  <p key={c.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
                    <span className="min-w-0 truncate">
                      {c.body}
                      <span className="opacity-70">
                        {" "}
                        — {c.authorName || "System"} · {formatDate(c.createdAt)}
                      </span>
                    </span>
                  </p>
                ) : (
                  <div key={c.id} className="text-xs">
                    <span className="font-bold text-foreground">{c.authorName || "Unknown"}</span>{" "}
                    <span className="text-muted-foreground">· {formatDate(c.createdAt)}</span>
                    <p className="mt-0.5 text-foreground whitespace-pre-wrap">{c.body}</p>
                  </div>
                )
              )}
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitComment();
                }}
                placeholder="Write a comment… Enter to send"
                className={cn(INPUT_CLS, "w-full text-xs")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
