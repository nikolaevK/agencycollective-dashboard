"use client";

import { useId, useState } from "react";
import { Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
  const headingId = useId();

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
      <div className={dialogOverlayClass} onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={cn(
          dialogPanelClass,
          "relative z-50 w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain p-6 space-y-5"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 id={headingId} className="text-base font-semibold tracking-tight text-foreground">
              Reassign task
            </h3>
            <p className="mt-1 text-sm text-muted-foreground truncate" title={task.title}>
              &ldquo;{task.title}&rdquo;
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            className="shrink-0 text-muted-foreground"
            aria-label="Cancel reassign"
          >
            <X />
          </Button>
        </div>

        <div className="rounded-2xl bg-muted/40 px-3 py-2.5 text-sm">
          <span className="font-medium text-foreground">{target.name}</span>
          {target.position && <span className="text-muted-foreground"> — {target.position}</span>}
          <span className="text-muted-foreground">
            {" "}
            becomes the assignee — the task (and its linked action item) moves to their hub.
          </span>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Also tag
            <span className="ml-1 font-normal">
              — they see it in their hub&rsquo;s Tagged tab (no ownership)
            </span>
          </p>
          <div className="max-h-44 overflow-y-auto overscroll-contain space-y-0.5">
            {taggable.map((m) => (
              // The whole row is the checkbox's label — clicking the name
              // toggles it, like the old full-width row button.
              <label
                key={m.adminId}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-2xl px-2 py-2 hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked.has(m.adminId)}
                  onCheckedChange={() => toggle(m.adminId)}
                  // Radix toggles on Space only; the old row button took Enter too.
                  onKeyDown={(e) => {
                    if (e.key === "Enter") toggle(m.adminId);
                  }}
                />
                <span className="flex-1 truncate text-sm font-medium text-foreground">
                  {m.name}
                  {m.position && (
                    <span className="text-muted-foreground font-normal"> — {m.position}</span>
                  )}
                </span>
                {m.adminId === currentAdminId && (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    current assignee
                  </Badge>
                )}
              </label>
            ))}
            {taggable.length === 0 && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                No other roster members to tag.
              </p>
            )}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Handoff note <span className="font-normal">— optional</span>
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this moving? Posted as a comment on the task…"
            rows={2}
            className="resize-y"
            aria-label="Handoff note"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => onConfirm([...checked], note.trim())}
          >
            <Send />
            {busy
              ? "Reassigning…"
              : checked.size > 0
                ? `Reassign + tag ${checked.size}`
                : "Reassign"}
          </Button>
        </div>
      </div>
    </div>
  );
}
