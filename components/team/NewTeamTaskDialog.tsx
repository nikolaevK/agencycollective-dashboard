"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdmin } from "@/components/providers/AdminProvider";
import { TASK_PRIORITY_META, TASK_PRIORITY_ORDER } from "./presentation";
import { useTeamMemberOptions } from "./useTeamData";
import type { TaskPriority } from "./types";

const ROLE_LABEL: Record<string, string> = {
  lead: "Head of Ads",
  media_buyer: "Media Buyer",
  csm: "CSM",
};

/**
 * Create a team ticket for a client from OUTSIDE the Team hub (the Client
 * Directory row menu). Assignee choices are the client's own team members —
 * plus "Me"; non-privileged admins can only ticket themselves (the API
 * enforces the same rule, this just avoids offering doomed options). Only
 * Team ROSTER members are offered: an unrostered admin has no hub, so a task
 * filed to them would be unreachable.
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
  const { data: roster, isLoading: rosterLoading, isError: rosterError } =
    useTeamMemberOptions();
  const rosterIds = new Set((roster ?? []).map((m) => m.adminId));

  // De-dupe team members holding multiple roles on this client.
  const teamOptions = new Map<string, { name: string; roles: string[] }>();
  for (const t of client.team) {
    const entry = teamOptions.get(t.adminId) ?? { name: t.name, roles: [] };
    entry.roles.push(ROLE_LABEL[t.role] ?? t.role);
    teamOptions.set(t.adminId, entry);
  }
  const allOptions = privileged
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
  const options = allOptions.filter((o) => rosterIds.has(o.adminId));
  // Client-team members left out for not being on the roster (named so the
  // admin knows why they're missing).
  const unrosteredNames = privileged
    ? [...teamOptions.entries()]
        .filter(([adminId]) => !rosterIds.has(adminId))
        .map(([, e]) => e.name)
    : [];

  // Picked assignee, falling back to the default (first non-self option) —
  // derived rather than seeded, since options arrive with the roster fetch.
  const [picked, setPicked] = useState("");
  const assignee = options.some((o) => o.adminId === picked)
    ? picked
    : options.find((o) => o.adminId !== viewer.adminId)?.adminId ??
      options[0]?.adminId ??
      "";
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = title.trim();
    if (!t || busy || !assignee) return;
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
      queryClient.invalidateQueries({ queryKey: ["team-trends"] });
      queryClient.invalidateQueries({ queryKey: ["team-member-trends", assignee] });
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        // The old modal had no Escape handler — it closes only via the X
        // button, Cancel or a backdrop click.
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-md"
      >
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle>New team task</DialogTitle>
          <DialogDescription className="truncate">for {client.displayName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="What needs doing?"
            autoFocus
            aria-label="Task title"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select
              value={assignee}
              onValueChange={(v) => setPicked(v)}
              disabled={options.length === 0}
            >
              <SelectTrigger aria-label="Assignee" className="min-w-0 sm:col-span-3">
                <SelectValue
                  placeholder={rosterLoading ? "Loading team…" : "No one available on the Team roster"}
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.adminId} value={o.adminId}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger aria-label="Priority" className="min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITY_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>
                    {TASK_PRIORITY_META[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DatePicker
              value={dueDate}
              onValueChange={setDueDate}
              placeholder="Due date"
              aria-label="Due date"
              className="min-w-0 sm:col-span-2"
            />
          </div>
          {!rosterLoading && options.length === 0 ? (
            <p className={cn("rounded-2xl border px-3 py-2 text-xs", badgeTone.warning)}>
              {rosterError
                ? "Couldn't load the Team roster — close and try again."
                : privileged
                  ? "Nobody here is on the Team roster yet — add them on the Team page first."
                  : "You're not on the Team roster yet — ask an admin to add you before creating team tasks."}
            </p>
          ) : client.team.length === 0 ? (
            <p className={cn("rounded-2xl border px-3 py-2 text-xs", badgeTone.warning)}>
              This client has no team assigned yet — the ticket will go to you.
            </p>
          ) : (
            unrosteredNames.length > 0 &&
            !rosterLoading && (
              <p className="text-xs text-muted-foreground">
                {unrosteredNames.join(", ")} {unrosteredNames.length === 1 ? "isn't" : "aren't"} on
                the Team roster, so they can&apos;t
                receive tasks.
              </p>
            )
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !title.trim() || !assignee}
            onClick={submit}
          >
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
