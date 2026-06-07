"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
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
  FileText,
  FileType2,
  Download,
  Eye,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  LayoutGrid,
  List as ListIcon,
  Files,
  UploadCloud,
  FolderInput,
  GripVertical,
  Palette,
  Trash,
  Star,
  Plus,
  Users,
  CheckCircle2,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaDocument, MediaDocType, MediaPlatform } from "@/lib/mediaDocuments";

// Folder color palette. Keys are stored in the DB (lib/mediaFolders.ts); the
// class strings are listed in full so Tailwind keeps them in the build.
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

function colorOf(c: string | undefined): { icon: string; active: string; swatch: string } {
  return FOLDER_COLORS[(c as FolderColor) in FOLDER_COLORS ? (c as FolderColor) : "gray"];
}

const MAX_TAGS = 12;
const MAX_TAG_LEN = 40;

/** Chips + free-text input for editing a list of tags. */
function TagInput({
  tags,
  onChange,
  placeholder = "Add tags…",
  autoFocus,
}: {
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
      if (tag && next.length < MAX_TAGS && !next.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        next.push(tag);
      }
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

/** Close a modal on Escape while it's open. */
function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}

interface MediaFolderLite {
  name: string;
  color: string;
  important: boolean;
}

/** A document enriched by the API with this viewer's read state + total reads. */
type DocView = MediaDocument & { ackCount: number; ackByMe: boolean };

// Local option lists (cannot import from lib/mediaDocuments at runtime — it
// pulls in the server-only DB client).
const DOC_TYPE_OPTIONS: { value: MediaDocType; label: string }[] = [
  { value: "sop", label: "SOP" },
  { value: "creative_brief", label: "Creative Brief" },
  { value: "campaign_brief", label: "Campaign Brief" },
  { value: "account_audit", label: "Account Audit" },
  { value: "media_plan", label: "Media Plan" },
  { value: "report", label: "Report" },
  { value: "post_mortem", label: "Post-mortem" },
  { value: "other", label: "Other" },
];

const PLATFORM_OPTIONS: { value: "" | MediaPlatform; label: string }[] = [
  { value: "", label: "No platform" },
  { value: "meta", label: "Meta" },
  { value: "tiktok", label: "TikTok" },
  { value: "google", label: "Google" },
  { value: "cross", label: "Cross-platform" },
];

const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPE_OPTIONS.map((o) => [o.value, o.label])
);

const MAX_SIZE = 10 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(raw: string): string {
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface DirectoryData {
  documents: DocView[];
  folders: MediaFolderLite[];
}

const QUERY_KEY = ["media-documents"] as const;

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
  const c = colorOf(color);
  return (
    <button
      ref={setNodeRef}
      onClick={onSelect}
      className={cn(
        "group flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors md:w-full",
        active
          ? isAll
            ? "bg-primary/10 text-primary"
            : c.active
          : "text-foreground hover:bg-accent",
        isOver && "ring-2 ring-primary ring-offset-1 ring-offset-card bg-primary/15"
      )}
    >
      <span className={cn("shrink-0", isAll ? (active ? "text-primary" : "text-muted-foreground") : c.icon)}>
        {isAll ? <Files className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate font-medium">{label}</span>
        {important && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
          active ? "bg-foreground/10" : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────── Folder settings ──

function FolderSettingsModal({
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
  useEscape(true, onClose);

  function pickColor(c: FolderColor) {
    setColor(c);
    onRecolor(c); // live — applies immediately
  }

  function toggleImportant() {
    const next = !important;
    setImportant(next);
    onToggleImportant(next); // live
  }

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
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
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
              onClick={() => pickColor(k)}
              className={cn(
                "h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110",
                FOLDER_COLORS[k].swatch,
                color === k && "ring-2 ring-foreground"
              )}
              title={k}
              aria-label={`Color ${k}`}
            />
          ))}
        </div>

        {isManager && (
          <button
            onClick={toggleImportant}
            className="mt-4 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Star className={cn("h-4 w-4", important ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              Mark folder important
            </span>
            <span className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors", important ? "bg-amber-400" : "bg-muted")}>
              <span className={cn("pointer-events-none mt-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform", important ? "translate-x-4 ml-0.5" : "translate-x-0.5")} />
            </span>
          </button>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            onClick={() => { if (count === 0) onDelete(); }}
            disabled={count > 0}
            title={count > 0 ? "Folder must be empty to delete" : "Delete folder"}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash className="h-3.5 w-3.5" />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent">
              Cancel
            </button>
            <button onClick={save} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              Save
            </button>
          </div>
        </div>
        {count > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            This folder has {count} file{count === 1 ? "" : "s"}. Move or delete them to remove the folder.
          </p>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Read receipts ──

interface DocumentReader {
  adminId: string;
  adminName: string | null;
  readAt: string;
}

function ReadersModal({ docId, fileName, onClose }: { docId: string; fileName: string; onClose: () => void }) {
  useEscape(true, onClose);
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

  function fmt(raw: string): string {
    const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Read receipts</h3>
            <p className="truncate text-xs text-muted-foreground" title={fileName}>{fileName}</p>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : readers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No one has marked this as read yet.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {readers.map((r) => (
              <li key={r.adminId} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-accent">
                <span className="flex items-center gap-2 truncate text-sm text-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  {r.adminName ?? r.adminId}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{fmt(r.readAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── File tile ──

function FileTile({
  doc,
  view,
  isManager,
  folders,
  renaming,
  renameValue,
  setRenameValue,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onMove,
  onDelete,
  onToggleImportant,
  onAcknowledge,
  onUnacknowledge,
  onShowReaders,
  onSaveTags,
  onTagClick,
  activeTag,
  deleteConfirm,
  busy,
}: {
  doc: DocView;
  view: "grid" | "list";
  isManager: boolean;
  folders: string[];
  renaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onMove: (folder: string) => void;
  onDelete: () => void;
  onToggleImportant: (next: boolean) => void;
  onAcknowledge: () => void;
  onUnacknowledge: () => void;
  onShowReaders: () => void;
  onSaveTags: (tags: string[]) => void;
  onTagClick: (tag: string) => void;
  activeTag: string;
  deleteConfirm: boolean;
  busy: boolean;
}) {
  // Only spread drag listeners (not `attributes`) — `attributes` would add
  // role="button"/tabIndex=0 to a node that contains real <a>/<button>
  // children (invalid nested-interactive a11y). The Move modal is the
  // keyboard-accessible alternative to drag.
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: doc.id });
  const [moveOpen, setMoveOpen] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState<string[]>(doc.tags);
  useEscape(moveOpen, () => setMoveOpen(false));
  useEscape(tagsOpen, () => setTagsOpen(false));
  const isMd = doc.mimeType === "text/markdown";
  const Icon = isMd ? FileType2 : FileText;

  // Keep drag from starting (and text-selection from being hijacked) when
  // interacting with controls. Covers both the Mouse and Touch sensors.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const noDrag = { onMouseDown: stop, onTouchStart: stop, onPointerDown: stop };

  const moveTargets = folders.filter((f) => f !== doc.folder);
  function moveToNew() {
    const n = newFolder.trim();
    if (!n) return;
    setMoveOpen(false);
    setNewFolder("");
    onMove(n); // moving to a not-yet-existing folder creates it implicitly
  }

  const nameNode = renaming ? (
    <input
      autoFocus
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      {...noDrag}
      onKeyDown={(e) => {
        // Enter → blur → single commit via onBlur. Escape → cancel (skip the
        // blur-commit). This avoids the double-commit / "Escape saves" bug.
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") onCancelRename();
      }}
      onBlur={onCommitRename}
      className="w-full rounded border border-primary/50 bg-background px-1.5 py-0.5 text-sm text-foreground focus:outline-none"
    />
  ) : (
    <p className="truncate text-sm font-medium text-foreground" title={doc.fileName}>
      {doc.fileName}
    </p>
  );

  // Name + an important star (shown to everyone when the file is flagged).
  const nameRow = (
    <div className="flex min-w-0 items-center gap-1">
      {doc.important && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
      <div className="min-w-0 flex-1">{nameNode}</div>
    </div>
  );

  const meta = (
    <>
      {DOC_TYPE_LABEL[doc.docType] ?? doc.docType}
      {doc.platform && <> · {doc.platform}</>} · {formatFileSize(doc.fileSize)} · {formatDate(doc.updatedAt)}
    </>
  );

  // Clickable tag chips (click → filter by that tag).
  const tagChips = doc.tags.length > 0 ? (
    <div className="mt-1 flex flex-wrap gap-1">
      {doc.tags.map((t) => (
        <button
          key={t}
          {...noDrag}
          onClick={() => onTagClick(t)}
          title={`Filter by "${t}"`}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            activeTag.toLowerCase() === t.toLowerCase()
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          <Tag className="h-2.5 w-2.5" />
          {t}
        </button>
      ))}
    </div>
  ) : null;

  // Tag editor modal.
  const tagModal = tagsOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" {...noDrag}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setTagsOpen(false)} />
      <div className="relative w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground">Tags</h4>
            <p className="truncate text-xs text-muted-foreground" title={doc.fileName}>{doc.fileName}</p>
          </div>
          <button onClick={() => setTagsOpen(false)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
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

  // Acknowledgement pill — every media buyer marks "I've read this".
  const readPill = doc.ackByMe ? (
    <button
      {...noDrag}
      onClick={onUnacknowledge}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
      title="You've read this — click to undo"
    >
      <CheckCircle2 className="h-3.5 w-3.5" /> Read
    </button>
  ) : (
    <button
      {...noDrag}
      onClick={onAcknowledge}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold transition-colors",
        doc.important
          ? "border-amber-400 text-amber-600 hover:bg-amber-400/10 dark:text-amber-400"
          : "border-border text-muted-foreground hover:bg-accent"
      )}
      title="Mark as read"
    >
      {doc.important ? "Acknowledge" : "Mark read"}
    </button>
  );

  // Read receipts — managers see who has read the file.
  const readsBtn = isManager && (
    <button
      {...noDrag}
      onClick={onShowReaders}
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent"
      title="See who has read this"
    >
      <Users className="h-3.5 w-3.5" /> {doc.ackCount}
    </button>
  );

  const actions = (
    <div
      className={cn(
        "flex items-center gap-0.5",
        // Always visible on touch; hover-reveal only on desktop (md+).
        view === "grid" && "opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
      )}
    >
      <a
        href={`/api/admin/media-buyers/documents/${doc.id}?view=1`}
        target="_blank"
        rel="noopener noreferrer"
        {...noDrag}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
        title="View"
      >
        <Eye className="h-3.5 w-3.5" />
      </a>
      <a
        href={`/api/admin/media-buyers/documents/${doc.id}`}
        {...noDrag}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
        title="Download"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
      <button
        {...noDrag}
        onClick={onStartRename}
        disabled={busy}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
        title="Rename"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        {...noDrag}
        onClick={() => setMoveOpen(true)}
        disabled={busy}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
        title="Move to folder"
      >
        <FolderInput className="h-3.5 w-3.5" />
      </button>
      <button
        {...noDrag}
        onClick={() => { setTagDraft(doc.tags); setTagsOpen(true); }}
        disabled={busy}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
        title="Edit tags"
      >
        <Tag className="h-3.5 w-3.5" />
      </button>
      {isManager && (
        <button
          {...noDrag}
          onClick={() => onToggleImportant(!doc.important)}
          disabled={busy}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent disabled:opacity-50"
          title={doc.important ? "Unmark important" : "Mark important"}
        >
          <Star className={cn("h-3.5 w-3.5", doc.important ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
        </button>
      )}
      {isManager && (
        <button
          {...noDrag}
          onClick={onDelete}
          disabled={busy}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50",
            deleteConfirm
              ? "bg-destructive/10 text-destructive"
              : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          )}
          title={deleteConfirm ? "Click again to confirm" : "Delete"}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );

  // Centered modal for "Move to" — a fixed overlay avoids being clipped by the
  // files pane's overflow, and works the same on mobile and desktop. You can
  // create a brand-new folder right here (moving into a new name creates it).
  const moveModal = moveOpen && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" {...noDrag}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMoveOpen(false)} />
      <div className="relative w-full max-w-xs rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-foreground">Move</h4>
            <p className="truncate text-xs text-muted-foreground" title={doc.fileName}>{doc.fileName}</p>
          </div>
          <button onClick={() => setMoveOpen(false)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Create a new folder and move into it */}
        <div className="mb-2 flex items-center gap-1">
          <input
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") moveToNew(); }}
            placeholder="New folder…"
            className="h-8 flex-1 rounded-lg border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={moveToNew}
            disabled={!newFolder.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            title="Create folder & move"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {moveTargets.length > 0 && (
          <>
            <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Or move to</p>
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {moveTargets.map((f) => (
                <button
                  key={f}
                  onClick={() => { setMoveOpen(false); onMove(f); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                >
                  <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (view === "grid") {
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        className={cn(
          "group relative flex cursor-grab flex-col gap-2 rounded-xl border bg-background p-3 transition-all hover:shadow-sm active:cursor-grabbing",
          doc.important ? "border-amber-400/60 hover:border-amber-400" : "border-border/60 hover:border-primary/40",
          isDragging && "opacity-40"
        )}
      >
        <div className="flex items-start justify-between">
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", isMd ? "bg-primary/10 text-primary" : "bg-red-500/10 text-red-500 dark:text-red-400")}>
            <Icon className="h-5 w-5" />
          </div>
          {actions}
        </div>
        <div className="min-w-0">
          {nameRow}
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</p>
          {doc.uploadedByName && (
            <p className="truncate text-[11px] text-muted-foreground">{doc.uploadedByName}</p>
          )}
          {tagChips}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {readPill}
          {readsBtn}
        </div>
        {moveModal}
        {tagModal}
      </div>
    );
  }

  // list
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={cn(
        "group flex cursor-grab items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
      <Icon className={cn("h-5 w-5 shrink-0", isMd ? "text-primary" : "text-red-500 dark:text-red-400")} />
      <div className="min-w-0 flex-1">
        {nameRow}
        <p className="truncate text-xs text-muted-foreground">{meta}{doc.uploadedByName && <> · {doc.uploadedByName}</>}</p>
        {tagChips}
      </div>
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        {readPill}
        {readsBtn}
      </div>
      {actions}
      {moveModal}
      {tagModal}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Main component ──

export function MediaDocumentsDirectory({ isManager }: { isManager: boolean }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [importantOnly, setImportantOnly] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [settingsFolderName, setSettingsFolderName] = useState<string | null>(null);
  const [readersDoc, setReadersDoc] = useState<{ id: string; fileName: string } | null>(null);

  const [uploadType, setUploadType] = useState<MediaDocType>("other");
  const [uploadPlatform, setUploadPlatform] = useState<"" | MediaPlatform>("");
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [osDragOver, setOsDragOver] = useState(false);
  const [error, setError] = useState("");

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameSkipRef = useRef(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<DirectoryData>({
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

  const cancelRename = useCallback(() => {
    // Mark the pending blur-commit as a cancel, then close the editor.
    renameSkipRef.current = true;
    setRenamingId(null);
  }, []);

  const commitRename = useCallback(async () => {
    if (renameSkipRef.current) {
      renameSkipRef.current = false;
      setRenamingId(null);
      return;
    }
    const id = renamingId;
    if (!id) return;
    const next = renameValue.trim();
    setRenamingId(null);
    const current = documents.find((d) => d.id === id);
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
  }, [renamingId, renameValue, documents, refresh]);

  const removeDoc = useCallback(
    async (id: string) => {
      if (deleteConfirm !== id) {
        setDeleteConfirm(id);
        return;
      }
      setError("");
      setBusyId(id);
      setDeleteConfirm(null);
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
    [deleteConfirm, refresh]
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

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card md:h-[calc(100vh-19rem)] md:min-h-[30rem] md:flex-row">
        {/* ── Folder rail ── */}
        <aside className="flex shrink-0 flex-col gap-2 border-b border-border/60 p-3 md:w-60 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folders</span>
            <button
              onClick={() => setNewFolderOpen((v) => !v)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="New folder"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>

          {newFolderOpen && (
            <div className="flex items-center gap-1 px-1">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") { setNewFolderOpen(false); setNewFolderName(""); }
                }}
                placeholder="Folder name"
                className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button onClick={createFolder} className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground" title="Create">
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-x-visible md:overflow-y-auto">
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
          </div>

          <p className="hidden px-1 text-[11px] leading-snug text-muted-foreground md:block">
            Tip: drag a file onto a folder to move it.
          </p>
        </aside>

        {/* ── Files pane ── */}
        <section
          className="flex min-h-0 flex-1 flex-col"
          onDragOver={(e) => { e.preventDefault(); setOsDragOver(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setOsDragOver(false); }}
          onDrop={onOsDrop}
        >
          {/* Header / toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {activeFolder === null ? (
                <Files className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className={cn("h-4 w-4 shrink-0", colorOf(activeFolderObj?.color).icon)} />
              )}
              <h3 className="truncate text-sm font-semibold text-foreground">
                {activeFolder ?? "All Files"}
              </h3>
              <span className="shrink-0 text-xs text-muted-foreground">
                {visibleDocs.length} item{visibleDocs.length === 1 ? "" : "s"}
              </span>
              {activeFolder !== null && (
                <button
                  onClick={() => setSettingsFolderName(activeFolder)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Folder settings (rename, color, delete)"
                >
                  <Palette className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setImportantOnly((v) => !v)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                  importantOnly
                    ? "border-amber-400 bg-amber-400/10 text-amber-600 dark:text-amber-400"
                    : "border-input text-muted-foreground hover:bg-accent"
                )}
                title="Show important only"
              >
                <Star className={cn("h-3.5 w-3.5", importantOnly && "fill-amber-400 text-amber-400")} />
                <span className="hidden sm:inline">Important</span>
              </button>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground"
              >
                <option value="">All types</option>
                {DOC_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {allTags.length > 0 && (
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className={cn(
                    "h-8 rounded-lg border bg-background px-2 text-xs",
                    tagFilter ? "border-primary text-primary" : "border-input text-foreground"
                  )}
                  title="Filter by tag"
                >
                  <option value="">All tags</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>#{t}</option>
                  ))}
                </select>
              )}
              <div className="flex rounded-lg border border-border p-0.5">
                <button
                  onClick={() => setView("grid")}
                  className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                  title="Grid view"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={cn("flex h-7 w-7 items-center justify-center rounded-md", view === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                  title="List view"
                >
                  <ListIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Upload bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border/40 bg-muted/20 px-4 py-2">
            <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden"
              onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) uploadFiles(fs); }} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
              Upload PDF
            </button>
            <span className="text-[11px] text-muted-foreground">
              → <span className="font-medium text-foreground">{uploadTarget}</span>
            </span>
            <select value={uploadType} onChange={(e) => setUploadType(e.target.value as MediaDocType)}
              className="h-7 rounded-md border border-input bg-background px-2 text-[11px] text-foreground">
              {DOC_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={uploadPlatform} onChange={(e) => setUploadPlatform(e.target.value as "" | MediaPlatform)}
              className="h-7 rounded-md border border-input bg-background px-2 text-[11px] text-foreground">
              {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="w-full sm:w-auto sm:min-w-[160px] sm:flex-1">
              <TagInput tags={uploadTags} onChange={setUploadTags} placeholder="Add tags for uploads…" />
            </div>
            {error && <span className="w-full text-[11px] text-destructive">{error}</span>}
          </div>

          {/* Files */}
          <div className="relative flex-1 overflow-y-auto p-4">
            {osDragOver && (
              <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/5">
                <UploadCloud className="h-8 w-8 text-primary" />
                <p className="text-sm font-semibold text-primary">Drop to upload to “{uploadTarget}”</p>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : visibleDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <UploadCloud className="h-9 w-9 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {documents.length === 0
                    ? "No documents yet. Drop a PDF here or generate one in the AI Assistant."
                    : `No files in “${activeFolder ?? "this view"}”. Drag files here or use Upload.`}
                </p>
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleDocs.map((doc) => (
                  <FileTile
                    key={doc.id}
                    doc={doc}
                    view="grid"
                    isManager={isManager}
                    folders={folderNames}
                    renaming={renamingId === doc.id}
                    renameValue={renameValue}
                    setRenameValue={setRenameValue}
                    onStartRename={() => { setRenamingId(doc.id); setRenameValue(doc.fileName); }}
                    onCommitRename={commitRename}
                    onCancelRename={cancelRename}
                    onMove={(folder) => moveDoc(doc.id, folder)}
                    onDelete={() => removeDoc(doc.id)}
                    onToggleImportant={(next) => toggleDocImportant(doc.id, next)}
                    onAcknowledge={() => acknowledge(doc.id, true)}
                    onUnacknowledge={() => acknowledge(doc.id, false)}
                    onShowReaders={() => setReadersDoc({ id: doc.id, fileName: doc.fileName })}
                    onSaveTags={(tags) => setDocTags(doc.id, tags)}
                    onTagClick={(t) => setTagFilter((cur) => (cur.toLowerCase() === t.toLowerCase() ? "" : t))}
                    activeTag={tagFilter}
                    deleteConfirm={deleteConfirm === doc.id}
                    busy={busyId === doc.id}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {visibleDocs.map((doc) => (
                  <FileTile
                    key={doc.id}
                    doc={doc}
                    view="list"
                    isManager={isManager}
                    folders={folderNames}
                    renaming={renamingId === doc.id}
                    renameValue={renameValue}
                    setRenameValue={setRenameValue}
                    onStartRename={() => { setRenamingId(doc.id); setRenameValue(doc.fileName); }}
                    onCommitRename={commitRename}
                    onCancelRename={cancelRename}
                    onMove={(folder) => moveDoc(doc.id, folder)}
                    onDelete={() => removeDoc(doc.id)}
                    onToggleImportant={(next) => toggleDocImportant(doc.id, next)}
                    onAcknowledge={() => acknowledge(doc.id, true)}
                    onUnacknowledge={() => acknowledge(doc.id, false)}
                    onShowReaders={() => setReadersDoc({ id: doc.id, fileName: doc.fileName })}
                    onSaveTags={(tags) => setDocTags(doc.id, tags)}
                    onTagClick={(t) => setTagFilter((cur) => (cur.toLowerCase() === t.toLowerCase() ? "" : t))}
                    activeTag={tagFilter}
                    deleteConfirm={deleteConfirm === doc.id}
                    busy={busyId === doc.id}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Folder settings (rename / color / important / delete) */}
      {settingsFolder && (
        <FolderSettingsModal
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
        <ReadersModal
          docId={readersDoc.id}
          fileName={readersDoc.fileName}
          onClose={() => setReadersDoc(null)}
        />
      )}

      {/* Drag preview */}
      <DragOverlay dropAnimation={null}>
        {activeDoc && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/50 bg-card px-3 py-2 shadow-xl">
            {activeDoc.mimeType === "text/markdown" ? (
              <FileType2 className="h-4 w-4 text-primary" />
            ) : (
              <FileText className="h-4 w-4 text-red-500 dark:text-red-400" />
            )}
            <span className="max-w-[200px] truncate text-sm font-medium text-foreground">{activeDoc.fileName}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
