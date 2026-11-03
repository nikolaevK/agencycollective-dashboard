"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  Folder,
  FolderPlus,
  FileText,
  FileType2,
  Check,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  Files,
  UploadCloud,
  Settings2,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone, badgeToneHover } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirm } from "@/components/ui/use-confirm";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import type { MediaDocType, MediaPlatform } from "@/lib/mediaDocuments";
import { MediaDocumentTile } from "./MediaDocumentTile";
import { MediaSelect } from "./MediaSelect";
import { MediaTagInput } from "./MediaTagInput";
import {
  DOC_TYPE_OPTIONS,
  IMPORTANT_STAR_CLS,
  MAX_SIZE,
  PLATFORM_OPTIONS,
  QUERY_KEY,
  colorOf,
  type DirectoryData,
  type DocView,
  type MediaFolderLite,
} from "./mediaDirectoryShared";

// Click-to-open dialogs — one chunk, fetched the first time one opens.
const FolderSettingsDialog = dynamic(
  () => import("./MediaDocumentDialogs").then((m) => m.FolderSettingsDialog),
  { ssr: false }
);
const DocumentReadersDialog = dynamic(
  () => import("./MediaDocumentDialogs").then((m) => m.DocumentReadersDialog),
  { ssr: false }
);
const MoveDocumentDialog = dynamic(
  () => import("./MediaDocumentDialogs").then((m) => m.MoveDocumentDialog),
  { ssr: false }
);
const DocumentTagsDialog = dynamic(
  () => import("./MediaDocumentDialogs").then((m) => m.DocumentTagsDialog),
  { ssr: false }
);

const TYPE_FILTER_OPTIONS = [{ value: "", label: "All types" }, ...DOC_TYPE_OPTIONS];

// ───────────────────────────────────────────────────────────── Folder chip ──

function FolderChip({
  id,
  label,
  count,
  active,
  droppable,
  color,
  important,
  isAll,
  onSelect,
}: {
  id: string;
  label: string;
  count: number;
  active: boolean;
  droppable: boolean;
  color?: string;
  important?: boolean;
  isAll?: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex max-w-[14rem] shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 md:w-full md:max-w-none",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        isOver && "bg-muted text-foreground ring-2 ring-inset ring-foreground/25"
      )}
    >
      {isAll ? (
        <Files className="size-4 shrink-0" />
      ) : (
        <Folder className={cn("size-4 shrink-0", colorOf(color).icon)} />
      )}
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate">{label}</span>
        {important && <Star role="img" aria-label="Important" className={cn("size-3 shrink-0", IMPORTANT_STAR_CLS)} />}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────── Skeletons ──

function FolderRailSkeleton() {
  return (
    <>
      {[60, 75, 50, 65].map((w, i) => (
        <div key={i} className="flex shrink-0 items-center gap-2 px-3 py-2 md:w-full">
          <Skeleton className="size-4 rounded-md" />
          <Skeleton className="h-4" style={{ width: `${w}%`, minWidth: "4rem" }} />
        </div>
      ))}
    </>
  );
}

function FilesSkeleton({ view }: { view: "grid" | "list" }) {
  if (view === "list") {
    return (
      <div className="divide-y overflow-hidden rounded-3xl border" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-5 rounded-md" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3" aria-busy="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-3xl border p-3.5">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Main component ──

export function MediaDocumentsDirectory({ isManager }: { isManager: boolean }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [importantOnly, setImportantOnly] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [settingsFolderName, setSettingsFolderName] = useState<string | null>(null);
  const [readersDoc, setReadersDoc] = useState<{ id: string; fileName: string } | null>(null);
  const [moveDocId, setMoveDocId] = useState<string | null>(null);
  const [tagsDocId, setTagsDocId] = useState<string | null>(null);

  const [uploadType, setUploadType] = useState<MediaDocType>("other");
  const [uploadPlatform, setUploadPlatform] = useState<"" | MediaPlatform>("");
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [osDragOver, setOsDragOver] = useState(false);
  const [error, setError] = useState("");

  // The rename draft lives in the tile being renamed (a keystroke re-renders
  // that tile only); the directory just knows which one it is.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<DirectoryData>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/admin/media-buyers/documents");
      if (!res.ok) throw new Error("Failed to load documents");
      const json = await res.json();
      return json.data ?? { documents: [], folders: [] };
    },
    staleTime: 20_000,
  });

  const documents = useMemo(() => data?.documents ?? [], [data]);
  // Latest list for the tiles' callbacks, which stay stable (memoised tiles).
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const serverFolders = useMemo<MediaFolderLite[]>(() => data?.folders ?? [], [data]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of documents) m.set(d.folder, (m.get(d.folder) ?? 0) + 1);
    return m;
  }, [documents]);

  // Folder list with color + importance + count. Source = metadata rows ∪
  // folders that documents reference (the latter default to gray until recolored).
  const folders = useMemo(() => {
    const map = new Map<string, { color: string; important: boolean }>();
    for (const f of serverFolders) map.set(f.name, { color: f.color, important: f.important });
    for (const d of documents) if (!map.has(d.folder)) map.set(d.folder, { color: "gray", important: false });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, color: v.color, important: v.important, count: counts.get(name) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [serverFolders, documents, counts]);

  const folderNames = useMemo(() => folders.map((f) => f.name), [folders]);
  const activeFolderObj = useMemo(
    () => folders.find((f) => f.name === activeFolder),
    [folders, activeFolder]
  );
  const settingsFolder = useMemo(
    () => folders.find((f) => f.name === settingsFolderName) ?? null,
    [folders, settingsFolderName]
  );

  const visibleDocs = useMemo(
    () =>
      documents.filter(
        (d) =>
          (activeFolder === null || d.folder === activeFolder) &&
          (!typeFilter || d.docType === typeFilter) &&
          (!importantOnly || d.important) &&
          (!tagFilter || d.tags.some((t) => t.toLowerCase() === tagFilter.toLowerCase()))
      ),
    [documents, activeFolder, typeFilter, importantOnly, tagFilter]
  );

  // All distinct tags across documents (case-insensitive, first-seen casing).
  const allTags = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of documents) for (const t of d.tags) {
      const key = t.toLowerCase();
      if (!map.has(key)) map.set(key, t);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [documents]);

  const uploadTarget = activeFolder ?? "general";

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["media-activity"] });
  }, [queryClient]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const moveDoc = useCallback(
    async (id: string, folder: string) => {
      setError("");
      // Optimistic — the file slides to the target folder immediately.
      queryClient.setQueryData<DirectoryData>(QUERY_KEY, (old) =>
        old
          ? { ...old, documents: old.documents.map((d) => (d.id === id ? { ...d, folder } : d)) }
          : old
      );
      try {
        const res = await fetch("/api/admin/media-buyers/documents", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, folder }),
        });
        if (!res.ok) throw new Error();
        queryClient.invalidateQueries({ queryKey: ["media-activity"] });
      } catch {
        setError("Move failed");
        refresh();
      }
    },
    [queryClient, refresh]
  );

  const setDocs = useCallback(
    (updater: (docs: DocView[]) => DocView[]) => {
      queryClient.setQueryData<DirectoryData>(QUERY_KEY, (old) =>
        old ? { ...old, documents: updater(old.documents) } : old
      );
    },
    [queryClient]
  );

  const toggleDocImportant = useCallback(
    async (id: string, important: boolean) => {
      setError("");
      setDocs((docs) => docs.map((d) => (d.id === id ? { ...d, important } : d)));
      try {
        const res = await fetch("/api/admin/media-buyers/documents", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, important }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error === "Forbidden" ? "Only the Head of Paid Media can mark items important" : "Could not update");
          refresh();
        } else {
          queryClient.invalidateQueries({ queryKey: ["media-activity"] });
        }
      } catch {
        setError("Could not update");
        refresh();
      }
    },
    [setDocs, refresh, queryClient]
  );

  const setDocTags = useCallback(
    async (id: string, tags: string[]) => {
      setError("");
      setDocs((docs) => docs.map((d) => (d.id === id ? { ...d, tags } : d)));
      try {
        const res = await fetch("/api/admin/media-buyers/documents", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, tags }),
        });
        if (!res.ok) {
          setError("Could not update tags");
          refresh();
        } else {
          queryClient.invalidateQueries({ queryKey: ["media-activity"] });
        }
      } catch {
        setError("Could not update tags");
        refresh();
      }
    },
    [setDocs, refresh, queryClient]
  );

  const acknowledge = useCallback(
    async (id: string, ack: boolean) => {
      setError("");
      setDocs((docs) =>
        docs.map((d) =>
          d.id === id
            ? { ...d, ackByMe: ack, ackCount: d.ackCount + (d.ackByMe === ack ? 0 : ack ? 1 : -1) }
            : d
        )
      );
      try {
        const res = await fetch(`/api/admin/media-buyers/documents/${id}/acknowledge`, {
          method: ack ? "POST" : "DELETE",
        });
        if (!res.ok) {
          setError("Could not update read status");
          refresh();
        } else {
          // Reconcile ackCount (aggregated across users) with the server so the
          // manager-visible read counts don't drift after concurrent reads.
          queryClient.invalidateQueries({ queryKey: QUERY_KEY });
          queryClient.invalidateQueries({ queryKey: ["media-activity"] });
          queryClient.invalidateQueries({ queryKey: ["media-readers", id] });
        }
      } catch {
        setError("Could not update read status");
        refresh();
      }
    },
    [setDocs, refresh, queryClient]
  );

  const toggleFolderImportant = useCallback(
    async (name: string, important: boolean) => {
      setError("");
      queryClient.setQueryData<DirectoryData>(QUERY_KEY, (old) =>
        old
          ? {
              ...old,
              folders: old.folders.some((f) => f.name === name)
                ? old.folders.map((f) => (f.name === name ? { ...f, important } : f))
                : [...old.folders, { name, color: "gray", important }],
            }
          : old
      );
      try {
        const res = await fetch("/api/admin/media-buyers/folders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, important }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error === "Forbidden" ? "Only the Head of Paid Media can mark folders important" : "Could not update folder");
          refresh();
        } else {
          queryClient.invalidateQueries({ queryKey: ["media-activity"] });
        }
      } catch {
        setError("Could not update folder");
        refresh();
      }
    },
    [queryClient, refresh]
  );

  const cancelRename = useCallback(() => setRenamingId(null), []);

  const commitRename = useCallback(
    async (id: string, value: string) => {
      setRenamingId((cur) => (cur === id ? null : cur));
      const next = value.trim();
      const current = documentsRef.current.find((d) => d.id === id);
      if (!next || !current || next === current.fileName) return;
      setError("");
      setBusyId(id);
      try {
        const res = await fetch("/api/admin/media-buyers/documents", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, fileName: next }),
        });
        if (res.ok) refresh();
        else setError("Rename failed");
      } finally {
        setBusyId(null);
      }
    },
    [refresh]
  );

  const removeDoc = useCallback(
    async (id: string) => {
      const doc = documentsRef.current.find((d) => d.id === id);
      const ok = await confirm({
        title: `Delete “${doc?.fileName ?? "this file"}”?`,
        description: "The file is removed for every media buyer. This can't be undone.",
        confirmText: "Delete",
        destructive: true,
      });
      if (!ok) return;
      setError("");
      setBusyId(id);
      try {
        const res = await fetch(`/api/admin/media-buyers/documents?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (res.ok) refresh();
        else {
          const json = await res.json().catch(() => ({}));
          setError(json.error || "Delete failed");
        }
      } finally {
        setBusyId(null);
      }
    },
    [confirm, refresh]
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setError("");
      const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
      const skipped = files.length - pdfs.length;
      if (pdfs.length === 0) {
        setError(skipped > 0 ? "Only PDF files are allowed" : "No file provided");
        return;
      }
      setUploading(true);
      let failed = 0;
      try {
        for (const file of pdfs) {
          if (file.size > MAX_SIZE) {
            failed++;
            continue;
          }
          const fd = new FormData();
          fd.append("file", file);
          fd.append("folder", uploadTarget);
          fd.append("docType", uploadType);
          if (uploadPlatform) fd.append("platform", uploadPlatform);
          if (uploadTags.length) fd.append("tags", JSON.stringify(uploadTags));
          const res = await fetch("/api/admin/media-buyers/documents", { method: "POST", body: fd });
          if (!res.ok) failed++;
        }
        refresh();
        if (failed > 0) setError(`${failed} file${failed === 1 ? "" : "s"} failed (too large or rejected)`);
        else if (skipped > 0) setError(`${skipped} non-PDF file${skipped === 1 ? "" : "s"} skipped`);
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [uploadTarget, uploadType, uploadPlatform, uploadTags, refresh]
  );

  // ── Folder mutations ───────────────────────────────────────────────────
  const setFolders = useCallback(
    (updater: (fs: MediaFolderLite[]) => MediaFolderLite[]) => {
      queryClient.setQueryData<DirectoryData>(QUERY_KEY, (old) =>
        old ? { ...old, folders: updater(old.folders) } : old
      );
    },
    [queryClient]
  );

  const createFolder = useCallback(() => {
    const name = newFolderName.trim().slice(0, 100);
    setNewFolderName("");
    setNewFolderOpen(false);
    if (!name) return;
    setError("");
    if (!folderNames.includes(name)) {
      setFolders((fs) => [...fs, { name, color: "gray", important: false }]); // optimistic
    }
    setActiveFolder(name);
    fetch("/api/admin/media-buyers/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then((res) => {
        // Reconcile on success only — an unconditional refresh races the
        // optimistic add and can flash the folder out and back in.
        if (res.ok) refresh();
        else setError("Could not create folder");
      })
      .catch(() => { setError("Could not create folder"); refresh(); });
  }, [newFolderName, folderNames, setFolders, refresh]);

  const recolorFolder = useCallback(
    (name: string, color: string) => {
      setError("");
      setFolders((fs) =>
        fs.some((f) => f.name === name)
          ? fs.map((f) => (f.name === name ? { ...f, color } : f))
          : [...fs, { name, color, important: false }]
      );
      fetch("/api/admin/media-buyers/folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      })
        .then((res) => { if (!res.ok) { setError("Could not recolor folder"); refresh(); } })
        .catch(() => { setError("Could not recolor folder"); refresh(); })
        .then(() => queryClient.invalidateQueries({ queryKey: ["media-activity"] }));
    },
    [setFolders, refresh, queryClient]
  );

  const renameFolder = useCallback(
    async (oldName: string, rawNew: string) => {
      const newName = rawNew.trim().slice(0, 100);
      if (!newName || newName === oldName) return;
      setError("");
      if (folderNames.includes(newName)) {
        setError("A folder with that name already exists");
        return;
      }
      // Optimistic — rename the folder and move its docs in the cache.
      queryClient.setQueryData<DirectoryData>(QUERY_KEY, (old) =>
        old
          ? {
              folders: old.folders.map((f) => (f.name === oldName ? { ...f, name: newName } : f)),
              documents: old.documents.map((d) => (d.folder === oldName ? { ...d, folder: newName } : d)),
            }
          : old
      );
      if (activeFolder === oldName) setActiveFolder(newName);
      try {
        const res = await fetch("/api/admin/media-buyers/folders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldName, newName }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error || "Rename failed");
          if (activeFolder === oldName) setActiveFolder(oldName);
          refresh();
        } else {
          queryClient.invalidateQueries({ queryKey: ["media-activity"] });
        }
      } catch {
        setError("Rename failed");
        refresh();
      }
    },
    [folderNames, activeFolder, queryClient, refresh]
  );

  const deleteFolder = useCallback(
    async (name: string) => {
      setError("");
      setFolders((fs) => fs.filter((f) => f.name !== name)); // optimistic
      if (activeFolder === name) setActiveFolder(null);
      try {
        const res = await fetch(`/api/admin/media-buyers/folders?name=${encodeURIComponent(name)}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setError(json.error || "Could not delete folder");
          refresh();
        } else {
          queryClient.invalidateQueries({ queryKey: ["media-activity"] });
        }
      } catch {
        setError("Could not delete folder");
        refresh();
      }
    },
    [setFolders, activeFolder, refresh, queryClient]
  );

  // ── DnD ────────────────────────────────────────────────────────────────
  // Mouse: drag after a 6px move. Touch: drag only after a 200ms press, so a
  // finger swipe scrolls the list (and taps on action buttons) instead of
  // accidentally starting a drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  function onDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const overId = e.over ? String(e.over.id) : "";
    if (!overId.startsWith("folder:")) return;
    const target = overId.slice("folder:".length);
    const doc = documents.find((d) => d.id === String(e.active.id));
    if (doc && doc.folder !== target) moveDoc(doc.id, target);
  }

  const activeDoc = activeDragId ? documents.find((d) => d.id === activeDragId) ?? null : null;

  // Native OS-file drop on the files pane.
  const onOsDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setOsDragOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length) uploadFiles(files);
    },
    [uploadFiles]
  );

  // The tag filter keeps whatever casing a clicked chip had — show it as the
  // matching option (tags list first-seen casing), or as its own option if
  // no document carries it any more.
  const tagSelectValue = tagFilter
    ? allTags.find((t) => t.toLowerCase() === tagFilter.toLowerCase()) ?? tagFilter
    : "";
  const tagSelectOptions = useMemo(() => {
    const tags = tagSelectValue && !allTags.includes(tagSelectValue) ? [...allTags, tagSelectValue] : allTags;
    return [{ value: "", label: "All tags" }, ...tags.map((t) => ({ value: t, label: `#${t}` }))];
  }, [allTags, tagSelectValue]);

  const moveDocObj = moveDocId ? documents.find((d) => d.id === moveDocId) ?? null : null;
  const tagsDocObj = tagsDocId ? documents.find((d) => d.id === tagsDocId) ?? null : null;

  const showReaders = useCallback((id: string, fileName: string) => setReadersDoc({ id, fileName }), []);
  const toggleTagFilter = useCallback(
    (t: string) => setTagFilter((cur) => (cur.toLowerCase() === t.toLowerCase() ? "" : t)),
    []
  );

  const renderTile = (doc: DocView, tileView: "grid" | "list") => (
    <MediaDocumentTile
      key={doc.id}
      doc={doc}
      view={tileView}
      isManager={isManager}
      renaming={renamingId === doc.id}
      onStartRename={setRenamingId}
      onCommitRename={commitRename}
      onCancelRename={cancelRename}
      onOpenMove={setMoveDocId}
      onOpenTags={setTagsDocId}
      onDelete={removeDoc}
      onToggleImportant={toggleDocImportant}
      onAcknowledge={acknowledge}
      onShowReaders={showReaders}
      onTagClick={toggleTagFilter}
      activeTag={tagFilter}
      busy={busyId === doc.id}
    />
  );

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <Card className="flex flex-col md:h-[calc(100vh-17rem)] md:min-h-[30rem] md:flex-row">
        {/* ── Folder rail ── */}
        <aside className="flex shrink-0 flex-col gap-2 border-b p-3 md:w-60 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between pl-2">
            <span className="text-xs font-medium text-muted-foreground">Folders</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setNewFolderOpen((v) => !v)}
              className="text-muted-foreground"
              title="New folder"
              aria-label="New folder"
              aria-expanded={newFolderOpen}
            >
              <FolderPlus />
            </Button>
          </div>

          {newFolderOpen && (
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") { setNewFolderOpen(false); setNewFolderName(""); }
                }}
                placeholder="Folder name"
                aria-label="Folder name"
                className="h-8"
              />
              <Button type="button" size="icon-sm" onClick={createFolder} title="Create" aria-label="Create folder">
                <Check />
              </Button>
            </div>
          )}

          <nav
            aria-label="Folders"
            className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-col md:overflow-x-visible md:overflow-y-auto md:px-0"
          >
            {isLoading ? (
              <FolderRailSkeleton />
            ) : (
              <>
                <FolderChip
                  id="all"
                  label="All Files"
                  count={documents.length}
                  active={activeFolder === null}
                  droppable={false}
                  isAll
                  onSelect={() => setActiveFolder(null)}
                />
                {folders.map((f) => (
                  <FolderChip
                    key={f.name}
                    id={`folder:${f.name}`}
                    label={f.name}
                    count={f.count}
                    active={activeFolder === f.name}
                    droppable
                    color={f.color}
                    important={f.important}
                    onSelect={() => setActiveFolder(f.name)}
                  />
                ))}
              </>
            )}
          </nav>

          <p className="mt-auto hidden px-2 text-xs leading-snug text-muted-foreground md:block">
            Tip: drag a file onto a folder to move it.
          </p>
        </aside>

        {/* ── Files pane ── */}
        <section
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          onDragOver={(e) => { e.preventDefault(); setOsDragOver(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setOsDragOver(false); }}
          onDrop={onOsDrop}
        >
          {/* Header / toolbar. The title group's min width makes the filters
              wrap to their own row on narrow panes — at min-w-0 it shrank
              below its icon + item count and they overlapped the filters. */}
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="flex min-w-[10rem] flex-1 items-center gap-2">
              {activeFolder === null ? (
                <Files className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className={cn("size-4 shrink-0", colorOf(activeFolderObj?.color).icon)} />
              )}
              <h3 className="truncate text-sm font-semibold text-foreground">
                {activeFolder ?? "All Files"}
              </h3>
              {!isLoading && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {visibleDocs.length} item{visibleDocs.length === 1 ? "" : "s"}
                </span>
              )}
              {activeFolder !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setSettingsFolderName(activeFolder)}
                  className="shrink-0 text-muted-foreground"
                  title="Folder settings (rename, color, delete)"
                  aria-label="Folder settings"
                >
                  <Settings2 />
                </Button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setImportantOnly((v) => !v)}
                aria-pressed={importantOnly}
                className={cn(importantOnly && cn(badgeTone.warning, badgeToneHover.warning))}
                title="Show important only"
                aria-label="Show important only"
              >
                <Star className={cn(importantOnly && IMPORTANT_STAR_CLS)} />
                <span className="hidden sm:inline">Important</span>
              </Button>
              <MediaSelect
                value={typeFilter}
                onValueChange={setTypeFilter}
                options={TYPE_FILTER_OPTIONS}
                aria-label="Filter by type"
              />
              {allTags.length > 0 && (
                <MediaSelect
                  value={tagSelectValue}
                  onValueChange={setTagFilter}
                  options={tagSelectOptions}
                  aria-label="Filter by tag"
                  title="Filter by tag"
                  className="max-w-[12rem]"
                />
              )}
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={view}
                onValueChange={(v) => {
                  // Radix sends "" when the active item is re-clicked — keep the view.
                  if (v) setView(v as "grid" | "list");
                }}
                aria-label="View"
              >
                <ToggleGroupItem value="grid" title="Grid view" aria-label="Grid view">
                  <LayoutGrid />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" title="List view" aria-label="List view">
                  <ListIcon />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {/* Upload bar */}
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
            <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden"
              onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) uploadFiles(fs); }} />
            <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              Upload PDF
            </Button>
            <span className="min-w-0 max-w-[10rem] truncate text-xs text-muted-foreground" title={uploadTarget}>
              → <span className="font-medium text-foreground">{uploadTarget}</span>
            </span>
            <MediaSelect
              value={uploadType}
              onValueChange={(v) => setUploadType(v as MediaDocType)}
              options={DOC_TYPE_OPTIONS}
              aria-label="Document type for uploads"
            />
            <MediaSelect
              value={uploadPlatform}
              onValueChange={(v) => setUploadPlatform(v as "" | MediaPlatform)}
              options={PLATFORM_OPTIONS}
              aria-label="Platform for uploads"
            />
            <div className="w-full sm:w-auto sm:min-w-[160px] sm:flex-1">
              <MediaTagInput
                tags={uploadTags}
                onChange={setUploadTags}
                placeholder="Add tags for uploads…"
                aria-label="Tags for uploads"
              />
            </div>
            {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
          </div>

          {/* Files */}
          <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
            {osDragOver && (
              <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-ring bg-background/90 backdrop-blur-sm">
                <UploadCloud className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Drop to upload to “{uploadTarget}”</p>
              </div>
            )}

            {isLoading ? (
              <FilesSkeleton view={view} />
            ) : isError && !data ? (
              <QueryErrorState
                title="Couldn't load documents"
                onRetry={() => refetch()}
                className="bg-transparent py-12 shadow-none ring-0"
              />
            ) : visibleDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                <UploadCloud className="size-8 text-muted-foreground/50" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  {documents.length === 0
                    ? "No documents yet. Drop a PDF here or generate one in the AI Assistant."
                    : `No files in “${activeFolder ?? "this view"}”. Drag files here or use Upload.`}
                </p>
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
                {visibleDocs.map((doc) => renderTile(doc, "grid"))}
              </div>
            ) : (
              <div className="divide-y overflow-hidden rounded-3xl border">
                {visibleDocs.map((doc) => renderTile(doc, "list"))}
              </div>
            )}
          </div>
        </section>
      </Card>

      {/* Folder settings (rename / color / important / delete) */}
      {settingsFolder && (
        <FolderSettingsDialog
          folder={settingsFolder}
          count={settingsFolder.count}
          isManager={isManager}
          onClose={() => setSettingsFolderName(null)}
          onRename={(newName) => renameFolder(settingsFolder.name, newName)}
          onRecolor={(c) => recolorFolder(settingsFolder.name, c)}
          onToggleImportant={(next) => toggleFolderImportant(settingsFolder.name, next)}
          onDelete={() => { deleteFolder(settingsFolder.name); setSettingsFolderName(null); }}
        />
      )}

      {/* Read receipts (manager) */}
      {readersDoc && (
        <DocumentReadersDialog
          docId={readersDoc.id}
          fileName={readersDoc.fileName}
          onClose={() => setReadersDoc(null)}
        />
      )}

      {/* Move to folder — a new name creates the folder */}
      {moveDocObj && (
        <MoveDocumentDialog
          fileName={moveDocObj.fileName}
          currentFolder={moveDocObj.folder}
          folders={folderNames}
          onClose={() => setMoveDocId(null)}
          onMove={(folder) => moveDoc(moveDocObj.id, folder)}
        />
      )}

      {/* Edit tags */}
      {tagsDocObj && (
        <DocumentTagsDialog
          fileName={tagsDocObj.fileName}
          initialTags={tagsDocObj.tags}
          onClose={() => setTagsDocId(null)}
          onSave={(tags) => setDocTags(tagsDocObj.id, tags)}
        />
      )}

      {confirmDialog}

      {/* Drag preview */}
      <DragOverlay dropAnimation={null}>
        {activeDoc && (
          <div className="flex items-center gap-2 rounded-2xl bg-popover px-3 py-2 shadow-lg ring-1 ring-foreground/10">
            {activeDoc.mimeType === "text/markdown" ? (
              <FileType2 className="size-4 text-muted-foreground" />
            ) : (
              <FileText className="size-4 text-muted-foreground" />
            )}
            <span className="max-w-[200px] truncate text-sm font-medium text-foreground">{activeDoc.fileName}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
