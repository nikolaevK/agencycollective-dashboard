"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/components/users/format";
import { AvatarInitials } from "@/components/users/AvatarInitials";
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
  member: { adminId: string; name: string };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useTeamDirectory("today");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Local overrides on top of the fetched snapshot (optimistic toggles).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const clients = useMemo(() => {
    const list = (data?.clients ?? []).map((c) => ({
      id: c.id,
      displayName: c.displayName,
      mrrCents: c.mrrCents,
      otherCsms: c.team
        .filter((t) => t.role === "csm" && t.adminId !== member.adminId)
        .map((t) => t.name),
      assigned:
        overrides[c.id] ??
        c.team.some((t) => t.role === "csm" && t.adminId === member.adminId),
    }));
    const q = search.trim().toLowerCase();
    return list
      .filter((c) => !q || c.displayName.toLowerCase().includes(q))
      .sort((a, b) =>
        a.assigned !== b.assigned
          ? a.assigned
            ? -1
            : 1
          : b.mrrCents - a.mrrCents
      );
  }, [data, overrides, search, member.adminId]);

  const assigned = clients.filter((c) => c.assigned);
  const assignedMrr = assigned.reduce((s, c) => s + c.mrrCents, 0);

  async function toggle(clientId: string, next: boolean) {
    if (busyId) return;
    setBusyId(clientId);
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
      setBusyId(null);
    }
  }

  function close() {
    // One refetch on exit picks up every toggle across Team + directory views.
    queryClient.invalidateQueries({ queryKey: ["team-directory"] });
    queryClient.invalidateQueries({ queryKey: ["team-member"] });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-foreground">
              {member.name} — assigned clients
            </h2>
            <p className="text-xs text-muted-foreground">
              {assigned.length} assigned · {formatMoney(assignedMrr)} MRR
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 pt-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search active clients…"
            className="h-8 w-full rounded-lg border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading clients…</p>
          )}
          {!isLoading &&
            clients.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busyId === c.id}
                onClick={() => toggle(c.id, !c.assigned)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted/40 disabled:opacity-50"
              >
                <span
                  className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-2 transition-colors",
                    c.assigned
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40 text-transparent"
                  )}
                >
                  <Check className="h-3 w-3" />
                </span>
                <AvatarInitials name={c.displayName} className="w-6 h-6" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {c.displayName}
                  </span>
                  {c.otherCsms.length > 0 && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      also CSM: {c.otherCsms.join(", ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {formatMoney(c.mrrCents)}
                </span>
              </button>
            ))}
          {!isLoading && clients.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No clients match.</p>
          )}
        </div>
      </div>
    </div>
  );
}
