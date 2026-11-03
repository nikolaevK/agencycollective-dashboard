"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Folder, Plus, Star, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MediaTagInput } from "./MediaTagInput";
import {
  FOLDER_COLOR_KEYS,
  FOLDER_COLORS,
  IMPORTANT_STAR_CLS,
  MAX_TAGS,
  colorOf,
  formatDateTime,
  type DocumentReader,
  type FolderColor,
  type MediaFolderLite,
} from "./mediaDirectoryShared";

// The directory's click-to-open dialogs — one lazy chunk, fetched the first
// time any of them opens. Each is mounted only while open.

const closeOn = (onClose: () => void) => (open: boolean) => {
  if (!open) onClose();
};

/**
 * These dialogs are controlled (no DialogTrigger), so Radix's close handler
 * has nothing to focus and drops focus on <body>. Hand it back to whatever
 * opened the dialog (a file's menu trigger, the readers / folder-settings
 * button) while that's still on the page.
 */
function useReturnFocus() {
  const [opener] = useState(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)
  );
  return (e: Event) => {
    if (opener && opener !== document.body && opener.isConnected) {
      e.preventDefault();
      opener.focus();
    }
  };
}

// ─────────────────────────────────────────────────────── Folder settings ──

export function FolderSettingsDialog({
  folder,
  count,
  isManager,
  onClose,
  onRename,
  onRecolor,
  onToggleImportant,
  onDelete,
}: {
  folder: MediaFolderLite;
  count: number;
  isManager: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  onRecolor: (color: FolderColor) => void;
  onToggleImportant: (next: boolean) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<string>(folder.color);
  const [important, setImportant] = useState(folder.important);
  const returnFocus = useReturnFocus();

  function pickColor(c: FolderColor) {
    setColor(c);
    onRecolor(c); // live — applies immediately
  }

  function toggleImportant(next: boolean) {
    setImportant(next);
    onToggleImportant(next); // live
  }

  function save() {
    const next = name.trim();
    if (next && next !== folder.name) onRename(next);
    onClose();
  }

  return (
    <Dialog open onOpenChange={closeOn(onClose)}>
      <DialogContent onCloseAutoFocus={returnFocus} className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-sm">
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle>Folder settings</DialogTitle>
          <DialogDescription className="truncate" title={folder.name}>
            {folder.name}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-5">
          <div className="space-y-2">
            <label htmlFor="media-folder-name" className="text-xs font-medium text-muted-foreground">
              Name
            </label>
            <div className="flex items-center gap-2">
              <Folder className={cn("size-4 shrink-0", colorOf(color).icon)} />
              <Input
                id="media-folder-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Color</p>
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLOR_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pickColor(k)}
                  className={cn(
                    "size-7 rounded-full ring-offset-2 ring-offset-popover transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    FOLDER_COLORS[k].swatch,
                    color === k && "ring-2 ring-foreground"
                  )}
                  title={k}
                  aria-label={`Color ${k}`}
                  aria-pressed={color === k}
                />
              ))}
            </div>
          </div>

          {isManager && (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-muted/50 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Star className={cn("size-4", important ? IMPORTANT_STAR_CLS : "text-muted-foreground")} />
                Mark folder important
              </span>
              <Switch checked={important} onCheckedChange={toggleImportant} />
            </label>
          )}

          {count > 0 && (
            <p className="text-xs text-muted-foreground">
              This folder has {count} file{count === 1 ? "" : "s"}. Move or delete them to remove the folder.
            </p>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { if (count === 0) onDelete(); }}
            disabled={count > 0}
            title={count > 0 ? "Folder must be empty to delete" : "Delete folder"}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash />
            Delete
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={save}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────── Read receipts ──

export function DocumentReadersDialog({
  docId,
  fileName,
  onClose,
}: {
  docId: string;
  fileName: string;
  onClose: () => void;
}) {
  const returnFocus = useReturnFocus();
  const { data: readers = [], isLoading } = useQuery<DocumentReader[]>({
    queryKey: ["media-readers", docId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/media-buyers/documents/${docId}/readers`);
      if (!res.ok) throw new Error("Failed to load readers");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 10_000,
  });

  return (
    <Dialog open onOpenChange={closeOn(onClose)}>
      <DialogContent onCloseAutoFocus={returnFocus} className="sm:max-w-sm">
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle>Read receipts</DialogTitle>
          <DialogDescription className="truncate" title={fileName}>
            {fileName}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="min-w-0 space-y-1" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2">
                <Skeleton className="size-4 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : readers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No one has marked this as read yet.</p>
        ) : (
          <ul className="-mx-2 max-h-72 min-w-0 space-y-0.5 overflow-y-auto overscroll-contain">
            {readers.map((r) => (
              <li key={r.adminId} className="flex items-center justify-between gap-2 rounded-2xl px-3 py-2 hover:bg-muted/50">
                <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{r.adminName ?? r.adminId}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTime(r.readAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────── Move to folder ──

export function MoveDocumentDialog({
  fileName,
  currentFolder,
  folders,
  onClose,
  onMove,
}: {
  fileName: string;
  currentFolder: string;
  folders: string[];
  onClose: () => void;
  onMove: (folder: string) => void;
}) {
  const [newFolder, setNewFolder] = useState("");
  const returnFocus = useReturnFocus();
  const panelRef = useRef<HTMLDivElement>(null);
  const moveTargets = folders.filter((f) => f !== currentFolder);

  function moveTo(folder: string) {
    onClose();
    onMove(folder);
  }

  function moveToNew() {
    const n = newFolder.trim();
    if (!n) return;
    setNewFolder("");
    moveTo(n); // moving to a not-yet-existing folder creates it implicitly
  }

  return (
    <Dialog open onOpenChange={closeOn(onClose)}>
      <DialogContent
        ref={panelRef}
        // Focus the panel, not the "New folder" field — picking an existing
        // folder is the usual move, and a focused field pops the phone keyboard.
        onOpenAutoFocus={(e) => { e.preventDefault(); panelRef.current?.focus(); }}
        onCloseAutoFocus={returnFocus}
        className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-sm"
      >
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle>Move</DialogTitle>
          <DialogDescription className="truncate" title={fileName}>
            {fileName}
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0: a long folder name must truncate, not widen the dialog's grid track */}
        <div className="min-w-0 space-y-4">
          {/* Create a new folder and move into it */}
          <div className="flex items-center gap-2">
            <Input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") moveToNew(); }}
              placeholder="New folder…"
              aria-label="New folder name"
            />
            <Button
              type="button"
              size="icon"
              onClick={moveToNew}
              disabled={!newFolder.trim()}
              title="Create folder & move"
              aria-label="Create folder & move"
            >
              <Plus />
            </Button>
          </div>

          {moveTargets.length > 0 && (
            <div className="space-y-1">
              <p className="px-1 text-xs font-medium text-muted-foreground">Or move to</p>
              <div className="-mx-2 max-h-56 space-y-0.5 overflow-y-auto overscroll-contain">
                {moveTargets.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => moveTo(f)}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <Folder className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{f}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────── Edit tags ──

export function DocumentTagsDialog({
  fileName,
  initialTags,
  onClose,
  onSave,
}: {
  fileName: string;
  initialTags: string[];
  onClose: () => void;
  onSave: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const returnFocus = useReturnFocus();

  return (
    <Dialog open onOpenChange={closeOn(onClose)}>
      <DialogContent onCloseAutoFocus={returnFocus} className="sm:max-w-sm">
        <DialogHeader className="min-w-0 pr-10">
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription className="truncate" title={fileName}>
            {fileName}
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-2">
          <MediaTagInput tags={tags} onChange={setTags} autoFocus className="min-h-9" />
          <p className="text-xs text-muted-foreground">Press Enter or comma to add. Up to {MAX_TAGS} tags.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => { onSave(tags); onClose(); }}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
