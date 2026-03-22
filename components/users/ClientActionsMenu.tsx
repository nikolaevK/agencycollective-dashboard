"use client";

import { useState, useRef, useEffect } from "react";
import { MoreVertical, Pencil, Link2, Eye, Archive, Trash2, ArchiveRestore } from "lucide-react";
import type { ClientPublic } from "./types";

interface ClientActionsMenuProps {
  client: ClientPublic;
  onEdit: () => void;
  onManageAccounts: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function ClientActionsMenu({
  client,
  onEdit,
  onManageAccounts,
  onArchive,
  onDelete,
}: ClientActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted/50 transition-colors"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-border bg-card shadow-xl z-50 py-1 animate-in fade-in-0 zoom-in-95">
          <button
            onClick={() => { setOpen(false); onEdit(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            Edit Client
          </button>
          <button
            onClick={() => { setOpen(false); onManageAccounts(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
          >
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            Manage Accounts
          </button>
          {client.slug && (
            <a
              href={`/${client.slug}/portal/overview`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
            >
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              View Portal
            </a>
          )}
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => { setOpen(false); onArchive(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
          >
            {client.status === "archived" ? (
              <>
                <ArchiveRestore className="h-3.5 w-3.5 text-muted-foreground" />
                Restore
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                Archive
              </>
            )}
          </button>
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
