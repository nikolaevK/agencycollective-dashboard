"use client";

import { useMemo } from "react";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Calendar,
  CheckCircle2,
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

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-500/15 text-red-700 dark:text-red-400",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  low: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
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
    <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">{p.children}</code>
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

  const cls = isOverdue
    ? "bg-red-500/15 text-red-700 dark:text-red-400"
    : isDueToday
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : "bg-muted/60 text-muted-foreground";

  const label = isOverdue
    ? `Overdue · ${format(parsed, "MMM d")}`
    : isDueToday
      ? "Due today"
      : `Due ${format(parsed, "MMM d, yyyy")}`;

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium", cls)}>
      <Calendar className="h-3 w-3" />
      {label}
    </span>
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
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide",
                PRIORITY_STYLES[note.priority] ?? PRIORITY_STYLES.medium
              )}
            >
              {note.priority === "high" ? <AlertCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
              {PRIORITY_LABELS[note.priority] ?? note.priority}
            </span>
            <h3 className="text-sm font-semibold text-foreground truncate">{note.title}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-2">
            {note.dueDate && <DueDateChip due={note.dueDate} />}
            {note.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted/60 text-muted-foreground"
              >
                <Hash className="h-3 w-3" />
                {tag}
              </span>
            ))}
            {sharedByName && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400">
                <Share2 className="h-3 w-3" />
                Shared by {sharedByName}
              </span>
            )}
            {!sharedByName && sharedWithCount !== undefined && sharedWithCount > 0 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-500/10 text-indigo-700 dark:text-indigo-400"
                title={`Shared with ${sharedWithCount} teammate${sharedWithCount === 1 ? "" : "s"}`}
              >
                <Users2 className="h-3 w-3" />
                Shared with {sharedWithCount}
              </span>
            )}
            {leadDisplay && (
              onOpenLead ? (
                <button
                  type="button"
                  onClick={onOpenLead}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-500/10 text-sky-700 dark:text-sky-400 hover:bg-sky-500/20 transition-colors cursor-pointer"
                  title="Open full lead history"
                >
                  <Paperclip className="h-3 w-3" />
                  {leadDisplay.label}
                  <span className="opacity-60">· {leadDisplay.kindLabel}</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-sky-500/10 text-sky-700 dark:text-sky-400">
                  <Paperclip className="h-3 w-3" />
                  {leadDisplay.label}
                  <span className="opacity-60">· {leadDisplay.kindLabel}</span>
                </span>
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
              <button
                onClick={onEdit}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Edit note"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors"
                aria-label="Delete note"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {readOnly && onArchiveToggle && (
            <button
              onClick={onArchiveToggle}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label={isArchived ? "Unarchive note" : "Archive note"}
              title={isArchived ? "Restore to active" : "Archive from my view"}
            >
              {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
