"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { MoreHorizontal, Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { CloserRoleBadge } from "@/components/closers/CloserRoleBadge";
import {
  formatBasisPoints,
  type CloserPublic,
} from "@/components/closers/types";
import { deleteCloserAction } from "@/app/actions/closers";
import { useQueryClient } from "@tanstack/react-query";

interface CloserTableProps {
  closers: CloserPublic[];
  onEdit: (closer: CloserPublic) => void;
}

/* Simple hash from a string to pick an avatar colour */
function nameToColor(name: string): string {
  const colors = [
    "bg-violet-500",
    "bg-blue-500",
    "bg-cyan-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-orange-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function relativeDate(dateStr: string): string {
  try {
    // SQLite datetime('now') returns UTC without Z suffix — append it so JS parses as UTC
    const iso = dateStr.includes("T") || dateStr.endsWith("Z") ? dateStr : dateStr + "Z";
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return dateStr;
  }
}

/* ── Status toggle ── */
function StatusToggle({ closerId, status }: { closerId: string; status: string }) {
  const queryClient = useQueryClient();
  const [toggling, setToggling] = useState(false);
  const isActive = status === "active";

  const toggle = async () => {
    setToggling(true);
    try {
      const res = await fetch("/api/admin/closers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: closerId, status: isActive ? "inactive" : "active" }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["admin-closers"] });
      }
    } catch { /* ignore */ } finally {
      setToggling(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={toggling}
      className="flex items-center gap-2 group"
      title={isActive ? "Deactivate closer" : "Activate closer"}
    >
      <div className={cn(
        "relative w-8 h-[18px] rounded-full transition-colors",
        isActive ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
      )}>
        {toggling ? (
          <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
        ) : (
          <div className={cn(
            "absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform",
            isActive ? "translate-x-[16px]" : "translate-x-[2px]"
          )} />
        )}
      </div>
      <span className={cn(
        "text-[10px] font-bold uppercase tracking-wide",
        isActive ? "text-primary" : "text-gray-500 dark:text-gray-400"
      )}>
        {isActive ? "Active" : "Inactive"}
      </span>
    </button>
  );
}

/* ── Portal-based dropdown that renders outside the table overflow ── */
function ActionsDropdown({
  closer,
  onEdit,
  onDelete,
  onClose,
  anchorRef,
}: {
  closer: CloserPublic;
  onEdit: (c: CloserPublic) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement>;
}) {
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: rect.right - 192, // 192 = w-48 = 12rem
    });
  }, [anchorRef]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] w-48 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
        style={{ top: pos.top, left: pos.left }}
      >
        <Link
          href={`/dashboard/closers/${closer.id}`}
          className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          onClick={onClose}
        >
          <Eye className="h-4 w-4 text-muted-foreground" />
          View Dashboard
        </Link>
        <button
          onClick={() => {
            onClose();
            onEdit(closer);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
        >
          <Pencil className="h-4 w-4 text-muted-foreground" />
          Edit
        </button>
        <button
          onClick={() => {
            onClose();
            onDelete(closer.id);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </div>
    </>,
    document.body
  );
}

/* ── Actions cell with ref-based anchor ── */
function ActionsCell({
  closer,
  onEdit,
  onDelete,
}: {
  closer: CloserPublic;
  onEdit: (c: CloserPublic) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <ActionsDropdown
          closer={closer}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </div>
  );
}

export function CloserTable({ closers, onEdit }: CloserTableProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteCloserAction(id);
      if (result.error) {
        alert(result.error);
      }
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-closers"] });
    });
  }

  return (
    <>
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-border/50 dark:border-white/[0.06]">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Name
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Role
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Commission
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Created
                </th>
                <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {closers.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-12 text-sm text-muted-foreground"
                  >
                    No closers found.
                  </td>
                </tr>
              )}
              {closers.map((closer) => (
                <tr
                  key={closer.id}
                  className="border-b border-border/50 dark:border-white/[0.06] last:border-0 hover:bg-muted/50 transition-colors"
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold",
                          nameToColor(closer.displayName)
                        )}
                      >
                        {getInitials(closer.displayName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {closer.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {closer.email}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3">
                    <CloserRoleBadge role={closer.role} />
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusToggle closerId={closer.id} status={closer.status} />
                  </td>

                  {/* Commission */}
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-foreground">
                      {formatBasisPoints(closer.commissionRate)}
                    </span>
                  </td>

                  {/* Created */}
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      {relativeDate(closer.createdAt)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <ActionsCell
                      closer={closer}
                      onEdit={onEdit}
                      onDelete={(id) => setConfirmDeleteId(id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Delete Dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setConfirmDeleteId(null)}
          />
          <div className="relative w-full max-w-sm mx-4 rounded-2xl border border-border bg-card shadow-2xl p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Delete Closer
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Are you sure you want to delete this closer? This action cannot be
              undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={isPending}
                className="h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
