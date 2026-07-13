"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/components/providers/AdminProvider";
import { TASK_PRIORITY_META, TASK_PRIORITY_ORDER } from "./presentation";
import type { TaskPriority } from "./types";

const INPUT_CLS =
  "h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ROLE_LABEL: Record<string, string> = {
  lead: "Head of Ads",
  media_buyer: "Media Buyer",
  csm: "CSM",
};

/**
 * Create a team ticket for a client from OUTSIDE the Team hub (the Client
 * Directory row menu). Assignee choices are the client's own team members —
 * plus "Me"; non-privileged admins can only ticket themselves (the API
 * enforces the same rule, this just avoids offering doomed options).
 */
export function NewTeamTaskDialog({
  client,
  onClose,
}: {
  client: {
    id: string;
    displayName: string;
    team: Array<{ adminId: string; name: string; role: string }>;
  };
  onClose: () => void;
}) {
  const viewer = useAdmin();
  const queryClient = useQueryClient();
  const privileged = viewer.isSuper || viewer.permissions.admin;
  const viewerName = viewer.displayName?.trim() || viewer.username;

  // De-dupe team members holding multiple roles on this client.
  const teamOptions = new Map<string, { name: string; roles: string[] }>();
  for (const t of client.team) {
    const entry = teamOptions.get(t.adminId) ?? { name: t.name, roles: [] };
    entry.roles.push(ROLE_LABEL[t.role] ?? t.role);
    teamOptions.set(t.adminId, entry);
  }
  const options = privileged
    ? [
        ...(!teamOptions.has(viewer.adminId)
          ? [{ adminId: viewer.adminId, label: `${viewerName} (me)` }]
          : []),
        ...[...teamOptions.entries()].map(([adminId, e]) => ({
          adminId,
          label: `${e.name}${adminId === viewer.adminId ? " (me)" : ""} — ${e.roles.join(" · ")}`,
        })),
      ]
    : [{ adminId: viewer.adminId, label: `${viewerName} (me)` }];

  const [assignee, setAssignee] = useState(
    options.find((o) => o.adminId !== viewer.adminId)?.adminId ?? options[0].adminId
  );
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/team/members/${assignee}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          clientId: client.id,
          priority,
          dueDate: dueDate || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(json?.error ?? `HTTP ${res.status}`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["team-tasks", assignee] });
      queryClient.invalidateQueries({ queryKey: ["team-member", assignee] });
      queryClient.invalidateQueries({ queryKey: ["team-directory"] });
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground">New team task</h2>
            <p className="text-xs text-muted-foreground truncate">for {client.displayName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="What needs doing?"
            autoFocus
            className={cn(INPUT_CLS, "w-full")}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className={cn(INPUT_CLS, "sm:col-span-3 min-w-0 text-xs")}
              aria-label="Assignee"
            >
              {options.map((o) => (
                <option key={o.adminId} value={o.adminId}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className={cn(INPUT_CLS, "min-w-0 text-xs")}
              aria-label="Priority"
            >
              {TASK_PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_META[p].label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={cn(INPUT_CLS, "sm:col-span-2 min-w-0 text-xs")}
              aria-label="Due date"
            />
          </div>
          {client.team.length === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              This client has no team assigned yet — the ticket will go to you.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-border px-3.5 text-xs font-semibold hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !title.trim()}
              onClick={submit}
              className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Create task
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
