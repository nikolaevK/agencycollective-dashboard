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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface CloserTableProps {
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

function relativeDate(dateStr: string): string {
  try {
    // SQLite datetime('now') returns UTC without Z suffix — append it so JS parses as UTC
    const iso = dateStr.includes("T") || dateStr.endsWith("Z") ? dateStr : dateStr + "Z";
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return dateStr;
  }
}


/* ── Row actions menu ── */
function ActionsCell({
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
          size="icon-sm"
          aria-label={`Actions for ${closer.displayName}`}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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

export function CloserTable({ closers, onEdit }: CloserTableProps) {
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

  return (
    <>
      <Card>
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {closers.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-muted-foreground"
                >
                  No closers found.
                </TableCell>
              </TableRow>
            )}
            {closers.map((closer) => (
              <TableRow key={closer.id}>
                {/* Name */}
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="text-xs font-medium">
                        {getInitials(closer.displayName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {closer.displayName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {closer.email}
                      </p>
                    </div>
                  </div>
                </TableCell>

                {/* Role */}
                <TableCell>
                  <CloserRoleBadge role={closer.role} />
                </TableCell>

                {/* Status */}
                <TableCell>
                  <StatusToggle closerId={closer.id} status={closer.status} />
                </TableCell>

                {/* Commission */}
                <TableCell className="font-medium tabular-nums">
                  {formatBasisPoints(closer.commissionRate)}
                </TableCell>

                {/* Created */}
                <TableCell className="text-muted-foreground">
                  {relativeDate(closer.createdAt)}
                </TableCell>

                {/* Actions */}
                <TableCell className="pr-4 text-right">
                  <ActionsCell
                    closer={closer}
                    onEdit={onEdit}
                    onDelete={(id) => setConfirmDeleteId(id)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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
