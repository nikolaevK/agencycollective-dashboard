"use client";

import { useState } from "react";
import { Folder, Plus, Trash, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { FOLDER_COLOR_KEYS, FOLDER_COLORS, colorOf, type FolderColor } from "@/components/sop/sopFolderColors";
import type { SopListItem } from "@/lib/sop";
import type { SopFolder } from "@/lib/sopFolders";

// The library's click-to-open dialogs — one lazily-loaded chunk, so the
// library's first paint doesn't carry the Radix dialog layers.

const MAX_TAGS = 12;
const MAX_TAG_LEN = 40;

/** Chips + free-text input for editing tags. */
function TagInput({ tags, onChange, placeholder = "Add tags…", autoFocus }: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  function commit(raw: string) {
    const parts = raw.split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
    const next = [...tags];
    for (const p of parts) {
      const tag = p.slice(0, MAX_TAG_LEN);
      if (tag && next.length < MAX_TAGS && !next.some((t) => t.toLowerCase() === tag.toLowerCase())) next.push(tag);
    }
    onChange(next);
    setDraft("");
  }
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-3xl bg-input/50 px-2 py-1.5 transition-[box-shadow] focus-within:ring-[3px] focus-within:ring-ring/30">
      {tags.map((t) => (
        <Badge key={t} variant="secondary" className="h-6 gap-1 pr-1 font-normal">
          {t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="flex size-4 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
            aria-label={`Remove ${t}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(draft); }
          else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => { if (draft.trim()) commit(draft); }}
        placeholder={tags.length === 0 ? placeholder : ""}
        aria-label="Add a tag"
        className="min-w-[70px] flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

const onOpenChangeTo = (onClose: () => void) => (open: boolean) => {
  if (!open) onClose();
};

// ── Folder settings (rename / color / delete) ─────────────────────────────────
export function FolderSettingsDialog({ folder, count, onClose, onRename, onRecolor, onDelete }: {
  folder: SopFolder;
  count: number;
  onClose: () => void;
  onRename: (newName: string) => void;
  onRecolor: (color: FolderColor) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<string>(folder.color);

  function save() {
    const next = name.trim();
    if (next && next !== folder.name) onRename(next);
    onClose();
  }

  return (
    <Dialog open onOpenChange={onOpenChangeTo(onClose)}>
      <DialogContent className="gap-5 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Folder settings</DialogTitle>
          <DialogDescription className="sr-only">Rename, recolor, or delete this folder.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <label htmlFor="sop-folder-name" className="text-xs font-medium text-muted-foreground">Name</label>
          <div className="flex items-center gap-2">
            <Folder className={cn("size-4 shrink-0", colorOf(color).icon)} />
            <Input
              id="sop-folder-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Color</span>
          <div className="flex flex-wrap gap-2">
            {FOLDER_COLOR_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setColor(k); onRecolor(k); }}
                className={cn(
                  "size-7 rounded-full outline-none ring-offset-2 ring-offset-popover transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring",
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

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
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
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="button" size="sm" onClick={save}>Save</Button>
            </div>
          </div>
          {count > 0 && (
            <p className="text-xs text-muted-foreground">This folder has {count} SOP{count === 1 ? "" : "s"}. Move them out to delete it.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Move a SOP to another / a new folder ──────────────────────────────────────
export function MoveSopDialog({ sop, folders, onClose, onMove }: {
  sop: SopListItem;
  folders: string[];
  onClose: () => void;
  onMove: (folder: string) => void;
}) {
  const [newFolder, setNewFolder] = useState("");
  const moveTargets = folders.filter((f) => f !== sop.folder);

  function moveToNew() {
    const n = newFolder.trim();
    if (!n) return;
    onClose();
    onMove(n);
  }

  return (
    <Dialog open onOpenChange={onOpenChangeTo(onClose)}>
      <DialogContent className="gap-4 sm:max-w-xs">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>Move</DialogTitle>
          <DialogDescription className="truncate" title={sop.title}>{sop.title}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-1.5">
          <Input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") moveToNew(); }}
            placeholder="New folder…"
            aria-label="New folder name"
            className="h-8"
          />
          <Button
            type="button"
            size="icon-sm"
            onClick={moveToNew}
            disabled={!newFolder.trim()}
            title="Create folder & move"
            aria-label="Create folder & move"
          >
            <Plus />
          </Button>
        </div>
        {moveTargets.length > 0 && (
          <div className="min-w-0">
            <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">Or move to</p>
            <div className="max-h-56 space-y-0.5 overflow-y-auto overscroll-contain">
              {moveTargets.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => { onClose(); onMove(f); }}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/30"
                >
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Edit a SOP's tags ─────────────────────────────────────────────────────────
export function SopTagsDialog({ sop, onClose, onSave }: {
  sop: SopListItem;
  onClose: () => void;
  onSave: (tags: string[]) => void;
}) {
  const [tagDraft, setTagDraft] = useState<string[]>(sop.tags);
  return (
    <Dialog open onOpenChange={onOpenChangeTo(onClose)}>
      <DialogContent className="gap-4 sm:max-w-xs">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription className="truncate" title={sop.title}>{sop.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <TagInput tags={tagDraft} onChange={setTagDraft} autoFocus />
          <p className="px-1 text-xs text-muted-foreground">Press Enter or comma to add. Up to {MAX_TAGS} tags.</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" size="sm" onClick={() => { onSave(tagDraft); onClose(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
