"use client";

import { memo, useRef, useState } from "react";
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

// The secondary-actions menu (Radix DropdownMenu) is fetched on intent
// (hover / focus of a ⋯ button) and mounted by a tile only on its first open:
// until then each tile carries just this static button, styled like the
// menu's own trigger.
const warmMenu = () => void import("./MediaDocumentMenu");

function MenuButton({ label, onOpen }: { label: string; onOpen?: (byKeyboard: boolean) => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      {...noDrag}
      // A keyboard-activated click carries detail 0.
      onClick={(e) => onOpen?.(e.detail === 0)}
      onPointerEnter={warmMenu}
      onFocus={warmMenu}
      className="text-muted-foreground"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={false}
      title="More actions"
    >
      <MoreHorizontal />
    </Button>
  );
}

const MediaDocumentMenu = dynamic(
  () => import("./MediaDocumentMenu").then((m) => m.MediaDocumentMenu),
  { ssr: false, loading: () => <MenuButton label="More actions" /> }
);

/** The inline rename field — its draft lives here, so a keystroke re-renders
 *  only this tile, not the directory. */
function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const cancelled = useRef(false);
  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      {...noDrag}
      onKeyDown={(e) => {
        // Enter → blur → single commit via onBlur. Escape → cancel (skip the
        // blur-commit). This avoids the double-commit / "Escape saves" bug.
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          cancelled.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!cancelled.current) onCommit(value);
      }}
      aria-label="File name"
      className="h-7 rounded-xl px-2"
    />
  );
}

/**
 * One file in the directory — a grid tile or a list row, draggable onto a
 * folder. Memoised: the directory hands it stable, id-taking callbacks, so a
 * change to one file (or the directory's own state) doesn't re-render the rest.
 */
export const MediaDocumentTile = memo(function MediaDocumentTile({
  doc,
  view,
  isManager,
  renaming,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onOpenMove,
  onOpenTags,
  onDelete,
  onToggleImportant,
  onAcknowledge,
  onShowReaders,
  onTagClick,
  activeTag,
  busy,
}: {
  doc: DocView;
  view: "grid" | "list";
  isManager: boolean;
  renaming: boolean;
  onStartRename: (id: string) => void;
  onCommitRename: (id: string, value: string) => void;
  onCancelRename: () => void;
  onOpenMove: (id: string) => void;
  onOpenTags: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleImportant: (id: string, next: boolean) => void;
  onAcknowledge: (id: string, ack: boolean) => void;
  onShowReaders: (id: string, fileName: string) => void;
  onTagClick: (tag: string) => void;
  activeTag: string;
  busy: boolean;
}) {
  // "idle" until the ⋯ menu is first opened (static button, no Radix root);
  // from then on the real menu stays mounted, open or closed.
  const [menu, setMenu] = useState<"idle" | "open" | "closed">("idle");
  const [menuByKeyboard, setMenuByKeyboard] = useState(false);

  // Only spread drag listeners (not `attributes`) — `attributes` would add
  // role="button"/tabIndex=0 to a node that contains real <a>/<button>
  // children (invalid nested-interactive a11y). The Move dialog is the
  // keyboard-accessible alternative to drag.
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: doc.id });
  const isMd = doc.mimeType === "text/markdown";
  const Icon = isMd ? FileType2 : FileText;

  const nameNode = renaming ? (
    <RenameInput
      initial={doc.fileName}
      onCommit={(value) => onCommitRename(doc.id, value)}
      onCancel={onCancelRename}
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
      onClick={() => onAcknowledge(doc.id, false)}
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
      onClick={() => onAcknowledge(doc.id, true)}
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
      onClick={() => onShowReaders(doc.id, doc.fileName)}
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
      ) : menu === "idle" ? (
        <MenuButton
          label={`More actions for ${doc.fileName}`}
          onOpen={(byKeyboard) => {
            setMenuByKeyboard(byKeyboard);
            setMenu("open");
          }}
        />
      ) : (
        <MediaDocumentMenu
          open={menu === "open"}
          onOpenChange={(open) => setMenu(open ? "open" : "closed")}
          focusFirstItem={menuByKeyboard}
          fileName={doc.fileName}
          important={doc.important}
          isManager={isManager}
          onStartRename={() => onStartRename(doc.id)}
          onOpenMove={() => onOpenMove(doc.id)}
          onOpenTags={() => onOpenTags(doc.id)}
          onToggleImportant={(next) => onToggleImportant(doc.id, next)}
          onDelete={() => onDelete(doc.id)}
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
        "group flex cursor-grab flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 transition-colors hover:bg-muted/50 active:cursor-grabbing sm:flex-nowrap sm:px-4",
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
      {/* Phones: read status + receipts drop to their own line under the
          text (after the actions), so they stay reachable. */}
      <div className="flex shrink-0 items-center gap-1 max-sm:order-last max-sm:basis-full max-sm:pl-8">
        {readPill}
        {readsBtn}
      </div>
      {actions}
    </div>
  );
});
