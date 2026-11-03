"use client";

import dynamic from "next/dynamic";
import { useDraggable } from "@dnd-kit/core";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FileType2,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Star,
  Tag,
  Users,
} from "lucide-react";
import { badgeTone, badgeToneHover, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DOC_TYPE_LABEL,
  IMPORTANT_STAR_CLS,
  formatDate,
  formatFileSize,
  type DocView,
} from "./mediaDirectoryShared";

// Keep drag from starting (and text-selection from being hijacked) when
// interacting with controls. Covers both the Mouse and Touch sensors.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();
const noDrag = { onMouseDown: stop, onTouchStart: stop, onPointerDown: stop };

function MenuPlaceholder() {
  return (
    <Button type="button" variant="ghost" size="icon-sm" disabled className="text-muted-foreground" aria-label="More actions">
      <MoreHorizontal />
    </Button>
  );
}

// The secondary-actions menu (Radix DropdownMenu) loads after first paint.
const MediaDocumentMenu = dynamic(
  () => import("./MediaDocumentMenu").then((m) => m.MediaDocumentMenu),
  { ssr: false, loading: MenuPlaceholder }
);

/** One file in the directory — a grid tile or a list row, draggable onto a folder. */
export function MediaDocumentTile({
  doc,
  view,
  isManager,
  renaming,
  renameValue,
  setRenameValue,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onOpenMove,
  onOpenTags,
  onDelete,
  onToggleImportant,
  onAcknowledge,
  onUnacknowledge,
  onShowReaders,
  onTagClick,
  activeTag,
  busy,
}: {
  doc: DocView;
  view: "grid" | "list";
  isManager: boolean;
  renaming: boolean;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onOpenMove: () => void;
  onOpenTags: () => void;
  onDelete: () => void;
  onToggleImportant: (next: boolean) => void;
  onAcknowledge: () => void;
  onUnacknowledge: () => void;
  onShowReaders: () => void;
  onTagClick: (tag: string) => void;
  activeTag: string;
  busy: boolean;
}) {
  // Only spread drag listeners (not `attributes`) — `attributes` would add
  // role="button"/tabIndex=0 to a node that contains real <a>/<button>
  // children (invalid nested-interactive a11y). The Move dialog is the
  // keyboard-accessible alternative to drag.
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: doc.id });
  const isMd = doc.mimeType === "text/markdown";
  const Icon = isMd ? FileType2 : FileText;

  const nameNode = renaming ? (
    <Input
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
      aria-label="File name"
      className="h-7 rounded-xl px-2"
    />
  ) : (
    <p className="truncate text-sm font-medium text-foreground" title={doc.fileName}>
      {doc.fileName}
    </p>
  );

  // Name + an important star (shown to everyone when the file is flagged).
  const nameRow = (
    <div className="flex min-w-0 items-center gap-1">
      {doc.important && (
        <Star role="img" aria-label="Important" className={cn("size-3.5 shrink-0", IMPORTANT_STAR_CLS)} />
      )}
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
    <div className="flex flex-wrap gap-1">
      {doc.tags.map((t) => {
        const active = activeTag.toLowerCase() === t.toLowerCase();
        return (
          <button
            key={t}
            type="button"
            {...noDrag}
            onClick={() => onTagClick(t)}
            title={`Filter by "${t}"`}
            aria-pressed={active}
            className={cn(
              badgeVariants({ variant: active ? "default" : "outline" }),
              "max-w-full cursor-pointer gap-0.5",
              active ? "hover:bg-primary/80" : cn(badgeToneHover.neutral, "text-muted-foreground")
            )}
          >
            <Tag />
            <span className="truncate">{t}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  // Acknowledgement pill — every media buyer marks "I've read this".
  const readPill = doc.ackByMe ? (
    <Button
      type="button"
      variant="outline"
      size="xs"
      {...noDrag}
      onClick={onUnacknowledge}
      className={cn(badgeTone.success, badgeToneHover.success)}
      title="You've read this — click to undo"
    >
      <CheckCircle2 /> Read
    </Button>
  ) : (
    <Button
      type="button"
      variant="outline"
      size="xs"
      {...noDrag}
      onClick={onAcknowledge}
      className={cn(doc.important && cn(badgeTone.warning, badgeToneHover.warning))}
      title="Mark as read"
    >
      {doc.important ? "Acknowledge" : "Mark read"}
    </Button>
  );

  // Read receipts — managers see who has read the file.
  const readsBtn = isManager && (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      {...noDrag}
      onClick={onShowReaders}
      className="tabular-nums text-muted-foreground"
      title="See who has read this"
      aria-label={`See who has read this (${doc.ackCount})`}
    >
      <Users /> {doc.ackCount}
    </Button>
  );

  const actions = (
    <div className="flex shrink-0 items-center">
      <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
        <a
          href={`/api/admin/media-buyers/documents/${doc.id}?view=1`}
          target="_blank"
          rel="noopener noreferrer"
          {...noDrag}
          title="View"
          aria-label={`View ${doc.fileName}`}
        >
          <Eye />
        </a>
      </Button>
      <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
        <a
          href={`/api/admin/media-buyers/documents/${doc.id}`}
          {...noDrag}
          title="Download"
          aria-label={`Download ${doc.fileName}`}
        >
          <Download />
        </a>
      </Button>
      {busy ? (
        <Button type="button" variant="ghost" size="icon-sm" disabled aria-label="Working…">
          <Loader2 className="animate-spin" />
        </Button>
      ) : (
        <MediaDocumentMenu
          fileName={doc.fileName}
          important={doc.important}
          isManager={isManager}
          onStartRename={onStartRename}
          onOpenMove={onOpenMove}
          onOpenTags={onOpenTags}
          onToggleImportant={onToggleImportant}
          onDelete={onDelete}
        />
      )}
    </div>
  );

  if (view === "grid") {
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        className={cn(
          "group relative flex cursor-grab flex-col gap-3 rounded-3xl border bg-card p-3.5 transition-[box-shadow,opacity] hover:shadow-md active:cursor-grabbing",
          isDragging && "opacity-40"
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            {nameRow}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
            {doc.uploadedByName && (
              <p className="truncate text-xs text-muted-foreground">{doc.uploadedByName}</p>
            )}
          </div>
        </div>
        {tagChips}
        {/* Wraps on the narrowest tiles (manager + "Acknowledge"): the
            actions drop to their own line, still right-aligned. */}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-1">
            {readPill}
            {readsBtn}
          </div>
          <div className="ml-auto">{actions}</div>
        </div>
      </div>
    );
  }

  // list
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={cn(
        "group flex cursor-grab items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50 active:cursor-grabbing sm:px-4",
        isDragging && "opacity-40"
      )}
    >
      {/* Drag hint — phones drag with a long press and need the width. */}
      <GripVertical className="hidden size-4 shrink-0 text-muted-foreground/40 sm:block" />
      <Icon className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <div>
          {nameRow}
          <p className="truncate text-xs text-muted-foreground">
            {meta}
            {doc.uploadedByName && <> · {doc.uploadedByName}</>}
          </p>
        </div>
        {tagChips}
      </div>
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        {readPill}
        {readsBtn}
      </div>
      {actions}
    </div>
  );
}
