"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  Folder,
  FolderPlus,
  Files,
  FileText,
  Printer,
  Pencil,
  Trash2,
  Trash,
  Check,
  X,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  FolderInput,
  GripVertical,
  Palette,
  Plus,
  Tag,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createSopRequest, deleteSopRequest, newSopDoc } from "@/hooks/useSops";
import { ImportSopDialog } from "@/components/sop/ImportSopDialog";
import type { SopListItem } from "@/lib/sop";
import type { SopFolder } from "@/lib/sopFolders";

// ── Folder color palette (full class strings so Tailwind keeps them) ──────────
const FOLDER_COLOR_KEYS = ["gray", "red", "amber", "green", "teal", "blue", "violet", "pink"] as const;
type FolderColor = (typeof FOLDER_COLOR_KEYS)[number];

const FOLDER_COLORS: Record<FolderColor, { icon: string; active: string; swatch: string }> = {
  gray: { icon: "text-slate-500", active: "bg-slate-500/10 text-slate-700 dark:text-slate-300", swatch: "bg-slate-400" },
  red: { icon: "text-red-500", active: "bg-red-500/10 text-red-600 dark:text-red-400", swatch: "bg-red-500" },
  amber: { icon: "text-amber-500", active: "bg-amber-500/10 text-amber-600 dark:text-amber-400", swatch: "bg-amber-500" },
  green: { icon: "text-green-500", active: "bg-green-500/10 text-green-600 dark:text-green-400", swatch: "bg-green-500" },
  teal: { icon: "text-teal-500", active: "bg-teal-500/10 text-teal-600 dark:text-teal-400", swatch: "bg-teal-500" },
  blue: { icon: "text-blue-500", active: "bg-blue-500/10 text-blue-600 dark:text-blue-400", swatch: "bg-blue-500" },
  violet: { icon: "text-violet-500", active: "bg-violet-500/10 text-violet-600 dark:text-violet-400", swatch: "bg-violet-500" },
  pink: { icon: "text-pink-500", active: "bg-pink-500/10 text-pink-600 dark:text-pink-400", swatch: "bg-pink-500" },
};

function colorOf(c: string | undefined) {
  return FOLDER_COLORS[(c as FolderColor) in FOLDER_COLORS ? (c as FolderColor) : "gray"];
}

const MAX_TAGS = 12;
const MAX_TAG_LEN = 40;

const LIB_KEY = ["sops", null, null] as const;

interface LibraryData {
  sops: SopListItem[];
  folders: SopFolder[];
  tags: string[];
}

function formatDate(raw: string): string {
  if (!raw) return "";
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Close a modal on Escape while open. */
function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}

/** Chips + free-text input for editing tags. */
function TagInput({ tags, onChange, placeholder = "Add tags…", autoFocus }: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
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
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-1.5 py-1">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          {t}
          <button type="button" onMouseDown={stop} onClick={() => onChange(tags.filter((x) => x !== t))} className="text-primary/70 hover:text-destructive" aria-label={`Remove ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        autoFocus={autoFocus}
        value={draft}
        onMouseDown={stop}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(draft); }
          else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        onBlur={() => { if (draft.trim()) commit(draft); }}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="min-w-[70px] flex-1 bg-transparent px-1 py-0.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}

// ── Droppable folder chip ─────────────────────────────────────────────────────
function FolderChip({ id, label, count, active, droppable, color, isAll, onSelect }: {
  id: string;
  label: string;
  count: number;
  active: boolean;
  droppable: boolean;
  color?: string;
  isAll?: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  const c = colorOf(color);
  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      className={cn(
        "group flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors md:w-full",
        active ? (isAll ? "bg-primary/10 text-primary" : c.active) : "text-foreground hover:bg-accent",
        isOver && "ring-2 ring-primary ring-offset-1 ring-offset-card bg-primary/15"
      )}
    >
      <span className={cn("shrink-0", isAll ? (active ? "text-primary" : "text-muted-foreground") : c.icon)}>
        {isAll ? <Files className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className={cn("shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular-nums", active ? "bg-foreground/10" : "bg-muted text-muted-foreground")}>
        {count}
      </span>
    </button>
  );
}

// ── Folder settings (rename / color / delete) ─────────────────────────────────
function FolderSettingsModal({ folder, count, onClose, onRename, onRecolor, onDelete }: {
  folder: SopFolder;
  count: number;
  onClose: () => void;
  onRename: (newName: string) => void;
  onRecolor: (color: FolderColor) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<string>(folder.color);
  useEscape(true, onClose);

  function save() {
    const next = name.trim();
    if (next && next !== folder.name) onRename(next);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Folder settings</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
        <div className="flex items-center gap-2">
          <Folder className={cn("h-4 w-4 shrink-0", colorOf(color).icon)} />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") onClose(); }}
            className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <label className="mb-2 mt-4 block text-xs font-medium text-muted-foreground">Color</label>
        <div className="flex flex-wrap gap-2">
          {FOLDER_COLOR_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => { setColor(k); onRecolor(k); }}
              className={cn("h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110", FOLDER_COLORS[k].swatch, color === k && "ring-2 ring-foreground")}
              title={k}
              aria-label={`Color ${k}`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            onClick={() => { if (count === 0) onDelete(); }}
            disabled={count > 0}
            title={count > 0 ? "Folder must be empty to delete" : "Delete folder"}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash className="h-3.5 w-3.5" /> Delete
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent">Cancel</button>
            <button onClick={save} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Save</button>
          </div>
        </div>
        {count > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">This folder has {count} SOP{count === 1 ? "" : "s"}. Move them out to delete it.</p>
        )}
      </div>
    </div>
  );
}

// ── Draggable SOP tile ────────────────────────────────────────────────────────
function SopTile({ sop, view, folders, onOpen, onMove, onDelete, onSaveTags, onTagClick, onDownload, activeTag, deleteConfirm, busy }: {
  sop: SopListItem;
  view: "grid" | "list";
  folders: string[];
  onOpen: () => void;
  onMove: (folder: string) => void;
  onDelete: () => void;
  onSaveTags: (tags: string[]) => void;
  onTagClick: (tag: string) => void;
  onDownload: () => void;
  activeTag: string;
  deleteConfirm: boolean;
  busy: boolean;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: sop.id });
  const [moveOpen, setMoveOpen] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState<string[]>(sop.tags);
  useEscape(moveOpen, () => setMoveOpen(false));
  useEscape(tagsOpen, () => setTagsOpen(false));

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const noDrag = { onMouseDown: stop, onTouchStart: stop, onPointerDown: stop };
  const moveTargets = folders.filter((f) => f !== sop.folder);

  function moveToNew() {
    const n = newFolder.trim();
    if (!n) return;
    setMoveOpen(false);
    setNewFolder("");
    onMove(n);
  }

  const titleNode = (
    <button {...noDrag} onClick={onOpen} className="truncate text-left text-sm font-medium text-foreground hover:text-primary" title={sop.title}>
      {sop.title || "Untitled SOP"}
    </button>
  );

  const badges = (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {sop.status === "published" && (
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Published</span>
      )}
      {sop.tags.map((t) => (
        <button
          key={t}
          {...noDrag}
          onClick={() => onTagClick(t)}
          title={`Filter by "${t}"`}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            activeTag.toLowerCase() === t.toLowerCase() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          <Tag className="h-2.5 w-2.5" /> {t}
        </button>
      ))}
    </div>
  );

  const actions = (
    <div className={cn("flex items-center gap-0.5", view === "grid" && "opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100")}>
      <button {...noDrag} onClick={onOpen} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" title="Open in builder"><Pencil className="h-3.5 w-3.5" /></button>
      <button {...noDrag} onClick={onDownload} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" title="Export to PDF"><Printer className="h-3.5 w-3.5" /></button>
      <button {...noDrag} onClick={() => setMoveOpen(true)} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" title="Move to folder"><FolderInput className="h-3.5 w-3.5" /></button>
      <button {...noDrag} onClick={() => { setTagDraft(sop.tags); setTagsOpen(true); }} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" title="Edit tags"><Tag className="h-3.5 w-3.5" /></button>
      <button
        {...noDrag}
        onClick={onDelete}
        disabled={busy}
        className={cn("flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50", deleteConfirm ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive")}
        title={deleteConfirm ? "Click again to confirm" : "Delete"}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );

  const moveModal = moveOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" {...noDrag}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMoveOpen(false)} />
      <div className="relative w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground">Move</h4>
            <p className="truncate text-xs text-muted-foreground" title={sop.title}>{sop.title}</p>
          </div>
          <button onClick={() => setMoveOpen(false)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-2 flex items-center gap-1">
          <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") moveToNew(); }} placeholder="New folder…" className="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          <button onClick={moveToNew} disabled={!newFolder.trim()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40" title="Create folder & move"><Plus className="h-4 w-4" /></button>
        </div>
        {moveTargets.length > 0 && (
          <>
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Or move to</p>
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {moveTargets.map((f) => (
                <button key={f} onClick={() => { setMoveOpen(false); onMove(f); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-accent">
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" /> <span className="truncate">{f}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  const tagModal = tagsOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" {...noDrag}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setTagsOpen(false)} />
      <div className="relative w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground">Tags</h4>
            <p className="truncate text-xs text-muted-foreground" title={sop.title}>{sop.title}</p>
          </div>
          <button onClick={() => setTagsOpen(false)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <TagInput tags={tagDraft} onChange={setTagDraft} autoFocus />
        <p className="mt-1.5 text-[11px] text-muted-foreground">Press Enter or comma to add. Up to {MAX_TAGS} tags.</p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={() => setTagsOpen(false)} className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent">Cancel</button>
          <button onClick={() => { onSaveTags(tagDraft); setTagsOpen(false); }} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Save</button>
        </div>
      </div>
    </div>
  );

  if (view === "grid") {
    return (
      <div ref={setNodeRef} {...listeners} className={cn("group relative flex cursor-grab flex-col gap-2 rounded-xl border border-border/60 bg-background p-3 transition-all hover:border-primary/40 hover:shadow-sm active:cursor-grabbing", isDragging && "opacity-40")}>
        <div className="flex items-start justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" /></div>
          {actions}
        </div>
        <div className="min-w-0">
          <div className="min-w-0">{titleNode}</div>
          {sop.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{sop.description}</p>}
          {badges}
        </div>
        <p className="mt-auto pt-1 text-[11px] text-muted-foreground">Updated {formatDate(sop.updatedAt)}</p>
        {moveModal}
        {tagModal}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} {...listeners} className={cn("group flex cursor-grab items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent active:cursor-grabbing", isDragging && "opacity-40")}>
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
      <FileText className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="min-w-0">{titleNode}</div>
        <p className="truncate text-xs text-muted-foreground">{sop.folder} · Updated {formatDate(sop.updatedAt)}</p>
        {badges}
      </div>
      {actions}
      {moveModal}
      {tagModal}
    </div>
  );
}

// ── Main library ──────────────────────────────────────────────────────────────
export function SopLibrary({ onOpenSop }: { onOpenSop: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<"" | "draft" | "published">("");
  const [tagFilter, setTagFilter] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [settingsFolderName, setSettingsFolderName] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<LibraryData>({
    queryKey: LIB_KEY,
    queryFn: async () => {
      const res = await fetch("/api/admin/sops");
      if (!res.ok) throw new Error("Failed to load SOPs");
      return (await res.json()).data as LibraryData;
    },
    staleTime: 15_000,
  });

  const sops = useMemo(() => data?.sops ?? [], [data]);
  const folders = useMemo(() => data?.folders ?? [], [data]);
  const allTags = useMemo(() => data?.tags ?? [], [data]);
  const folderNames = useMemo(() => folders.map((f) => f.name), [folders]);
  const activeFolderObj = useMemo(() => folders.find((f) => f.name === activeFolder), [folders, activeFolder]);
  const settingsFolder = useMemo(() => folders.find((f) => f.name === settingsFolderName) ?? null, [folders, settingsFolderName]);

  const visible = useMemo(
    () => sops.filter((s) =>
      (activeFolder === null || s.folder === activeFolder) &&
      (!statusFilter || s.status === statusFilter) &&
      (!tagFilter || s.tags.some((t) => t.toLowerCase() === tagFilter.toLowerCase()))
    ),
    [sops, activeFolder, statusFilter, tagFilter]
  );

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ["sops"] }), [queryClient]);
  const patchCache = useCallback(
    (updater: (s: SopListItem[]) => SopListItem[]) =>
      queryClient.setQueryData<LibraryData>(LIB_KEY, (old) => (old ? { ...old, sops: updater(old.sops) } : old)),
    [queryClient]
  );

  // ── SOP mutations ──
  const moveSop = useCallback(async (id: string, folder: string) => {
    setError("");
    patchCache((s) => s.map((x) => (x.id === id ? { ...x, folder } : x)));
    try {
      const res = await fetch(`/api/admin/sops/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder }) });
      if (!res.ok) throw new Error();
      refresh();
    } catch { setError("Move failed"); refresh(); }
  }, [patchCache, refresh]);

  const saveTags = useCallback(async (id: string, tags: string[]) => {
    setError("");
    patchCache((s) => s.map((x) => (x.id === id ? { ...x, tags } : x)));
    try {
      const res = await fetch(`/api/admin/sops/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags }) });
      if (!res.ok) throw new Error();
      refresh();
    } catch { setError("Could not update tags"); refresh(); }
  }, [patchCache, refresh]);

  const removeSop = useCallback(async (id: string) => {
    if (deleteConfirm !== id) { setDeleteConfirm(id); return; }
    setDeleteConfirm(null);
    setBusyId(id);
    setError("");
    try {
      await deleteSopRequest(id);
      refresh();
    } catch { setError("Delete failed"); } finally { setBusyId(null); }
  }, [deleteConfirm, refresh]);

  // Export to PDF via the browser print view (matches the dashboard exactly).
  const downloadSop = useCallback((id: string) => {
    window.open(`/sop-print/${id}`, "_blank", "noopener");
  }, []);

  const handleNew = useCallback(async () => {
    setCreating(true);
    setError("");
    try {
      const { id } = await createSopRequest({ doc: newSopDoc(), folder: activeFolder ?? "General" });
      refresh();
      onOpenSop(id);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create"); } finally { setCreating(false); }
  }, [activeFolder, refresh, onOpenSop]);

  // ── Folder mutations ──
  const createFolder = useCallback(async () => {
    const name = newFolderName.trim().slice(0, 100);
    setNewFolderName("");
    setNewFolderOpen(false);
    if (!name) return;
    setError("");
    try {
      const res = await fetch("/api/admin/sops/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Could not create folder"); return; }
      refresh();
      if (j.data?.name) setActiveFolder(j.data.name as string);
    } catch { setError("Could not create folder"); }
  }, [newFolderName, refresh]);

  const recolorFolder = useCallback(async (name: string, color: string) => {
    setError("");
    queryClient.setQueryData<LibraryData>(LIB_KEY, (old) =>
      old ? { ...old, folders: old.folders.map((f) => (f.name === name ? { ...f, color: color as SopFolder["color"] } : f)) } : old
    );
    try {
      const res = await fetch("/api/admin/sops/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, color }) });
      if (!res.ok) { setError("Could not recolor folder"); refresh(); }
    } catch { setError("Could not recolor folder"); refresh(); }
  }, [queryClient, refresh]);

  const renameFolder = useCallback(async (oldName: string, rawNew: string) => {
    const newName = rawNew.trim().slice(0, 100);
    if (!newName || newName === oldName) return;
    if (folderNames.includes(newName)) { setError("A folder with that name already exists"); return; }
    setError("");
    if (activeFolder === oldName) setActiveFolder(newName);
    try {
      const res = await fetch(`/api/admin/sops/folders/${encodeURIComponent(oldName)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Rename failed"); if (activeFolder === oldName) setActiveFolder(oldName); }
      refresh();
    } catch { setError("Rename failed"); refresh(); }
  }, [folderNames, activeFolder, refresh]);

  const deleteFolder = useCallback(async (name: string) => {
    setError("");
    if (activeFolder === name) setActiveFolder(null);
    try {
      const res = await fetch(`/api/admin/sops/folders/${encodeURIComponent(name)}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "Could not delete folder"); }
      refresh();
    } catch { setError("Could not delete folder"); refresh(); }
  }, [activeFolder, refresh]);

  // ── DnD ──
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );
  function onDragStart(e: DragStartEvent) { setActiveDragId(String(e.active.id)); }
  function onDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const overId = e.over ? String(e.over.id) : "";
    if (!overId.startsWith("folder:")) return;
    const target = overId.slice("folder:".length);
    const sop = sops.find((s) => s.id === String(e.active.id));
    if (sop && sop.folder !== target) moveSop(sop.id, target);
  }
  const activeDrag = activeDragId ? sops.find((s) => s.id === activeDragId) ?? null : null;

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card md:h-[calc(100vh-19rem)] md:min-h-[30rem] md:flex-row">
        {/* Folder rail */}
        <aside className="flex shrink-0 flex-col gap-2 border-b border-border/60 p-3 md:w-60 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folders</span>
            <button onClick={() => setNewFolderOpen((v) => !v)} className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="New folder">
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
          {newFolderOpen && (
            <div className="flex items-center gap-1 px-1">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") { setNewFolderOpen(false); setNewFolderName(""); } }}
                placeholder="Folder name"
                className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={createFolder} className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground" title="Create"><Check className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:overflow-y-auto">
            <FolderChip id="all" label="All SOPs" count={sops.length} active={activeFolder === null} droppable={false} isAll onSelect={() => setActiveFolder(null)} />
            {folders.map((f) => (
              <FolderChip key={f.name} id={`folder:${f.name}`} label={f.name} count={f.count} active={activeFolder === f.name} droppable color={f.color} onSelect={() => setActiveFolder(f.name)} />
            ))}
          </div>
          <p className="hidden px-1 text-[11px] leading-snug text-muted-foreground md:block">Tip: drag a SOP onto a folder to move it.</p>
        </aside>

        {/* Files pane */}
        <section className="flex min-h-0 flex-1 flex-col">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {activeFolder === null ? <Files className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Folder className={cn("h-4 w-4 shrink-0", colorOf(activeFolderObj?.color).icon)} />}
              <h3 className="truncate text-sm font-semibold text-foreground">{activeFolder ?? "All SOPs"}</h3>
              <span className="shrink-0 text-xs text-muted-foreground">{visible.length} item{visible.length === 1 ? "" : "s"}</span>
              {activeFolder !== null && (
                <button onClick={() => setSettingsFolderName(activeFolder)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="Folder settings (rename, color, delete)">
                  <Palette className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | "draft" | "published")} className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground">
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
              {allTags.length > 0 && (
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={cn("h-8 rounded-lg border bg-background px-2 text-xs", tagFilter ? "border-primary text-primary" : "border-input text-foreground")} title="Filter by tag">
                  <option value="">All tags</option>
                  {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
                </select>
              )}
              <div className="flex rounded-lg border border-border p-0.5">
                <button onClick={() => setView("grid")} className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")} title="Grid view"><LayoutGrid className="h-4 w-4" /></button>
                <button onClick={() => setView("list")} className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")} title="List view"><ListIcon className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-muted/20 px-4 py-2">
            <button onClick={handleNew} disabled={creating} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} New SOP
            </button>
            <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent">
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
            <span className="text-[11px] text-muted-foreground">New SOPs land in <span className="font-medium text-foreground">{activeFolder ?? "General"}</span></span>
            {error && <span className="w-full text-[11px] text-destructive">{error}</span>}
          </div>

          {/* Files */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <FileText className="h-9 w-9 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {sops.length === 0 ? "No SOPs yet. Create one, import a document, or ask the AI Assistant." : `No SOPs in “${activeFolder ?? "this view"}”.`}
                </p>
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((s) => (
                  <SopTile key={s.id} sop={s} view="grid" folders={folderNames} onOpen={() => onOpenSop(s.id)} onMove={(f) => moveSop(s.id, f)} onDelete={() => removeSop(s.id)} onSaveTags={(t) => saveTags(s.id, t)} onTagClick={(t) => setTagFilter((cur) => (cur.toLowerCase() === t.toLowerCase() ? "" : t))} onDownload={() => downloadSop(s.id)}activeTag={tagFilter} deleteConfirm={deleteConfirm === s.id} busy={busyId === s.id} />
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {visible.map((s) => (
                  <SopTile key={s.id} sop={s} view="list" folders={folderNames} onOpen={() => onOpenSop(s.id)} onMove={(f) => moveSop(s.id, f)} onDelete={() => removeSop(s.id)} onSaveTags={(t) => saveTags(s.id, t)} onTagClick={(t) => setTagFilter((cur) => (cur.toLowerCase() === t.toLowerCase() ? "" : t))} onDownload={() => downloadSop(s.id)}activeTag={tagFilter} deleteConfirm={deleteConfirm === s.id} busy={busyId === s.id} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {settingsFolder && (
        <FolderSettingsModal
          folder={settingsFolder}
          count={settingsFolder.count}
          onClose={() => setSettingsFolderName(null)}
          onRename={(newName) => renameFolder(settingsFolder.name, newName)}
          onRecolor={(c) => recolorFolder(settingsFolder.name, c)}
          onDelete={() => { deleteFolder(settingsFolder.name); setSettingsFolderName(null); }}
        />
      )}

      <ImportSopDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={(id) => { setImportOpen(false); onOpenSop(id); }} />

      <DragOverlay dropAnimation={null}>
        {activeDrag && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/50 bg-card px-3 py-2 shadow-xl">
            <FileText className="h-4 w-4 text-primary" />
            <span className="max-w-[200px] truncate text-sm font-medium text-foreground">{activeDrag.title || "Untitled SOP"}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
