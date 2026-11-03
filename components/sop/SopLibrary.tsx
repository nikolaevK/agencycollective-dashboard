"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
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
  Check,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  FolderInput,
  GripVertical,
  Settings2,
  Plus,
  Tag,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/use-confirm";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { createSopRequest, deleteSopRequest, newSopDoc } from "@/hooks/useSops";
import { colorOf } from "@/components/sop/sopFolderColors";
import type { SopListItem } from "@/lib/sop";
import type { SopFolder } from "@/lib/sopFolders";

// Click-to-open dialogs + the tag filter's Radix Select load on demand.
const FolderSettingsDialog = dynamic(
  () => import("@/components/sop/SopLibraryDialogs").then((m) => m.FolderSettingsDialog),
  { ssr: false }
);
const MoveSopDialog = dynamic(() => import("@/components/sop/SopLibraryDialogs").then((m) => m.MoveSopDialog), {
  ssr: false,
});
const SopTagsDialog = dynamic(() => import("@/components/sop/SopLibraryDialogs").then((m) => m.SopTagsDialog), {
  ssr: false,
});
const ImportSopDialog = dynamic(
  () => import("@/components/sop/ImportSopDialog").then((m) => m.ImportSopDialog),
  { ssr: false }
);
const SopTagFilter = dynamic(() => import("@/components/sop/SopTagFilter").then((m) => m.SopTagFilter), {
  ssr: false,
  loading: () => <Skeleton className="h-8 w-[8.5rem] rounded-3xl" />,
});

const LIB_KEY = ["sops", null, null] as const;

interface LibraryData {
  sops: SopListItem[];
  folders: SopFolder[];
  tags: string[];
}

type StatusFilter = "" | "draft" | "published";

function formatDate(raw: string): string {
  if (!raw) return "";
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Columns follow the files pane, not the viewport: from md up the app sidebar
// and the folder rail sit beside it, so it's ~250px wide at md.
const FILE_GRID = "grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

/** Neutral file glyph tile (no colored icon tiles in the kit). */
const ICON_TILE =
  "flex shrink-0 items-center justify-center rounded-2xl bg-background text-muted-foreground ring-1 ring-foreground/5 dark:bg-muted/60 dark:ring-foreground/10";

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
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "group flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30 md:w-full",
        active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        isOver && "bg-muted text-foreground ring-2 ring-ring"
      )}
    >
      <span className={cn("shrink-0", isAll ? (active ? "text-foreground" : "text-muted-foreground") : colorOf(color).icon)}>
        {isAll ? <Files className="size-4" /> : <Folder className="size-4" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

// ── Draggable SOP tile ────────────────────────────────────────────────────────
function SopTile({ sop, view, onOpen, onMove, onDelete, onEditTags, onTagClick, onDownload, activeTag, busy }: {
  sop: SopListItem;
  view: "grid" | "list";
  onOpen: () => void;
  onMove: () => void;
  onDelete: () => void;
  onEditTags: () => void;
  onTagClick: (tag: string) => void;
  onDownload: () => void;
  activeTag: string;
  busy: boolean;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: sop.id });

  // Controls inside the draggable tile must not start a drag.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const noDrag = { onMouseDown: stop, onTouchStart: stop, onPointerDown: stop };

  const titleNode = (
    <button
      {...noDrag}
      type="button"
      onClick={onOpen}
      className="max-w-full truncate rounded-md text-left text-sm font-medium text-foreground outline-none hover:underline hover:underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/30"
      title={sop.title}
    >
      {sop.title || "Untitled SOP"}
    </button>
  );

  const badges = (sop.status === "published" || sop.tags.length > 0) && (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {sop.status === "published" && <StatusBadge tone="success">Published</StatusBadge>}
      {sop.tags.map((t) => {
        const active = activeTag.toLowerCase() === t.toLowerCase();
        return (
          <button
            key={t}
            {...noDrag}
            type="button"
            onClick={() => onTagClick(t)}
            title={`Filter by "${t}"`}
            aria-pressed={active}
            className={cn(
              badgeVariants({ variant: active ? "default" : "outline" }),
              "max-w-full gap-1 font-normal",
              !active && "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Tag />
            <span className="truncate">{t}</span>
          </button>
        );
      })}
    </div>
  );

  const iconBtn = "size-7 text-muted-foreground";
  const actions = (
    <div
      className={cn(
        "flex shrink-0 items-center",
        view === "grid"
          ? "opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100"
          : "max-sm:ml-auto"
      )}
    >
      <Button {...noDrag} type="button" variant="ghost" size="icon-sm" onClick={onOpen} className={iconBtn} title="Open in builder" aria-label="Open in builder">
        <Pencil className="size-3.5" />
      </Button>
      <Button {...noDrag} type="button" variant="ghost" size="icon-sm" onClick={onDownload} className={iconBtn} title="Export to PDF" aria-label="Export to PDF">
        <Printer className="size-3.5" />
      </Button>
      <Button {...noDrag} type="button" variant="ghost" size="icon-sm" onClick={onMove} className={iconBtn} title="Move to folder" aria-label="Move to folder">
        <FolderInput className="size-3.5" />
      </Button>
      <Button {...noDrag} type="button" variant="ghost" size="icon-sm" onClick={onEditTags} className={iconBtn} title="Edit tags" aria-label="Edit tags">
        <Tag className="size-3.5" />
      </Button>
      <Button
        {...noDrag}
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onDelete}
        disabled={busy}
        className={cn(iconBtn, "hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20")}
        title="Delete"
        aria-label="Delete"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </Button>
    </div>
  );

  if (view === "grid") {
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        className={cn(
          "group relative flex cursor-grab flex-col gap-3 rounded-2xl bg-muted/40 p-3 transition-colors hover:bg-muted/70 active:cursor-grabbing",
          isDragging && "opacity-40"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className={cn(ICON_TILE, "size-9")}><FileText className="size-4" /></div>
          {actions}
        </div>
        <div className="min-w-0">
          <div className="min-w-0">{titleNode}</div>
          {sop.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{sop.description}</p>}
          {badges}
        </div>
        <p className="mt-auto text-xs text-muted-foreground">Updated {formatDate(sop.updatedAt)}</p>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={cn(
        "group flex cursor-grab flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-2 py-2 transition-colors hover:bg-muted/60 active:cursor-grabbing sm:flex-nowrap sm:px-3",
        isDragging && "opacity-40"
      )}
    >
      <GripVertical className="hidden size-4 shrink-0 text-muted-foreground/50 sm:block" />
      <div className={cn(ICON_TILE, "size-8")}><FileText className="size-4" /></div>
      {/* Phones: the text takes the row, the actions wrap below it. */}
      <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-2.75rem)]">
        <div className="min-w-0">{titleNode}</div>
        <p className="truncate text-xs text-muted-foreground">{sop.folder} · Updated {formatDate(sop.updatedAt)}</p>
        {badges}
      </div>
      {actions}
    </div>
  );
}

function FilesSkeleton({ view }: { view: "grid" | "list" }) {
  if (view === "list") {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2 sm:px-3">
            <Skeleton className="size-8 rounded-2xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48 max-w-full rounded-full" />
              <Skeleton className="h-3 w-32 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={cn("grid gap-3", FILE_GRID)}>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <Skeleton key={i} className="h-36 rounded-2xl" />
      ))}
    </div>
  );
}

// ── Main library ──────────────────────────────────────────────────────────────
export function SopLibrary({ onOpenSop }: { onOpenSop: (id: string) => void }) {
  const queryClient = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [tagFilter, setTagFilter] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [settingsFolderName, setSettingsFolderName] = useState<string | null>(null);
  const [moveFor, setMoveFor] = useState<SopListItem | null>(null);
  const [tagsFor, setTagsFor] = useState<SopListItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Mounted from the first open on (closed = renders nothing), so a picked
  // file survives close + reopen like before the dialog was lazy-loaded.
  const [importUsed, setImportUsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data, isLoading, isError, refetch } = useQuery<LibraryData>({
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

  const removeSop = useCallback(async (sop: SopListItem) => {
    const ok = await confirm({
      title: `Delete “${sop.title || "Untitled SOP"}”?`,
      description: "This SOP will be deleted. This can't be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    const id = sop.id;
    setBusyId(id);
    setError("");
    try {
      await deleteSopRequest(id);
      refresh();
    } catch { setError("Delete failed"); } finally { setBusyId(null); }
  }, [confirm, refresh]);

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

  const tileProps = (s: SopListItem) => ({
    sop: s,
    onOpen: () => onOpenSop(s.id),
    onMove: () => setMoveFor(s),
    onDelete: () => removeSop(s),
    onEditTags: () => setTagsFor(s),
    onTagClick: (t: string) => setTagFilter((cur) => (cur.toLowerCase() === t.toLowerCase() ? "" : t)),
    onDownload: () => downloadSop(s.id),
    activeTag: tagFilter,
    busy: busyId === s.id,
  });

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <Card className="flex flex-col md:h-[calc(100vh-17rem)] md:min-h-[30rem] md:flex-row">
        {/* Folder rail */}
        <aside className="flex shrink-0 flex-col gap-2 border-b p-3 md:w-52 md:border-b-0 md:border-r lg:w-60">
          <div className="flex items-center justify-between pl-2">
            <span className="text-xs font-medium text-muted-foreground">Folders</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setNewFolderOpen((v) => !v)}
              aria-expanded={newFolderOpen}
              className="size-7 text-muted-foreground"
              title="New folder"
              aria-label="New folder"
            >
              <FolderPlus className="size-4" />
            </Button>
          </div>
          {newFolderOpen && (
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") { setNewFolderOpen(false); setNewFolderName(""); } }}
                placeholder="Folder name"
                aria-label="Folder name"
                className="h-8"
              />
              <Button type="button" size="icon-sm" onClick={createFolder} title="Create" aria-label="Create folder">
                <Check />
              </Button>
            </div>
          )}
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:min-h-0 md:flex-1 md:flex-col md:overflow-x-visible md:overflow-y-auto md:px-0">
            <FolderChip id="all" label="All SOPs" count={sops.length} active={activeFolder === null} droppable={false} isAll onSelect={() => setActiveFolder(null)} />
            {folders.map((f) => (
              <FolderChip key={f.name} id={`folder:${f.name}`} label={f.name} count={f.count} active={activeFolder === f.name} droppable color={f.color} onSelect={() => setActiveFolder(f.name)} />
            ))}
          </div>
          <p className="hidden px-2 text-xs leading-snug text-muted-foreground md:block">Tip: drag a SOP onto a folder to move it.</p>
        </aside>

        {/* Files pane */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {activeFolder === null ? <Files className="size-4 shrink-0 text-muted-foreground" /> : <Folder className={cn("size-4 shrink-0", colorOf(activeFolderObj?.color).icon)} />}
              <h3 className="truncate text-sm font-medium text-foreground">{activeFolder ?? "All SOPs"}</h3>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{visible.length} item{visible.length === 1 ? "" : "s"}</span>
              {activeFolder !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSettingsFolderName(activeFolder)}
                  className="size-7 shrink-0 text-muted-foreground"
                  title="Folder settings (rename, color, delete)"
                  aria-label="Folder settings"
                >
                  <Settings2 className="size-4" />
                </Button>
              )}
            </div>
            {/* Phones: layout toggle beside the title, filters on their own row. */}
            <div className="flex w-full flex-wrap items-center gap-2 max-sm:order-1 sm:ml-auto sm:w-auto">
              <Tabs value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : (v as StatusFilter))}>
                <TabsList className="h-8" aria-label="Filter by status">
                  <TabsTrigger value="all" className="px-2.5 text-xs">All</TabsTrigger>
                  <TabsTrigger value="draft" className="px-2.5 text-xs">Draft</TabsTrigger>
                  <TabsTrigger value="published" className="px-2.5 text-xs">Published</TabsTrigger>
                </TabsList>
              </Tabs>
              {allTags.length > 0 && <SopTagFilter tags={allTags} value={tagFilter} onChange={setTagFilter} />}
            </div>
            <Tabs value={view} onValueChange={(v) => setView(v as "grid" | "list")} className="ml-auto sm:ml-0">
              <TabsList className="h-8" aria-label="Layout">
                <TabsTrigger value="grid" className="px-2" title="Grid view" aria-label="Grid view">
                  <LayoutGrid className="size-3.5" />
                </TabsTrigger>
                <TabsTrigger value="list" className="px-2" title="List view" aria-label="List view">
                  <ListIcon className="size-3.5" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Action bar */}
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
            <Button type="button" size="sm" onClick={handleNew} disabled={creating}>
              {creating ? <Loader2 className="animate-spin" /> : <Plus />}
              New SOP
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setImportUsed(true); setImportOpen(true); }}>
              <Upload />
              Import
            </Button>
            <span className="text-xs text-muted-foreground">New SOPs land in <span className="font-medium text-foreground">{activeFolder ?? "General"}</span></span>
            {error && <span role="alert" className="w-full text-xs text-destructive">{error}</span>}
          </div>

          {/* Files */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4">
            {isLoading ? (
              <FilesSkeleton view={view} />
            ) : isError && !data ? (
              <QueryErrorState
                title="Couldn't load SOPs"
                message="Something went wrong while loading the library. Your session may have expired."
                onRetry={() => void refetch()}
                className="bg-transparent shadow-none ring-0 dark:ring-0"
              />
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
                <FileText className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {sops.length === 0 ? "No SOPs yet. Create one, import a document, or ask the AI Assistant." : `No SOPs in “${activeFolder ?? "this view"}”.`}
                </p>
              </div>
            ) : view === "grid" ? (
              <div className={cn("grid gap-3", FILE_GRID)}>
                {visible.map((s) => (
                  <SopTile key={s.id} view="grid" {...tileProps(s)} />
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {visible.map((s) => (
                  <SopTile key={s.id} view="list" {...tileProps(s)} />
                ))}
              </div>
            )}
          </div>
        </section>
      </Card>

      {settingsFolder && (
        <FolderSettingsDialog
          folder={settingsFolder}
          count={settingsFolder.count}
          onClose={() => setSettingsFolderName(null)}
          onRename={(newName) => renameFolder(settingsFolder.name, newName)}
          onRecolor={(c) => recolorFolder(settingsFolder.name, c)}
          onDelete={() => { deleteFolder(settingsFolder.name); setSettingsFolderName(null); }}
        />
      )}
      {moveFor && (
        <MoveSopDialog
          key={moveFor.id}
          sop={moveFor}
          folders={folderNames}
          onClose={() => setMoveFor(null)}
          onMove={(f) => moveSop(moveFor.id, f)}
        />
      )}
      {tagsFor && (
        <SopTagsDialog
          key={tagsFor.id}
          sop={tagsFor}
          onClose={() => setTagsFor(null)}
          onSave={(t) => saveTags(tagsFor.id, t)}
        />
      )}

      {importUsed && (
        <ImportSopDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={(id) => { setImportOpen(false); onOpenSop(id); }} />
      )}
      {confirmDialog}

      <DragOverlay dropAnimation={null}>
        {activeDrag && (
          <div className="flex items-center gap-2 rounded-2xl bg-popover px-3 py-2 shadow-lg ring-1 ring-foreground/10">
            <FileText className="size-4 text-muted-foreground" />
            <span className="max-w-[200px] truncate text-sm font-medium text-foreground">{activeDrag.title || "Untitled SOP"}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
