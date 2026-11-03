"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  Copy,
  FileDown,
  Globe,
  Info,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Square,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/providers/ToastProvider";
import { CHAT_MODELS, DEFAULT_MODEL } from "@/lib/chatModels";
import { messageToMarkdown } from "@/lib/analyst/exportMarkdown";
import type { PendingTool } from "@/lib/analyst/streamReducer";
import type { ContentBlock, NoticeBlock, ToolResultBlock, ToolUseBlock } from "@/types/chat";
import { ToolResultRenderer } from "./ToolResultRenderer";

const loadMarkdown = () => import("./Markdown");
/** Start fetching the markdown renderer before the first reply arrives. */
export function preloadChatRenderers() {
  void loadMarkdown();
}

const Markdown = dynamic(loadMarkdown, {
  loading: () => <Skeleton className="h-4 w-2/3 rounded-full" />,
});

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  blocks?: ContentBlock[];
  isStreaming?: boolean;
  // ── AI Analyst extras (the client-portal analyst passes none of these) ──
  /** Set only when a fallback model answered (refusal fallback) — a note shows. */
  servedBy?: string;
  /** Tool calls the model is still writing (placeholders while streaming). */
  pendingTools?: PendingTool[];
  /** Server phase while streaming, e.g. "Loading account data…". */
  status?: string | null;
  /** Seconds since the reply started, shown next to the working line. */
  elapsedSeconds?: number;
  onRetry?: () => void;
  onContinue?: () => void;
}

// ─── Render model ────────────────────────────────────────────────────────────

const OUTPUT_TOOLS = new Set(["display_metrics", "display_chart", "display_table", "generate_report"]);

interface ActivityEntry {
  key: string;
  kind: "note" | "web" | "tool";
  text: string;
  /** "incomplete" = no result came back before the reply ended (stopped / failed). */
  state: "done" | "running" | "error" | "incomplete";
}

type Item =
  | { kind: "text"; key: string; text: string }
  | { kind: "output"; key: string; tool: ToolUseBlock; result?: ToolResultBlock }
  | { kind: "activity"; key: string; entries: ActivityEntry[] }
  | { kind: "notice"; key: string; notice: NoticeBlock };

function hostOf(url: unknown): string {
  try {
    return new URL(String(url)).host;
  } catch {
    return String(url ?? "the page");
  }
}

function buildItems(blocks: ContentBlock[], streaming: boolean): Item[] {
  const results = new Map<string, ToolResultBlock>();
  for (const b of blocks) if (b.type === "tool_result") results.set(b.tool_use_id, b);

  const items: Item[] = [];
  const pushEntry = (entry: ActivityEntry) => {
    const last = items[items.length - 1];
    if (last?.kind === "activity") last.entries.push(entry);
    else items.push({ kind: "activity", key: `a-${entry.key}`, entries: [entry] });
  };

  blocks.forEach((b, i) => {
    if (b.type === "text") {
      if (b.text.trim()) items.push({ kind: "text", key: `t-${i}`, text: b.text });
    } else if (b.type === "progress") {
      if (b.text.trim()) pushEntry({ key: `p-${b.key}`, kind: "note", text: b.text.trim(), state: "done" });
    } else if (b.type === "notice") {
      items.push({ kind: "notice", key: `n-${i}`, notice: b });
    } else if (b.type === "tool_use") {
      const result = results.get(b.id);
      if (OUTPUT_TOOLS.has(b.name)) {
        items.push({ kind: "output", key: `o-${b.id}`, tool: b, result });
        return;
      }
      // No result once the reply ended: the call never finished (stopped, or the
      // server didn't report back — the portal sends none on failure). No spinner.
      const pending = streaming ? "running" : "incomplete";
      if (b.name === "fetch_landing_page") {
        const host = hostOf(b.input?.url);
        pushEntry({
          key: b.id,
          kind: "web",
          text: !result
            ? streaming
              ? `Reading ${host}…`
              : `Couldn't read ${host}`
            : result.isError
              ? `Couldn't read ${host}: ${String(result.content)}`
              : typeof result.content === "string"
                ? result.content
                : `Read ${host}`,
          state: !result ? pending : result.isError ? "error" : "done",
        });
      } else {
        pushEntry({ key: b.id, kind: "tool", text: `Used ${b.name}`, state: result?.isError ? "error" : result ? "done" : pending });
      }
    }
  });
  return items;
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function EntryIcon({ entry, live }: { entry: ActivityEntry; live: boolean }) {
  if (entry.state === "running" || live) return <Loader2 className="size-3.5 animate-spin" />;
  if (entry.state === "error") return <AlertCircle className="size-3.5 text-destructive" />;
  if (entry.kind === "web") return <Globe className="size-3.5" />;
  if (entry.kind === "tool") return <Wrench className="size-3.5" />;
  return <span aria-hidden className="mx-[5px] size-1 rounded-full bg-muted-foreground/70" />;
}

function ActivityGroup({ entries, live }: { entries: ActivityEntry[]; live: boolean }) {
  const [open, setOpen] = useState(false);
  const expanded = live || open || entries.length === 1;

  const list = (
    <ul className="space-y-1.5">
      {entries.map((entry, i) => (
        <li key={entry.key} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <span className="mt-[3px] flex size-3.5 shrink-0 items-center justify-center">
            <EntryIcon entry={entry} live={live && i === entries.length - 1 && entry.kind === "note"} />
          </span>
          <span className={cn("min-w-0 break-words", entry.state === "error" && "text-destructive")}>{entry.text}</span>
        </li>
      ))}
    </ul>
  );

  if (expanded && (live || entries.length === 1)) return <div data-pdf-ignore="">{list}</div>;

  return (
    <div data-pdf-ignore="">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-ml-1 inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        {entries.length} steps
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

function NoticeRow({
  notice,
  onRetry,
  onContinue,
}: {
  notice: NoticeBlock;
  onRetry?: () => void;
  onContinue?: () => void;
}) {
  if (notice.kind === "stopped") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Square className="size-3 fill-current" />
        {notice.text}
      </p>
    );
  }
  const tone = NOTICE_TONE[notice.kind];
  const Icon = notice.kind === "refusal" ? ShieldAlert : notice.kind === "error" ? AlertCircle : Info;
  const action =
    notice.action === "retry" && onRetry ? (
      <Button variant="ghost" size="xs" onClick={onRetry} data-pdf-ignore="" className="shrink-0 text-current hover:bg-foreground/5 hover:text-current">
        <RotateCcw />
        Retry
      </Button>
    ) : notice.action === "continue" && onContinue ? (
      <Button variant="ghost" size="xs" onClick={onContinue} data-pdf-ignore="" className="shrink-0 text-current hover:bg-foreground/5 hover:text-current">
        Continue
        <ArrowRight />
      </Button>
    ) : null;

  return (
    <div
      role={notice.kind === "error" ? "alert" : "status"}
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border px-3 py-2 text-sm", badgeTone[tone])}
    >
      <Icon className="size-4 shrink-0 self-start sm:self-center" />
      <p className="min-w-0 flex-1 leading-snug">{notice.text}</p>
      {action}
    </div>
  );
}

const PENDING_LABEL: Record<string, string> = {
  display_chart: "Building chart…",
  display_table: "Building table…",
  display_metrics: "Preparing metrics…",
  generate_report: "Preparing report…",
  fetch_landing_page: "Opening the page…",
};

function PendingTools({ tools }: { tools: PendingTool[] }) {
  return (
    <>
      {tools.map((t) => (
        <div key={t.id} className="space-y-2" aria-live="polite">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {PENDING_LABEL[t.name] ?? `Using ${t.name}…`}
          </p>
          {t.name === "display_chart" && <Skeleton className="h-48 w-full rounded-3xl" />}
          {t.name === "display_table" && <Skeleton className="h-28 w-full rounded-3xl" />}
          {t.name === "display_metrics" && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[84px] rounded-3xl" />
              ))}
            </div>
          )}
        </div>
      ))}
    </>
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

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} title={label} className="text-muted-foreground">
      {children}
    </Button>
  );
}

// ─── Message ─────────────────────────────────────────────────────────────────

function ChatMessageImpl({
  role,
  content,
  blocks,
  isStreaming,
  servedBy,
  pendingTools,
  status,
  elapsedSeconds,
  onRetry,
  onContinue,
}: ChatMessageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { toastError } = useToast();
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const items = useMemo(() => (blocks && blocks.length > 0 ? buildItems(blocks, Boolean(isStreaming)) : []), [blocks, isStreaming]);
  // The first message (usually the user's) starts loading the markdown chunk,
  // so the reply's first tokens don't wait on it — on every chat surface.
  useEffect(preloadChatRenderers, []);

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground [overflow-wrap:anywhere] md:max-w-[75%]">
          {content}
        </div>
      </div>
    );
  }

  const hasBlocks = Boolean(blocks && blocks.length > 0);
  const hasOutputs = items.some((i) => i.kind === "output");
  const lastItem = items[items.length - 1];
  const pending = isStreaming ? pendingTools ?? [] : [];
  const showWorking = Boolean(isStreaming && (status || (pending.length === 0 && lastItem?.kind !== "text" && hasBlocks)));
  const hasVisibleContent = items.some((i) => i.kind === "text" || i.kind === "output");
  const fellBack = Boolean(servedBy);

  async function copyReply() {
    const text = messageToMarkdown({ id: "", role: "assistant", content, blocks });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toastError("Couldn't copy to the clipboard.");
    }
  }

  async function downloadPdf() {
    const el = contentRef.current;
    if (!el || exporting) return;
    setExporting(true);
    try {
      const { exportMessagePdf } = await import("./messagePdf");
      await exportMessagePdf(el);
    } catch (err) {
      console.error("[PDF] Generation failed:", err);
      toastError("PDF generation failed. Try again, or copy the reply instead.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="group/message flex items-start gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="size-3.5" />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div ref={contentRef} className="space-y-3">
          {hasBlocks ? (
            items.map((item, idx) => {
              const isLast = idx === items.length - 1;
              switch (item.kind) {
                case "text":
                  return (
                    <div key={item.key}>
                      <Markdown text={item.text} />
                      {isStreaming && isLast && pending.length === 0 && !status && (
                        <span aria-hidden className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-text-bottom" />
                      )}
                    </div>
                  );
                case "output":
                  return (
                    <div key={item.key} className="min-w-0">
                      <ToolResultRenderer tool={item.tool} result={item.result} streaming={Boolean(isStreaming)} />
                    </div>
                  );
                case "activity":
                  return <ActivityGroup key={item.key} entries={item.entries} live={Boolean(isStreaming && isLast)} />;
                case "notice":
                  return <NoticeRow key={item.key} notice={item.notice} onRetry={onRetry} onContinue={onContinue} />;
              }
            })
          ) : content ? (
            <Markdown text={content} />
          ) : null}

          {pending.length > 0 && <PendingTools tools={pending} />}

          {(showWorking || (isStreaming && !hasBlocks && status !== undefined)) && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
              <Loader2 className="size-3.5 animate-spin" />
              <span>{status || "Thinking…"}</span>
              {typeof elapsedSeconds === "number" && elapsedSeconds >= 3 && (
                <span className="tabular-nums text-muted-foreground/70">{elapsedSeconds}s</span>
              )}
            </p>
          )}
        </div>

        {fellBack && !isStreaming && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" />
            Answered by {modelLabel(servedBy!)} after a safety check declined {modelLabel(DEFAULT_MODEL)}.
          </p>
        )}

        {/* Revealed on hover / focus — only where the device can hover (always shown on touch, e.g. iPad). */}
        {!isStreaming && hasVisibleContent && (
          <div className="-ml-2 flex items-center gap-0.5 transition-opacity md:[@media(hover:hover)]:opacity-0 md:focus-within:opacity-100 md:group-hover/message:opacity-100">
            <IconAction label={copied ? "Copied" : "Copy reply"} onClick={copyReply}>
              {copied ? <Check /> : <Copy />}
            </IconAction>
            {hasOutputs && (
              <IconAction label={exporting ? "Preparing PDF…" : "Download as PDF"} onClick={downloadPdf}>
                {exporting ? <Loader2 className="animate-spin" /> : <FileDown />}
              </IconAction>
            )}
            {onRetry && (
              <IconAction label="Regenerate reply" onClick={onRetry}>
                <RotateCcw />
              </IconAction>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Memoized: earlier messages don't re-render on every streamed token. */
export const ChatMessage = memo(ChatMessageImpl);
