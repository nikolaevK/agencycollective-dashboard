"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/components/users/format";
import { adminRoleLabel } from "@/components/admins/types";
import { MemberAvatar } from "./TeamHome";
import { ATTRIBUTION_LABEL } from "./presentation";
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

const INPUT_CLS =
  "h-8 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Default roster attribution/position from an admin's role slug. */
function defaultsForRole(role: string): { attribution: TeamAttribution; position: string } {
  if (role === "csm") return { attribution: "csm", position: adminRoleLabel(role) };
  if (role === "media_buyer") return { attribution: "media_buyer", position: adminRoleLabel(role) };
  return { attribution: "lead", position: "" };
}

/**
 * Privileged roster management: add/edit/remove members, set the current
 * month's goal, and run the CSM auto-split (dry-run preview → confirm).
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

  const rosteredIds = useMemo(
    () => new Set(directory.members.map((m) => m.adminId)),
    [directory.members]
  );
  const addable = admins.filter((a) => !rosteredIds.has(a.id));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["team-directory"] });
    queryClient.invalidateQueries({ queryKey: ["team-member"] });
  };

  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
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
    } finally {
      setBusy(false);
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
    } finally {
      setBusy(false);
    }
  }

  const currentMonth = directory.today.slice(0, 7);
  const hasCsmMembers = directory.members.some((m) => m.attribution === "csm");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4 rounded-t-2xl">
          <h2 className="text-base font-bold">Team roster</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Current members */}
          <div className="space-y-2">
            {directory.members.map((m) => (
              <MemberRosterRow
                key={m.adminId}
                adminId={m.adminId}
                name={m.name}
                avatarPath={m.avatarPath}
                position={m.position}
                attribution={m.attribution}
                goalCents={m.goalCents}
                splitSharePercent={m.splitSharePercent}
                currentMonth={currentMonth}
                busy={busy}
                onCall={call}
              />
            ))}
            {directory.members.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No members yet.</p>
            )}
          </div>

          {/* Add member */}
          <AddMemberRow
            addable={addable}
            initialAdminId={initialAdminId}
            busy={busy}
            onCall={call}
          />

          {/* CSM auto-split */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-bold text-foreground">CSM auto-split</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Balance-assign active clients without a CSM across the CSM members,
                  proportionally to each member&apos;s Split % (blank = equal share, 0 = opted
                  out). Assignments become normal Client Directory rows — adjustable afterwards.
                </p>
              </div>
              <button
                type="button"
                disabled={busy || !hasCsmMembers}
                onClick={() => runSplit(false)}
                className="inline-flex items-center gap-2 h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-accent disabled:opacity-50"
                title={hasCsmMembers ? undefined : "Add a member with CSM attribution first"}
              >
                <Shuffle className="h-3.5 w-3.5" />
                Preview split
              </button>
            </div>
            {splitPreview && (
              <div className="mt-3">
                {splitPreview.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Every active client already has a CSM. Nothing to assign.
                  </p>
                ) : (
                  <>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/60">
                      {splitPreview.map((a) => (
                        <div key={a.clientId} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                          <span className="font-semibold text-foreground flex-1 truncate">
                            {a.clientName}
                          </span>
                          <span className="text-muted-foreground">{formatMoney(a.mrrCents)}</span>
                          <span className="font-bold text-primary">→ {a.adminName}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setSplitPreview(null)}
                        className="h-8 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-accent"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => runSplit(true)}
                        className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        Apply {splitPreview.length} assignment{splitPreview.length === 1 ? "" : "s"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberRosterRow({
  adminId,
  name,
  avatarPath,
  position,
  attribution,
  goalCents,
  splitSharePercent,
  currentMonth,
  busy,
  onCall,
}: {
  adminId: string;
  name: string;
  avatarPath: string | null;
  position: string;
  attribution: TeamAttribution;
  goalCents: number;
  splitSharePercent: number | null;
  currentMonth: string;
  busy: boolean;
  onCall: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const [pos, setPos] = useState(position);
  const [goal, setGoal] = useState(goalCents > 0 ? String(Math.round(goalCents / 100)) : "");
  const [share, setShare] = useState(splitSharePercent != null ? String(splitSharePercent) : "");

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 px-3 py-2.5 flex-wrap">
      <MemberAvatar name={name} avatarPath={avatarPath} size="sm" />
      <span className="text-sm font-semibold text-foreground w-28 truncate">{name}</span>
      <input
        type="text"
        value={pos}
        placeholder="Position"
        onChange={(e) => setPos(e.target.value)}
        onBlur={() => {
          if (pos !== position) onCall(`/api/admin/team/members/${adminId}`, "PATCH", { position: pos });
        }}
        className={cn(INPUT_CLS, "w-36 flex-1 min-w-[110px]")}
        disabled={busy}
      />
      <select
        value={attribution}
        onChange={(e) =>
          onCall(`/api/admin/team/members/${adminId}`, "PATCH", { attribution: e.target.value })
        }
        className={cn(INPUT_CLS, "w-44")}
        disabled={busy}
        aria-label="Attribution rule"
      >
        {ATTRIBUTIONS.map((a) => (
          <option key={a} value={a}>
            {ATTRIBUTION_LABEL[a]}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-bold text-muted-foreground uppercase">Goal $</span>
        <input
          type="number"
          min={0}
          value={goal}
          placeholder="0"
          onChange={(e) => setGoal(e.target.value)}
          onBlur={() => {
            const cents = Math.round(Number(goal || 0) * 100);
            if (cents !== goalCents && Number.isFinite(cents) && cents >= 0) {
              onCall(`/api/admin/team/members/${adminId}/goal`, "PUT", {
                month: currentMonth,
                goalCents: cents,
              });
            }
          }}
          className={cn(INPUT_CLS, "w-24")}
          disabled={busy}
          aria-label={`Monthly goal for ${name}`}
        />
      </div>
      {attribution === "csm" && (
        <div className="flex items-center gap-1" title="Auto-split share of the client book (blank = equal share, 0 = opted out)">
          <span className="text-[10px] font-bold text-muted-foreground uppercase">Split %</span>
          <input
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
                onCall(`/api/admin/team/members/${adminId}`, "PATCH", {
                  splitSharePercent: next,
                });
              }
            }}
            className={cn(INPUT_CLS, "w-16")}
            disabled={busy}
            aria-label={`CSM split share for ${name}`}
          />
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (
            confirm(
              `Remove ${name} from the roster? Their tasks, action items, and goals are deleted. Client assignments are kept.`
            )
          ) {
            onCall(`/api/admin/team/members/${adminId}`, "DELETE");
          }
        }}
        className="ml-auto p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
        aria-label={`Remove ${name} from roster`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddMemberRow({
  addable,
  initialAdminId,
  busy,
  onCall,
}: {
  addable: AdminOption[];
  initialAdminId: string | null;
  busy: boolean;
  onCall: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
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
    <div className="rounded-xl border border-dashed border-border p-3.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
        Add team member
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={adminId}
          onChange={(e) => {
            const id = e.target.value;
            setAdminId(id);
            const admin = addable.find((a) => a.id === id);
            if (admin) {
              const d = defaultsForRole(admin.role);
              setAttribution(d.attribution);
              if (!position) setPosition(d.position);
            }
          }}
          className={cn(INPUT_CLS, "w-44")}
          disabled={busy}
          aria-label="Pick an admin"
        >
          <option value="">Pick an admin…</option>
          {addable.map((a) => (
            <option key={a.id} value={a.id}>
              {(a.displayName?.trim() || a.username) +
                (a.role !== "admin" ? ` — ${adminRoleLabel(a.role)}` : "")}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={position}
          placeholder="Position (e.g. COO)"
          onChange={(e) => setPosition(e.target.value)}
          className={cn(INPUT_CLS, "w-40 flex-1 min-w-[120px]")}
          disabled={busy}
        />
        <select
          value={attribution}
          onChange={(e) => setAttribution(e.target.value as TeamAttribution)}
          className={cn(INPUT_CLS, "w-44")}
          disabled={busy}
          aria-label="Attribution rule"
        >
          {ATTRIBUTIONS.map((a) => (
            <option key={a} value={a}>
              {ATTRIBUTION_LABEL[a]}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          value={goal}
          placeholder="Goal $"
          onChange={(e) => setGoal(e.target.value)}
          className={cn(INPUT_CLS, "w-24")}
          disabled={busy}
          aria-label="Monthly goal in dollars"
        />
        <button
          type="button"
          disabled={busy || !adminId}
          onClick={async () => {
            const ok = await onCall("/api/admin/team/members", "POST", {
              adminId,
              position,
              attribution,
              goalCents: Math.round(Number(goal || 0) * 100),
            });
            if (ok) {
              setAdminId("");
              setPosition("");
              setGoal("");
            }
          }}
          className="h-8 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
