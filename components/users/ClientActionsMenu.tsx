"use client";

import { useRef } from "react";
import { MoreVertical, Pencil, Link2, Eye, Archive, Trash2, ArchiveRestore, ClipboardPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ClientPublic } from "./types";

interface ClientActionsMenuProps {
  client: ClientPublic;
  onEdit: () => void;
  onManageAccounts: () => void;
  onNewTask: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function ClientActionsMenu({
  client,
  onEdit,
  onManageAccounts,
  onNewTask,
  onArchive,
  onDelete,
}: ClientActionsMenuProps) {
  // An item that opens a modal must keep its focus (e.g. the task dialog's
  // autofocused title) — don't send focus back to the trigger after a pick.
  const pickedRef = useRef(false);
  const pick = (action: () => void) => () => {
    pickedRef.current = true;
    action();
  };

  return (
    // modal={false}: items open dialogs; a modal menu closing underneath them
    // can leave <body> pointer-events stuck.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          aria-label="Client actions"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(e) => {
          if (pickedRef.current) {
            pickedRef.current = false;
            e.preventDefault();
          }
        }}
      >
        <DropdownMenuItem onSelect={pick(onEdit)}>
          <Pencil className="text-muted-foreground" />
          Edit Client
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={pick(onManageAccounts)}>
          <Link2 className="text-muted-foreground" />
          Manage Accounts
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={pick(onNewTask)}>
          <ClipboardPlus className="text-muted-foreground" />
          New Team Task
        </DropdownMenuItem>
        {client.slug && (
          <DropdownMenuItem asChild>
            <a
              href={`/${client.slug}/portal/overview`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Eye className="text-muted-foreground" />
              View Portal
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={pick(onArchive)}>
          {client.status === "archived" ? (
            <>
              <ArchiveRestore className="text-muted-foreground" />
              Restore
            </>
          ) : (
            <>
              <Archive className="text-muted-foreground" />
              Archive
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={pick(onDelete)}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
