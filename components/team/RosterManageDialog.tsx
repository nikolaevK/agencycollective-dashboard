"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, Shuffle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/use-confirm";
import { formatMoney } from "@/components/users/format";
import { adminRoleLabel } from "@/components/admins/types";
import { MemberAvatar } from "./TeamBits";
import { ATTRIBUTION_LABEL } from "./presentation";
import { useTeamMemberOptions } from "./useTeamData";
import type {
  TeamDirectoryPayload,
  TeamAttribution,
  CsmSplitAssignment,
} from "./types";

interface AdminOption {
  id: string;
  username: string;
  displayName: string | null;
  avatarPath: string | null;
  role: string;
  isSuper: boolean;
}

const ATTRIBUTIONS: TeamAttribution[] = ["book", "lead", "media_buyer", "csm"];

/** Radix Select can't hold "" — stands in for the Add row's "no admin picked". */
const NO_ADMIN = "__none__";

/** Goal input text for stored cents — exact (no rounding), "" when unset. */
function goalInputOf(goalCents: number): string {
  if (goalCents <= 0) return "";
  return goalCents % 100 === 0 ? String(goalCents / 100) : (goalCents / 100).toFixed(2);
}

/** Default roster attribution/position from an admin's role slug. */
function defaultsForRole(role: string): { attribution: TeamAttribution; position: string } {
  if (role === "csm") return { attribution: "csm", position: adminRoleLabel(role) };
  if (role === "media_buyer") return { attribution: "media_buyer", position: adminRoleLabel(role) };
  return { attribution: "lead", position: "" };
}

/**
 * Privileged roster management: add/edit/remove members, set the current
 * month's goal, and run the CSM auto-split (dry-run preview → confirm).
 *
 * Deliberately a hand-built modal (kit overlay/panel classes), not a Radix
 * Dialog: the row fields save on blur, and Radix dismisses an outside click
 * on pointer-down — before the focused field blurs — so the dialog would
 * unmount and drop the pending edit. Close paths are unchanged: backdrop
 * click and the X button (no Escape).
 */
export function RosterManageDialog({
  directory,
  initialAdminId = null,
  onClose,
}: {
  directory: TeamDirectoryPayload;
  /** Pre-select this admin in the Add row (one-click add from the unrostered notice). */
  initialAdminId?: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // Split-only busy flag — row edits track their own pending saves, so a
  // save on blur never disables the field the user just tabbed into.
  const [busy, setBusy] = useState(false);
  const [splitPreview, setSplitPreview] = useState<CsmSplitAssignment[] | null>(null);

  const { data: admins = [] } = useQuery<AdminOption[]>({
    queryKey: ["admins-list"],
    queryFn: async () => {
      const res = await fetch("/api/admin/admins");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data as AdminOption[];
    },
    staleTime: 300_000,
  });

  // The directory prop can be pinned to one workspace (TeamHome's book
  // filter), so roster membership comes from the unpinned roster list too —
  // otherwise other books' members look "addable" (→ 409 on add).
  const { data: rosterOptions = [] } = useTeamMemberOptions();
  const rosteredIds = useMemo(
    () =>
      new Set([
        ...directory.members.map((m) => m.adminId),
        ...rosterOptions.map((o) => o.adminId),
      ]),
    [directory.members, rosterOptions]
  );
  const addable = admins.filter((a) => !rosteredIds.has(a.id));
  const shownIds = new Set(directory.members.map((m) => m.adminId));
  const hiddenMemberCount = rosterOptions.filter((o) => !shownIds.has(o.adminId)).length;
  // Display only: each member row's admin role label (blank until the admins list loads).
  const roleById = useMemo(() => new Map(admins.map((a) => [a.id, a.role])), [admins]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["team-directory"] });
    queryClient.invalidateQueries({ queryKey: ["team-member"] });
    queryClient.invalidateQueries({ queryKey: ["team-member-options"] });
    // Goals, attribution and membership all shape the trend series.
    queryClient.invalidateQueries({ queryKey: ["team-trends"] });
    queryClient.invalidateQueries({ queryKey: ["team-member-trends"] });
  };

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(json?.error ?? `HTTP ${res.status}`);
        return false;
      }
      refresh();
      return true;
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  async function runSplit(confirm: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/team/auto-split-csm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        alert(json?.error ?? `HTTP ${res.status}`);
        return;
      }
      const result = json.data as { assignments: CsmSplitAssignment[]; applied: boolean };
      if (confirm) {
        setSplitPreview(null);
        refresh();
      } else {
        setSplitPreview(result.assignments);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const currentMonth = directory.today.slice(0, 7);
  // The split runs across the WHOLE roster, not just the pinned book.
  const hasCsmMembers =
    directory.members.some((m) => m.attribution === "csm") ||
    rosterOptions.some((o) => o.attribution === "csm");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className={dialogOverlayClass} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-roster-title"
        className={cn(
          dialogPanelClass,
          "relative z-50 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden"
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-4">
          <h2 id="team-roster-title" className="text-base font-semibold tracking-tight">
            Team roster
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 bg-secondary"
          >
            <X />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-6 py-5">
          {/* Current members */}
          <section className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Members</p>
            <div className="divide-y">
              {directory.members.map((m) => {
                const role = roleById.get(m.adminId);
                return (
                  <MemberRosterRow
                    key={m.adminId}
                    adminId={m.adminId}
                    name={m.name}
                    avatarPath={m.avatarPath}
                    roleLabel={role ? adminRoleLabel(role) : null}
                    position={m.position}
                    attribution={m.attribution}
                    goalCents={m.goalCents}
                    splitSharePercent={m.splitSharePercent}
                    currentMonth={currentMonth}
                    onCall={call}
                  />
                );
              })}
            </div>
            {directory.members.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">No members yet.</p>
            )}
            {hiddenMemberCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {hiddenMemberCount} member{hiddenMemberCount === 1 ? "" : "s"} in other
                workspaces {hiddenMemberCount === 1 ? "isn't" : "aren't"} listed — clear the
                workspace filter to edit them.
              </p>
            )}
          </section>

          {/* Add member */}
          <AddMemberRow addable={addable} initialAdminId={initialAdminId} onCall={call} />

          {/* CSM auto-split */}
          <section className="space-y-3 rounded-2xl bg-muted/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[16rem] flex-1 space-y-0.5">
                <p className="text-sm font-medium text-foreground">CSM auto-split</p>
                <p className="text-xs text-muted-foreground">
                  Balance-assign active clients without a CSM across the CSM members,
                  proportionally to each member&apos;s Split % (blank = equal share, 0 = opted
                  out). Assignments become normal Client Directory rows — adjustable afterwards.
                </p>
              </div>
              {/* The hint lives on a wrapper: the kit Button ignores pointer
                  events while disabled, so its own title would never show. */}
              <span
                className="inline-flex shrink-0"
                title={hasCsmMembers ? undefined : "Add a member with CSM attribution first"}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || !hasCsmMembers}
                  onClick={() => runSplit(false)}
                >
                  <Shuffle />
                  Preview split
                </Button>
              </span>
            </div>
            {splitPreview &&
              (splitPreview.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Every active client already has a CSM. Nothing to assign.
                </p>
              ) : (
                <>
                  <div className="max-h-48 divide-y overflow-y-auto overscroll-contain rounded-xl bg-background ring-1 ring-foreground/5">
                    {splitPreview.map((a) => (
                      <div key={a.clientId} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {a.clientName}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatMoney(a.mrrCents)}
                        </span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 max-w-[40%] truncate font-medium text-foreground">
                          {a.adminName}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSplitPreview(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => runSplit(true)}
                    >
                      Apply {splitPreview.length} assignment{splitPreview.length === 1 ? "" : "s"}
                    </Button>
                  </div>
                </>
              ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function MemberRosterRow({
  adminId,
  name,
  avatarPath,
  roleLabel,
  position,
  attribution,
  goalCents,
  splitSharePercent,
  currentMonth,
  onCall,
}: {
  adminId: string;
  name: string;
  avatarPath: string | null;
  roleLabel: string | null;
  position: string;
  attribution: TeamAttribution;
  goalCents: number;
  splitSharePercent: number | null;
  currentMonth: string;
  onCall: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [pos, setPos] = useState(position);
  const [goal, setGoal] = useState(goalInputOf(goalCents));
  const [share, setShare] = useState(splitSharePercent != null ? String(splitSharePercent) : "");
  // In-flight saves for THIS row. Inputs stay enabled while saving (each
  // field PATCHes independently); only Remove waits for them to settle.
  const [pending, setPending] = useState(0);
  const save = async (url: string, method: string, body?: unknown) => {
    setPending((n) => n + 1);
    try {
      return await onCall(url, method, body);
    } finally {
      setPending((n) => n - 1);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 py-2.5">
      <MemberAvatar name={name} avatarPath={avatarPath} size="sm" />
      <div className="w-32 min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {roleLabel && <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>}
      </div>
      <Input
        type="text"
        value={pos}
        placeholder="Position"
        onChange={(e) => setPos(e.target.value)}
        onBlur={async () => {
          if (pos === position) return;
          const ok = await save(`/api/admin/team/members/${adminId}`, "PATCH", { position: pos });
          if (!ok) setPos(position);
        }}
        className="h-8 w-36 min-w-[110px] flex-1"
        aria-label={`Position for ${name}`}
      />
      {/* Saves on change (no blur step), like the old native select. */}
      <Select
        value={attribution}
        onValueChange={(value) =>
          save(`/api/admin/team/members/${adminId}`, "PATCH", { attribution: value })
        }
      >
        <SelectTrigger className="h-8 w-52" aria-label="Attribution rule">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ATTRIBUTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              {ATTRIBUTION_LABEL[a]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Goal $</span>
        <Input
          type="number"
          min={0}
          value={goal}
          placeholder="0"
          onChange={(e) => setGoal(e.target.value)}
          onBlur={async () => {
            // Exact cents round-trip (goalInputOf) — an untouched field never
            // re-PUTs a rounded value.
            const cents = Math.round(Number(goal || 0) * 100);
            if (!Number.isFinite(cents) || cents < 0) {
              setGoal(goalInputOf(goalCents));
              return;
            }
            if (cents === goalCents) return;
            const ok = await save(`/api/admin/team/members/${adminId}/goal`, "PUT", {
              month: currentMonth,
              goalCents: cents,
            });
            if (!ok) setGoal(goalInputOf(goalCents));
          }}
          className="h-8 w-24 px-2 tabular-nums"
          aria-label={`Monthly goal for ${name}`}
        />
      </div>
      {attribution === "csm" && (
        <div className="flex items-center gap-1.5" title="Auto-split share of the client book (blank = equal share, 0 = opted out)">
          <span className="text-xs font-medium text-muted-foreground">Split %</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={share}
            placeholder="="
            onChange={(e) => setShare(e.target.value)}
            onBlur={() => {
              const next = share.trim() === "" ? null : Math.round(Number(share));
              if (next !== null && (!Number.isFinite(next) || next < 0 || next > 100)) {
                setShare(splitSharePercent != null ? String(splitSharePercent) : "");
                return;
              }
              if (next !== splitSharePercent) {
                save(`/api/admin/team/members/${adminId}`, "PATCH", {
                  splitSharePercent: next,
                }).then((ok) => {
                  if (!ok) setShare(splitSharePercent != null ? String(splitSharePercent) : "");
                });
              }
            }}
            className="h-8 w-16 px-2 tabular-nums"
            aria-label={`CSM split share for ${name}`}
          />
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending > 0}
        onClick={async () => {
          if (
            !(await confirm({
              title: `Remove ${name} from the roster?`,
              description:
                "Their tasks, action items, and goals are deleted. Client assignments are kept.",
              confirmText: "Remove",
              destructive: true,
            }))
          )
            return;
          save(`/api/admin/team/members/${adminId}`, "DELETE");
        }}
        className="ml-auto text-muted-foreground hover:text-destructive"
        aria-label={`Remove ${name} from roster`}
      >
        <Trash2 />
      </Button>
      {confirmDialog}
    </div>
  );
}

function AddMemberRow({
  addable,
  initialAdminId,
  onCall,
}: {
  addable: AdminOption[];
  initialAdminId: string | null;
  onCall: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [position, setPosition] = useState("");
  const [attribution, setAttribution] = useState<TeamAttribution>("lead");
  const [goal, setGoal] = useState("");

  // Pre-select the unrostered admin once the admins list has loaded.
  const preselect = initialAdminId && !adminId ? addable.find((a) => a.id === initialAdminId) : null;
  useEffect(() => {
    if (preselect) {
      setAdminId(preselect.id);
      const d = defaultsForRole(preselect.role);
      setAttribution(d.attribution);
      setPosition((p) => p || d.position);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect?.id]);

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Add team member</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={adminId || NO_ADMIN}
          onValueChange={(value) => {
            const id = value === NO_ADMIN ? "" : value;
            setAdminId(id);
            const admin = addable.find((a) => a.id === id);
            if (admin) {
              const d = defaultsForRole(admin.role);
              setAttribution(d.attribution);
              if (!position) setPosition(d.position);
            }
          }}
          disabled={busy}
        >
          <SelectTrigger
            className={cn("h-8 w-52", !adminId && "text-muted-foreground")}
            aria-label="Pick an admin"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ADMIN}>Pick an admin…</SelectItem>
            {addable.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {(a.displayName?.trim() || a.username) +
                  (a.role !== "admin" ? ` — ${adminRoleLabel(a.role)}` : "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="text"
          value={position}
          placeholder="Position (e.g. COO)"
          onChange={(e) => setPosition(e.target.value)}
          className="h-8 w-40 min-w-[120px] flex-1"
          disabled={busy}
        />
        <Select
          value={attribution}
          onValueChange={(value) => setAttribution(value as TeamAttribution)}
          disabled={busy}
        >
          <SelectTrigger className="h-8 w-52" aria-label="Attribution rule">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ATTRIBUTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {ATTRIBUTION_LABEL[a]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={0}
          value={goal}
          placeholder="Goal $"
          onChange={(e) => setGoal(e.target.value)}
          className="h-8 w-24 tabular-nums"
          disabled={busy}
          aria-label="Monthly goal in dollars"
        />
        <Button
          type="button"
          size="sm"
          disabled={busy || !adminId}
          onClick={async () => {
            setBusy(true);
            const ok = await onCall("/api/admin/team/members", "POST", {
              adminId,
              position,
              attribution,
              goalCents: Math.round(Number(goal || 0) * 100),
            });
            setBusy(false);
            if (ok) {
              setAdminId("");
              setPosition("");
              setGoal("");
            }
          }}
        >
          Add
        </Button>
      </div>
    </section>
  );
}
