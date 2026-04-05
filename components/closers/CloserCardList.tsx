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

interface CloserCardListProps {
  closers: CloserPublic[];
  onEdit: (closer: CloserPublic) => void;
}

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

/* ── Portal-based dropdown ── */
function CardActionsDropdown({
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
      left: rect.right - 192,
    });
  }, [anchorRef]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        className="fixed z-[61] w-48 rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
        style={{ top: pos.top, left: Math.max(8, pos.left) }}
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

function CardActionsButton({
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
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <CardActionsDropdown
          closer={closer}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={() => setOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </>
  );
}

export function CloserCardList({ closers, onEdit }: CloserCardListProps) {
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

  if (closers.length === 0) {
    return (
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">No closers found.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {closers.map((closer) => (
          <div
            key={closer.id}
            className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              {/* Left: Avatar + Info */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center shrink-0 text-white text-lg font-bold",
                    nameToColor(closer.displayName)
                  )}
                >
                  {getInitials(closer.displayName)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {closer.displayName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mb-1.5">
                    {closer.email}
                  </p>
                  <CloserRoleBadge role={closer.role} />
                </div>
              </div>

              {/* Right: Menu */}
              <CardActionsButton
                closer={closer}
                onEdit={onEdit}
                onDelete={(id) => setConfirmDeleteId(id)}
              />
            </div>

            {/* Bottom row: Commission + Status */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50 dark:border-white/[0.06]">
              <div className="text-sm">
                <span className="text-muted-foreground">Commission: </span>
                <span className="font-semibold text-foreground">
                  {formatBasisPoints(closer.commissionRate)}
                </span>
              </div>
              <StatusToggle closerId={closer.id} status={closer.status} />
            </div>
          </div>
        ))}
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
