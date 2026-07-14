"use client";

import { useState } from "react";
import { Check, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TeamMemberOption } from "./useTeamData";
import type { TeamTaskRecord } from "./types";

/**
 * Confirm sheet for a task reassign — one new OWNER (ownership stays single,
 * the board/sync model requires it) plus any number of extra members to TAG,
 * so one action fans the task out to multiple hubs (their Tagged tab), with
 * an optional handoff note posted to the trail.
 */
export function ReassignTaskDialog({
  task,
  currentAdminId,
  target,
  memberOptions,
  busy,
  onConfirm,
  onCancel,
}: {
  task: TeamTaskRecord;
  /** The hub the task currently lives in. */
  currentAdminId: string;
  /** The new owner (picked in the Assignee select before this opens). */
  target: TeamMemberOption;
  memberOptions: TeamMemberOption[];
  busy: boolean;
  onConfirm: (alsoTag: string[], comment: string) => void;
  onCancel: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  // Everyone except the new owner can be tagged — including the current
  // assignee, who often wants to stay looped in on the work they hand off.
  const taggable = memberOptions.filter((m) => m.adminId !== target.adminId);

  const toggle = (adminId: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(adminId)) next.delete(adminId);
      else next.add(adminId);
      return next;
    });

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-foreground">Reassign task</h3>
            <p className="mt-0.5 text-xs text-muted-foreground truncate" title={task.title}>
              &ldquo;{task.title}&rdquo;
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent shrink-0"
            aria-label="Cancel reassign"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
          <span className="font-bold text-foreground">{target.name}</span>
          {target.position && <span className="text-muted-foreground"> — {target.position}</span>}
          <span className="text-muted-foreground">
            {" "}
            becomes the assignee — the task (and its linked action item) moves to their hub.
          </span>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            Also tag
            <span className="ml-1 normal-case tracking-normal font-medium">
              — they see it in their hub&rsquo;s Tagged tab (no ownership)
            </span>
          </p>
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {taggable.map((m) => {
              const on = checked.has(m.adminId);
              return (
                <button
                  key={m.adminId}
                  type="button"
                  onClick={() => toggle(m.adminId)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/40"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      on ? "bg-primary border-primary text-primary-foreground" : "border-input"
                    )}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="flex-1 truncate text-xs font-semibold text-foreground">
                    {m.name}
                    {m.position && (
                      <span className="text-muted-foreground font-normal"> — {m.position}</span>
                    )}
                  </span>
                  {m.adminId === currentAdminId && (
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                      current assignee
                    </span>
                  )}
                </button>
              );
            })}
            {taggable.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No other roster members to tag.
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            Handoff note <span className="normal-case tracking-normal font-medium">— optional</span>
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this moving? Posted as a comment on the task…"
            rows={2}
            className="w-full resize-y rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm([...checked], note.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            {busy
              ? "Reassigning…"
              : checked.size > 0
                ? `Reassign + tag ${checked.size}`
                : "Reassign"}
          </button>
        </div>
      </div>
    </div>
  );
}
