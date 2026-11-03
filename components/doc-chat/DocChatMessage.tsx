"use client";

import { Component, memo, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Square,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/providers/ToastProvider";
import { CHAT_MODELS, DEFAULT_MODEL } from "@/lib/chatModels";
import type { PendingTool } from "@/lib/analyst/streamReducer";
import { loadImageStripper, withoutImages } from "@/lib/docChat/stripImagesClient";
import type { ChatMessage, ContentBlock, NoticeBlock, ToolUseBlock } from "@/types/chat";

/**
 * One message in a document-assistant chat (Media Buyers, SOPs) — the AI
 * Analyst's look (components/chat/ChatMessage) with document cards in place
 * of charts. Markdown goes through the shared safe renderer (no raw HTML, no
 * images: a model-written image URL would fetch on render).
 */

const loadMarkdown = () => import("@/components/chat/Markdown");
/** Start fetching the markdown renderer (and the Copy / Export image stripper) before the first reply arrives. */
export function preloadDocChatMarkdown() {
  void loadMarkdown();
  loadImageStripper().catch(() => {}); // retried on the first copy
}
const Markdown = dynamic(loadMarkdown, { loading: () => <Skeleton className="h-4 w-2/3 rounded-full" /> });

/** What a host chat plugs in. Pass module-level functions: the message is memoized on them. */
export interface DocChatRenderers {
  /** Card for a finished tool call (null = not shown). */
  renderTool: (tool: ToolUseBlock) => ReactNode;
  /** Working label while the model writes a tool call, e.g. "Writing the document…". */
  pendingLabel: (name: string) => string;
  /** The reply as markdown (Copy). */
  toMarkdown: (message: ChatMessage) => string;
}

interface DocChatMessageProps extends DocChatRenderers {
  message: ChatMessage;
  assistantIcon: LucideIcon;
  isStreaming?: boolean;
  /** Tool calls the model is still writing. */
  pendingTools?: PendingTool[];
  /** Seconds since the reply started (streaming only). */
  elapsedSeconds?: number;
  onRetry?: () => void;
  onContinue?: () => void;
}

// ─── Render model ────────────────────────────────────────────────────────────

type Item =
  | { kind: "text"; key: string; text: string }
  | { kind: "tool"; key: string; tool: ToolUseBlock }
  | { kind: "notes"; key: string; notes: { key: string; text: string }[] }
  | { kind: "notice"; key: string; notice: NoticeBlock };

function buildItems(blocks: ContentBlock[]): Item[] {
  const items: Item[] = [];
  blocks.forEach((b, i) => {
    if (b.type === "text") {
      if (b.text.trim()) items.push({ kind: "text", key: `t-${i}`, text: b.text });
    } else if (b.type === "tool_use") {
      items.push({ kind: "tool", key: `o-${b.id}`, tool: b });
    } else if (b.type === "progress") {
      if (!b.text.trim()) return;
      const last = items[items.length - 1];
      const note = { key: b.key, text: b.text.trim() };
      if (last?.kind === "notes") last.notes.push(note);
      else items.push({ kind: "notes", key: `p-${b.key}`, notes: [note] });
    } else if (b.type === "notice") {
      items.push({ kind: "notice", key: `n-${i}`, notice: b });
    }
    // tool_result blocks are acknowledgements for the model — nothing to show.
  });
  return items;
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/** One malformed tool payload can't blank the chat. */
class ToolErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown, info: ErrorInfo) {
    console.error("[doc-chat] tool render error:", err, info.componentStack);
  }
  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className={cn("rounded-2xl border px-3 py-2 text-sm", badgeTone.danger)}>
          This generated item couldn&apos;t be displayed. Ask for it again.
        </div>
      );
    }
    return this.props.children;
  }
}

/** The model's progress notes between steps (Opus 5.5 `display: "updates"`). */
function ProgressNotes({ notes, live }: { notes: { key: string; text: string }[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const list = (
    <ul className="space-y-1.5">
      {notes.map((note, i) => (
        <li key={note.key} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <span className="mt-[3px] flex size-3.5 shrink-0 items-center justify-center">
            {live && i === notes.length - 1 ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <span aria-hidden className="size-1 rounded-full bg-muted-foreground/70" />
            )}
          </span>
          <span className="min-w-0 break-words">{note.text}</span>
        </li>
      ))}
    </ul>
  );
  if (live || notes.length === 1) return list;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-ml-1 inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {notes.length} steps
      </button>
      {open && <div className="mt-1.5 pl-1">{list}</div>}
    </div>
  );
}

const NOTICE_TONE: Record<NoticeBlock["kind"], BadgeTone> = {
  refusal: "warning",
  error: "danger",
  truncated: "warning",
  limit: "warning",
  fallback: "info",
  stopped: "neutral",
};

function NoticeRow({ notice, onRetry, onContinue }: { notice: NoticeBlock; onRetry?: () => void; onContinue?: () => void }) {
  if (notice.kind === "stopped") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Square className="size-3 fill-current" />
        {notice.text}
      </p>
    );
  }
  const Icon = notice.kind === "refusal" ? ShieldAlert : notice.kind === "error" ? AlertCircle : Info;
  const action =
    notice.action === "retry" && onRetry ? (
      <Button variant="ghost" size="xs" onClick={onRetry} className="shrink-0 text-current hover:bg-foreground/5 hover:text-current">
        <RotateCcw />
        Retry
      </Button>
    ) : notice.action === "continue" && onContinue ? (
      <Button variant="ghost" size="xs" onClick={onContinue} className="shrink-0 text-current hover:bg-foreground/5 hover:text-current">
        Continue
        <ArrowRight />
      </Button>
    ) : null;
  return (
    <div
      role={notice.kind === "error" ? "alert" : "status"}
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border px-3 py-2 text-sm", badgeTone[NOTICE_TONE[notice.kind]])}
    >
      <Icon className="size-4 shrink-0 self-start sm:self-center" />
      <p className="min-w-0 flex-1 leading-snug">{notice.text}</p>
      {action}
    </div>
  );
}

/** Spinner line; the timer sits outside the live region (no per-second announcements). */
function WorkingLine({ label, elapsedSeconds }: { label: string; elapsedSeconds?: number }) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      <span aria-live="polite">{label}</span>
      {typeof elapsedSeconds === "number" && elapsedSeconds >= 3 && (
        <span className="tabular-nums text-muted-foreground/70">{elapsedSeconds}s</span>
      )}
    </p>
  );
}

function modelLabel(id: string): string {
  const known = CHAT_MODELS.find((m) => m.id === id);
  if (known) return known.label;
  const parts = id.split("-");
  const words = parts.filter((p) => !/^\d+$/.test(p)).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const version = parts.filter((p) => /^\d{1,2}$/.test(p)).join(".");
  return `${words.join(" ")} ${version}`.trim();
}

/** Pasted documents can be tens of thousands of characters — collapse long user messages. */
const LONG_USER_CHARS = 1_200;
const LONG_USER_LINES = 14;

function UserBubble({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > LONG_USER_CHARS || text.split("\n").length > LONG_USER_LINES;
  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground [overflow-wrap:anywhere] md:max-w-[75%]",
          long && !expanded && "line-clamp-[12]"
        )}
      >
        {text}
      </div>
      {long && (
        <Button variant="ghost" size="xs" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="text-muted-foreground">
          {expanded ? "Show less" : `Show all (${text.length.toLocaleString("en-US")} characters)`}
        </Button>
      )}
    </div>
  );
}

// ─── Message ─────────────────────────────────────────────────────────────────

function DocChatMessageImpl({
  message,
  assistantIcon: AssistantIcon,
  isStreaming,
  pendingTools,
  elapsedSeconds,
  onRetry,
  onContinue,
  renderTool,
  pendingLabel,
  toMarkdown,
}: DocChatMessageProps) {
  const { toastError } = useToast();
  const [copied, setCopied] = useState(false);
  const blocks = message.blocks;
  const items = useMemo(() => (blocks && blocks.length > 0 ? buildItems(blocks) : []), [blocks]);

  if (message.role === "user") return <UserBubble text={message.content} />;

  const pending = isStreaming ? pendingTools ?? [] : [];
  const lastItem = items[items.length - 1];
  const hasVisibleContent = items.some((i) => i.kind === "text" || i.kind === "tool");
  // "Thinking…" until output arrives, and between a finished step and the next
  // one (live progress notes carry their own spinner).
  const showThinking = Boolean(isStreaming && pending.length === 0 && lastItem?.kind !== "text" && lastItem?.kind !== "notes");

  async function copyReply() {
    try {
      const md = withoutImages(toMarkdown(message));
      await navigator.clipboard.writeText(typeof md === "string" ? md : await md);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toastError("Couldn't copy to the clipboard.");
    }
  }

  return (
    <div className="group/message flex items-start gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <AssistantIcon className="size-3.5" />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-3">
          {items.length === 0 && !isStreaming && message.content ? <Markdown text={message.content} /> : null}
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;
            switch (item.kind) {
              case "text":
                return (
                  <div key={item.key}>
                    <Markdown text={item.text} />
                    {isStreaming && isLast && pending.length === 0 && (
                      <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-text-bottom" />
                    )}
                  </div>
                );
              case "tool":
                return (
                  <div key={item.key} className="min-w-0">
                    <ToolErrorBoundary>{renderTool(item.tool)}</ToolErrorBoundary>
                  </div>
                );
              case "notes":
                return <ProgressNotes key={item.key} notes={item.notes} live={Boolean(isStreaming && isLast)} />;
              case "notice":
                return <NoticeRow key={item.key} notice={item.notice} onRetry={onRetry} onContinue={onContinue} />;
            }
          })}

          {pending.map((t) => (
            <div key={t.id} className="space-y-2">
              <WorkingLine label={pendingLabel(t.name)} elapsedSeconds={elapsedSeconds} />
              <Skeleton className="h-40 w-full rounded-3xl" />
            </div>
          ))}

          {showThinking && <WorkingLine label="Thinking…" elapsedSeconds={elapsedSeconds} />}
        </div>

        {message.servedBy && !isStreaming && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            Answered by {modelLabel(message.servedBy)} after a safety check declined {modelLabel(DEFAULT_MODEL)}.
          </p>
        )}

        {/* Revealed on hover / focus — only where the device can hover (always shown on touch). */}
        {!isStreaming && hasVisibleContent && (
          <div className="-ml-2 flex items-center gap-0.5 transition-opacity md:[@media(hover:hover)]:opacity-0 md:focus-within:opacity-100 md:group-hover/message:opacity-100">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={copyReply}
              aria-label={copied ? "Copied" : "Copy reply"}
              title={copied ? "Copied" : "Copy reply (markdown, documents included)"}
              className="text-muted-foreground"
            >
              {copied ? <Check /> : <Copy />}
            </Button>
            {onRetry && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onRetry}
                aria-label="Regenerate reply"
                title="Regenerate reply"
                className="text-muted-foreground"
              >
                <RotateCcw />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Memoized: earlier messages don't re-render on every streamed token. */
export const DocChatMessage = memo(DocChatMessageImpl);
