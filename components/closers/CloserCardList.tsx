"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal, Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { StatusToggle } from "@/components/closers/StatusToggle";
import { CloserRoleBadge } from "@/components/closers/CloserRoleBadge";
import {
  formatBasisPoints,
  type CloserPublic,
} from "@/components/closers/types";
import { deleteCloserAction } from "@/app/actions/closers";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/providers/ToastProvider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CloserCardListProps {
  closers: CloserPublic[];
  onEdit: (closer: CloserPublic) => void;
}


function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/* ── Card actions menu (Radix flips it above the button near the BottomNav) ── */
function CardActionsButton({
  closer,
  onEdit,
  onDelete,
}: {
  closer: CloserPublic;
  onEdit: (c: CloserPublic) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Actions for ${closer.displayName}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8}>
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/closers/${closer.id}`}>
            <Eye className="text-muted-foreground" />
            View Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onEdit(closer)}>
          <Pencil className="text-muted-foreground" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onDelete(closer.id)}
        >
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CloserCardList({ closers, onEdit }: CloserCardListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const { toastError } = useToast();

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteCloserAction(id);
      if (result.error) {
        toastError(result.error);
      }
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-closers"] });
    });
  }

  if (closers.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-sm text-muted-foreground">No closers found.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {closers.map((closer) => (
          <Card key={closer.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              {/* Left: Avatar + Info */}
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="size-12">
                  <AvatarFallback className="text-base font-medium">
                    {getInitials(closer.displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
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
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <div className="text-sm">
                <span className="text-muted-foreground">Commission: </span>
                <span className="font-semibold tabular-nums">
                  {formatBasisPoints(closer.commissionRate)}
                </span>
              </div>
              <StatusToggle closerId={closer.id} status={closer.status} />
            </div>
          </Card>
        ))}
      </div>

      {/* Confirm Delete Dialog — closes on backdrop click (not Escape), like before */}
      <Dialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-sm"
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Delete Closer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this closer? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmDeleteId) handleDelete(confirmDeleteId);
              }}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
