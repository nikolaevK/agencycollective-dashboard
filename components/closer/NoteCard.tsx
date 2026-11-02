"use client";

import { useMemo } from "react";
import {
  Archive,
  ArchiveRestore,
  Calendar,
  Hash,
  Paperclip,
  Pencil,
  Share2,
  Trash2,
  Users2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format, isToday, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import type { NoteRecord } from "@/lib/notes";
import { Badge, StatusBadge, badgeToneHover, badgeVariants, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** Status tone per priority — same hues the chips always had. */
const PRIORITY_TONE: Record<string, BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

interface LinkedLeadDisplay {
  label: string;
  kindLabel: string;
}

interface Props {
  note: NoteRecord;
  leadDisplay?: LinkedLeadDisplay | null;
  /** Person this note is shared *by* (shown only on recipient's cards). */
  sharedByName?: string | null;
  /** Recipient count for the owner's cards. */
  sharedWithCount?: number;
  /** When true, hide edit/delete — viewer is a recipient, not the owner. */
  readOnly?: boolean;
  /** Recipient-only archive/unarchive callback. Provided only for shared cards. */
  onArchiveToggle?: () => void;
  /** Whether the recipient has already archived this share. */
  isArchived?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** Opens the full lead-context modal. Not provided for notes without a link. */
  onOpenLead?: () => void;
}

/**
 * Light markdown rendering — constrained to the component list we already use
 * in chat. Headers/bold/italic/lists/links/inline-code/code-blocks only.
 * ReactMarkdown sanitizes by default (no raw HTML), so notes can't inject
 * scripts even though setter notes are text they fully control.
 */
const markdownComponents = {
  h1: (p: { children?: React.ReactNode }) => (
    <h1 className="text-sm font-bold text-foreground mt-1 mb-2">{p.children}</h1>
  ),
  h2: (p: { children?: React.ReactNode }) => (
    <h2 className="text-sm font-semibold text-foreground mt-3 mb-2">{p.children}</h2>
  ),
  h3: (p: { children?: React.ReactNode }) => (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-2 mb-1">{p.children}</h3>
  ),
  p: (p: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed text-foreground/85 mb-2 last:mb-0">{p.children}</p>
  ),
  strong: (p: { children?: React.ReactNode }) => <strong className="font-semibold text-foreground">{p.children}</strong>,
  em: (p: { children?: React.ReactNode }) => <em className="italic">{p.children}</em>,
  ul: (p: { children?: React.ReactNode }) => <ul className="list-disc ml-5 space-y-0.5 text-sm mb-2">{p.children}</ul>,
  ol: (p: { children?: React.ReactNode }) => <ol className="list-decimal ml-5 space-y-0.5 text-sm mb-2">{p.children}</ol>,
  li: (p: { children?: React.ReactNode }) => <li className="text-sm text-foreground/85">{p.children}</li>,
  code: (p: { children?: React.ReactNode }) => (
    <code className="px-1.5 py-0.5 rounded-md bg-muted text-xs font-mono">{p.children}</code>
  ),
  // Fenced code blocks default to white-space: pre with no scroll container
  // and would overflow the card horizontally on phones.
  pre: (p: { children?: React.ReactNode }) => (
    <pre className="overflow-x-auto rounded-2xl bg-muted/50 p-3 text-xs font-mono my-2 [&_code]:bg-transparent [&_code]:p-0">
      {p.children}
    </pre>
  ),
  a: (p: { children?: React.ReactNode; href?: string }) => (
    <a
      href={p.href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {p.children}
    </a>
  ),
  blockquote: (p: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-border pl-3 italic text-muted-foreground my-2">{p.children}</blockquote>
  ),
};

function DueDateChip({ due }: { due: string }) {
  const parsed = useMemo(() => {
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(due)) {
        const [y, m, d] = due.split("-").map(Number);
        return new Date(y, m - 1, d);
      }
      return parseISO(due);
    } catch {
      return null;
    }
  }, [due]);

  if (!parsed) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isOverdue = parsed < startOfToday;
  const isDueToday = isToday(parsed);

  const tone: BadgeTone = isOverdue ? "danger" : isDueToday ? "warning" : "neutral";

  const label = isOverdue
    ? `Overdue · ${format(parsed, "MMM d")}`
    : isDueToday
      ? "Due today"
      : `Due ${format(parsed, "MMM d, yyyy")}`;

  return (
    <Badge variant="outline" tone={tone} className={cn(tone === "neutral" && "text-muted-foreground")}>
      <Calendar />
      {label}
    </Badge>
  );
}

export function NoteCard({
  note,
  leadDisplay,
  sharedByName,
  sharedWithCount,
  readOnly,
  onArchiveToggle,
  isArchived,
  onEdit,
  onDelete,
  onOpenLead,
}: Props) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <StatusBadge tone={PRIORITY_TONE[note.priority] ?? PRIORITY_TONE.medium}>
              {PRIORITY_LABELS[note.priority] ?? note.priority}
            </StatusBadge>
            <h3 className="min-w-0 text-sm font-medium text-foreground truncate">{note.title}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {note.dueDate && <DueDateChip due={note.dueDate} />}
            {note.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="max-w-full">
                <Hash />
                <span className="truncate">{tag}</span>
              </Badge>
            ))}
            {sharedByName && (
              <Badge variant="outline" className="max-w-full">
                <Share2 className="text-muted-foreground" />
                <span className="truncate">Shared by {sharedByName}</span>
              </Badge>
            )}
            {!sharedByName && sharedWithCount !== undefined && sharedWithCount > 0 && (
              <Badge
                variant="outline"
                title={`Shared with ${sharedWithCount} teammate${sharedWithCount === 1 ? "" : "s"}`}
              >
                <Users2 className="text-muted-foreground" />
                Shared with {sharedWithCount}
              </Badge>
            )}
            {leadDisplay && (
              onOpenLead ? (
                <button
                  type="button"
                  onClick={onOpenLead}
                  className={cn(badgeVariants({ variant: "outline", tone: "info" }), badgeToneHover.info, "max-w-full cursor-pointer")}
                  title="Open full lead history"
                >
                  <Paperclip />
                  <span className="truncate">{leadDisplay.label}</span>
                  <span className="opacity-60">· {leadDisplay.kindLabel}</span>
                </button>
              ) : (
                <Badge variant="outline" tone="info" className="max-w-full">
                  <Paperclip />
                  <span className="truncate">{leadDisplay.label}</span>
                  <span className="opacity-60">· {leadDisplay.kindLabel}</span>
                </Badge>
              )
            )}
          </div>

          {note.body && (
            <div className="max-h-48 overflow-y-auto text-foreground/85">
              <ReactMarkdown components={markdownComponents}>{note.body}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          {!readOnly && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={onEdit}
                className="size-10 text-muted-foreground md:size-8"
                aria-label="Edit note"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="size-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive md:size-8 dark:hover:bg-destructive/20"
                aria-label="Delete note"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
          {readOnly && onArchiveToggle && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onArchiveToggle}
              className="text-muted-foreground"
              aria-label={isArchived ? "Unarchive note" : "Archive note"}
              title={isArchived ? "Restore to active" : "Archive from my view"}
            >
              {isArchived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
