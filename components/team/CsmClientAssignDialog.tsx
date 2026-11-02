"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatMoney } from "@/components/users/format";
import { AvatarInitials } from "@/components/users/AvatarInitials";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamDirectory } from "./useTeamData";

/**
 * Privileged CSM book management from the Team page: toggle which active
 * clients this CSM member owns. Each toggle writes an ordinary client_team
 * 'csm' row (other CSMs on the same client untouched), so the Client
 * Directory pickers stay the same source of truth.
 */
export function CsmClientAssignDialog({
  member,
  onClose,
}: {
  /** `workspaces` = the CSM's book membership — only those books' clients
   *  can be assigned (the server rejects cross-book assignments). */
  member: { adminId: string; name: string; workspaces: string[] };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useTeamDirectory("today");
  const [search, setSearch] = useState("");
  // Rows with a save in flight — each row toggles independently (one
  // client_team write per client), so a pending save never swallows clicks
  // on OTHER rows; only the busy row is disabled.
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  // Local overrides on top of the fetched snapshot (optimistic toggles).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  // Order comes from the SERVER snapshot only — sorting by the optimistic
  // state would jump a row to the other group on every click, putting a
  // different client under the cursor for the next one.
  const allClients = useMemo(
    () =>
      (data?.clients ?? [])
        // Only the CSM's own books are assignable — but a stale cross-book
        // assignment stays listed so it can still be removed.
        .filter(
          (c) =>
            member.workspaces.includes(c.workspace) ||
            c.team.some((t) => t.role === "csm" && t.adminId === member.adminId)
        )
        .map((c) => ({
          id: c.id,
          displayName: c.displayName,
          mrrCents: c.mrrCents,
          otherCsms: c.team
            .filter((t) => t.role === "csm" && t.adminId !== member.adminId)
            .map((t) => t.name),
          serverAssigned: c.team.some(
            (t) => t.role === "csm" && t.adminId === member.adminId
          ),
        }))
        .sort((a, b) =>
          a.serverAssigned !== b.serverAssigned
            ? a.serverAssigned
              ? -1
              : 1
            : b.mrrCents - a.mrrCents
        ),
    [data, member.adminId, member.workspaces]
  );
  const withState = allClients.map((c) => ({
    ...c,
    assigned: overrides[c.id] ?? c.serverAssigned,
  }));
  const q = search.trim().toLowerCase();
  const clients = q
    ? withState.filter((c) => c.displayName.toLowerCase().includes(q))
    : withState;

  // Header totals cover every assigned client, not just the search matches.
  const assigned = withState.filter((c) => c.assigned);
  const assignedMrr = assigned.reduce((s, c) => s + c.mrrCents, 0);

  async function toggle(clientId: string, next: boolean) {
    if (busyIds.has(clientId)) return;
    setBusyIds((prev) => new Set(prev).add(clientId));
    setOverrides((prev) => ({ ...prev, [clientId]: next }));
    try {
      const res = await fetch(`/api/admin/team/members/${member.adminId}/clients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, assigned: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        alert(json?.error ?? `HTTP ${res.status}`);
        setOverrides((prev) => ({ ...prev, [clientId]: !next }));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setOverrides((prev) => ({ ...prev, [clientId]: !next }));
    } finally {
      setBusyIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(clientId);
        return nextSet;
      });
    }
  }

  function close() {
    // One refetch on exit picks up every toggle across Team + directory views.
    queryClient.invalidateQueries({ queryKey: ["team-directory"] });
    queryClient.invalidateQueries({ queryKey: ["team-member"] });
    // The member's re-billed / billed lines follow their client set.
    queryClient.invalidateQueries({ queryKey: ["team-trends"] });
    queryClient.invalidateQueries({ queryKey: ["team-member-trends", member.adminId] });
    onClose();
  }

  return (
    // Every close path (X, outside click) runs close() so its refetch fires.
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg"
        // The dialog never closed on Escape — keep it that way.
        onEscapeKeyDown={(e) => e.preventDefault()}
        // Nor did it move focus into the search box (on phones that pops
        // the keyboard over the list).
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pb-3 pr-14 pt-6">
          <DialogTitle>{member.name} — assigned clients</DialogTitle>
          <DialogDescription>
            {assigned.length} assigned · {formatMoney(assignedMrr)} MRR
          </DialogDescription>
        </DialogHeader>

        <div className="px-6">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search active clients…"
            className="h-8"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain px-3 py-3">
          {isLoading && (
            <div className="space-y-1.5 px-3 py-1">
              <span className="sr-only">Loading clients…</span>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          )}
          {!isLoading &&
            clients.map((c) => (
              <label
                key={c.id}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-2xl px-3 py-2 transition-colors hover:bg-muted/50 has-[:disabled]:cursor-default has-[:disabled]:opacity-50"
              >
                <Checkbox
                  checked={c.assigned}
                  disabled={busyIds.has(c.id)}
                  onCheckedChange={() => toggle(c.id, !c.assigned)}
                  // Radix toggles on Space only; the old row button took Enter too.
                  onKeyDown={(e) => {
                    if (e.key === "Enter") toggle(c.id, !c.assigned);
                  }}
                />
                <AvatarInitials name={c.displayName} className="h-6 w-6 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {c.displayName}
                  </span>
                  {c.otherCsms.length > 0 && (
                    <span className="block truncate text-xs text-muted-foreground">
                      also CSM: {c.otherCsms.join(", ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {formatMoney(c.mrrCents)}
                </span>
              </label>
            ))}
          {!isLoading && clients.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No clients match.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
