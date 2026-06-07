"use client";

import { useState, useRef, useEffect, useCallback, Component, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Square,
  Megaphone,
  FileText,
  Check,
  Loader2,
  FileSpreadsheet,
  ClipboardList,
  Pencil,
  Download,
  BarChart3,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { CHAT_MODELS, DEFAULT_MODEL, type ChatModelId } from "@/lib/chatModels";
import { parseSSEStream } from "@/lib/chatStreamParser";
import type { ReportResult, ReportSectionResult } from "@/types/chat";

// Lazy-loaded: ReportCard pulls in the chart renderer (recharts), which we
// don't want in the chat's initial bundle — load it only when a report renders.
const ReportCard = dynamic(
  () => import("@/components/chat/tool-renderers/ReportCard").then((m) => ({ default: m.ReportCard })),
  { ssr: false, loading: () => <div className="my-3 flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Building report…</div> }
);

// ─── Local message model ─────────────────────────────────────────────────────

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string; // user text or accumulated assistant text
  blocks?: Block[];
}

interface ApiBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

const SUGGESTIONS = [
  { icon: ClipboardList, label: "Draft a Meta creative-testing SOP", prompt: "Draft a complete SOP for running Meta creative tests, including angles, batch sizing, the staged elimination process, and how to call winners." },
  { icon: FileText, label: "Write a TikTok campaign brief", prompt: "Write a TikTok Ads campaign brief template for a new DTC client launch, with objective, audience, angles, hooks, and KPIs." },
  { icon: BarChart3, label: "Generate a client performance report", prompt: "Generate a monthly performance review report for a DTC client across Meta and TikTok. Include an Executive Summary, KPI cards (ROAS, CPA, CPM, hook rate), a channel-breakdown table, and a Recommendations section with owners and due dates. Use clearly-labeled placeholders where I haven't given you numbers." },
  { icon: Pencil, label: "Correct a brief I paste", prompt: "I'm going to paste a campaign brief. Proofread and improve it for clarity, structure, and completeness, then return the corrected version." },
];

// ─── Markdown styling ────────────────────────────────────────────────────────

const mdComponents = {
  h1: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="text-lg font-bold mt-4 mb-2" {...p} />,
  h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="text-base font-bold mt-4 mb-2" {...p} />,
  h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="text-sm font-semibold mt-3 mb-1.5" {...p} />,
  p: (p: React.HTMLAttributes<HTMLParagraphElement>) => <p className="my-2 leading-relaxed" {...p} />,
  ul: (p: React.HTMLAttributes<HTMLUListElement>) => <ul className="my-2 ml-5 list-disc space-y-1" {...p} />,
  ol: (p: React.HTMLAttributes<HTMLOListElement>) => <ol className="my-2 ml-5 list-decimal space-y-1" {...p} />,
  li: (p: React.HTMLAttributes<HTMLLIElement>) => <li className="leading-relaxed" {...p} />,
  strong: (p: React.HTMLAttributes<HTMLElement>) => <strong className="font-semibold text-foreground" {...p} />,
  code: (p: React.HTMLAttributes<HTMLElement>) => <code className="rounded bg-muted px-1 py-0.5 text-xs" {...p} />,
};

// ─── History conversion (Anthropic-required tool block structure) ────────────

function messagesToApi(msgs: Message[]): Array<{ role: "user" | "assistant"; content: string | ApiBlock[] }> {
  const out: Array<{ role: "user" | "assistant"; content: string | ApiBlock[] }> = [];
  for (const msg of msgs) {
    if (msg.role === "user") {
      out.push({ role: "user", content: msg.content });
      continue;
    }
    if (!msg.blocks || msg.blocks.length === 0) {
      if (msg.content) out.push({ role: "assistant", content: msg.content });
      continue;
    }
    // Anthropic rejects a tool_use that has no matching tool_result (and vice
    // versa). A mid-tool Stop can leave an orphaned tool_use in history, so we
    // only forward tool_use/tool_result blocks that are fully paired.
    const resultIds = new Set(
      msg.blocks.filter((b) => b.type === "tool_result").map((b) => (b as { tool_use_id: string }).tool_use_id)
    );
    const pairedUseIds = new Set<string>();
    const assistant: ApiBlock[] = [];
    const toolResults: ApiBlock[] = [];
    const continuation: ApiBlock[] = [];
    let seenResult = false;
    for (const b of msg.blocks) {
      if (b.type === "text") {
        if (!b.text) continue;
        (seenResult ? continuation : assistant).push({ type: "text", text: b.text });
      } else if (b.type === "tool_use") {
        if (!resultIds.has(b.id)) continue; // orphaned (e.g. aborted) — drop it
        pairedUseIds.add(b.id);
        assistant.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
      } else if (b.type === "tool_result") {
        if (!pairedUseIds.has(b.tool_use_id)) continue; // result without a kept tool_use
        seenResult = true;
        toolResults.push({ type: "tool_result", tool_use_id: b.tool_use_id, content: b.content });
      }
    }
    if (assistant.length) out.push({ role: "assistant", content: assistant });
    if (toolResults.length) out.push({ role: "user", content: toolResults });
    if (continuation.length) out.push({ role: "assistant", content: continuation });
  }
  return out;
}

// ─── Saveable document card ──────────────────────────────────────────────────

function DocumentCard({
  input,
  isCorrection,
  onSaved,
}: {
  input: Record<string, unknown>;
  isCorrection: boolean;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const title = String(input.title ?? "Untitled document");
  const docType = String(input.docType ?? "other");
  const platform = input.platform ? String(input.platform) : undefined;
  const markdown = String(input.markdown ?? "");
  const summary = input.summary ? String(input.summary) : "";

  function pdfFileName(): string {
    let name = title.replace(/[/\\]/g, "-").trim().slice(0, 180) || "document";
    if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
    return name;
  }

  // Render the markdown into a branded PDF (heavy @react-pdf dep lazy-loaded).
  async function buildPdfBlob(): Promise<Blob> {
    const [{ pdf }, { MarkdownPdf }] = await Promise.all([
      import("@react-pdf/renderer"),
      import("./MarkdownPdf"),
    ]);
    const generatedOn = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    return pdf(<MarkdownPdf title={title} markdown={markdown} generatedOn={generatedOn} />).toBlob();
  }

  // Save into the Media Buyers directory as a real PDF (via the upload route).
  async function handleSave() {
    setSaving(true);
    setErr("");
    try {
      const blob = await buildPdfBlob();
      const fd = new FormData();
      fd.append("file", new File([blob], pdfFileName(), { type: "application/pdf" }));
      fd.append("folder", "AI Generated");
      fd.append("docType", docType);
      if (platform) fd.append("platform", platform);
      const res = await fetch("/api/admin/media-buyers/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErr(json.error || "Save failed");
      } else {
        setSaved(true);
        onSaved();
      }
    } catch {
      setErr("Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setErr("");
    try {
      const blob = await buildPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setErr("Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="my-3 rounded-2xl border border-primary/30 bg-primary/[0.03] overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {isCorrection ? "Corrected document" : "Generated document"} · {docType}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={handleDownload}
            disabled={downloading}
            title="Download as PDF"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PDF
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            title="Save as a PDF into the Media Buyers directory"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              saved
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            )}
          >
            {saved ? <Check className="h-3.5 w-3.5" /> : saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {saved ? "Saved to directory" : "Save to directory"}
          </button>
        </div>
      </div>
      {summary && (
        <div className="border-b border-border/50 bg-muted/30 px-4 py-2 text-xs text-muted-foreground prose-sm">
          <ReactMarkdown components={mdComponents}>{summary}</ReactMarkdown>
        </div>
      )}
      <div className="max-h-72 overflow-y-auto px-4 py-3 text-sm text-foreground">
        <ReactMarkdown components={mdComponents}>{markdown}</ReactMarkdown>
      </div>
      {err && <p className="px-4 pb-3 text-xs text-destructive">{err}</p>}
    </div>
  );
}

// ─── Simple table renderer ───────────────────────────────────────────────────

function ToolTable({ input }: { input: Record<string, unknown> }) {
  const title = String(input.title ?? "");
  const columns = Array.isArray(input.columns) ? (input.columns as Array<{ key: string; label: string }>) : [];
  const rows = Array.isArray(input.rows) ? (input.rows as Array<Record<string, unknown>>) : [];
  if (columns.length === 0) return null;
  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-border/50">
      {title && <p className="border-b border-border/50 bg-muted/30 px-3 py-2 text-xs font-semibold">{title}</p>}
      <table className="w-full text-xs">
        <thead className="bg-muted/20">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 text-left font-semibold text-muted-foreground">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/50">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-foreground">{String(r[c.key] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Error boundary so one malformed tool payload can't blank the chat ───────

class ToolErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: unknown) { console.error("[media-chat] tool render error:", err); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="my-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          This generated block couldn&apos;t be displayed.
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Advanced report card (reuses the AI Analyst report renderer) ────────────

function MediaReportCard({ input, onSaved }: { input: Record<string, unknown>; onSaved: () => void }) {
  // Build the ReportResult once (stable generatedAt) from the model's tool args.
  const [report] = useState<ReportResult>(() => {
    const rawSections = Array.isArray(input.sections) ? (input.sections as Record<string, unknown>[]) : [];
    const sections: ReportSectionResult[] = rawSections.map((sx) => {
      // Defensively coerce model-authored content — a malformed metric/table
      // must not throw inside ReportCard/recharts.
      const metrics = Array.isArray(sx?.metrics)
        ? (sx.metrics as unknown[])
            .map((m) => {
              const mo = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
              const trend = mo.trend === "up" || mo.trend === "down" || mo.trend === "neutral" ? mo.trend : undefined;
              return {
                label: String(mo.label ?? ""),
                value: String(mo.value ?? ""),
                subtitle: mo.subtitle != null ? String(mo.subtitle) : undefined,
                trend: trend as "up" | "down" | "neutral" | undefined,
                color: mo.color != null ? String(mo.color) : undefined,
              };
            })
            .filter((m) => m.label || m.value)
        : undefined;
      const tbl = sx?.table as Record<string, unknown> | undefined;
      const tableData =
        tbl && typeof tbl === "object" && Array.isArray(tbl.columns) && Array.isArray(tbl.rows)
          ? (tbl as unknown as ReportSectionResult["tableData"])
          : undefined;
      return {
        title: String(sx?.title ?? ""),
        summary: String(sx?.summary ?? ""),
        metrics: metrics && metrics.length ? metrics : undefined,
        tableData,
      };
    });
    return {
      title: String(input.title ?? "Report"),
      clientName: String(input.clientName ?? ""),
      period: String(input.period ?? ""),
      generatedAt: new Date().toISOString(),
      sections,
    };
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  function fileName(): string {
    let n = (report.title || "report").replace(/[/\\]/g, "-").trim().slice(0, 180) || "report";
    if (!n.toLowerCase().endsWith(".pdf")) n += ".pdf";
    return n;
  }

  async function handleSave() {
    setSaving(true);
    setErr("");
    try {
      const { buildReportPdfBlob } = await import("@/components/chat/tool-renderers/reportPdfGenerator");
      const blob = await buildReportPdfBlob(report);
      const fd = new FormData();
      fd.append("file", new File([blob], fileName(), { type: "application/pdf" }));
      fd.append("folder", "AI Generated");
      fd.append("docType", "report");
      const res = await fetch("/api/admin/media-buyers/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErr(json.error || "Save failed");
      } else {
        setSaved(true);
        onSaved();
      }
    } catch {
      setErr("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="my-1">
      <ReportCard report={report} />
      <div className="mt-1 flex items-center justify-end gap-2">
        {err && <span className="text-[11px] text-destructive">{err}</span>}
        <button
          onClick={handleSave}
          disabled={saving || saved}
          title="Save this report as a PDF in the Media Buyers directory"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            saved ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          )}
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          {saved ? "Saved to directory" : "Save to directory"}
        </button>
      </div>
    </div>
  );
}

// ─── Assistant message renderer ──────────────────────────────────────────────

function AssistantBlocks({ blocks, onSaved }: { blocks: Block[]; onSaved: () => void }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "text") {
          if (!b.text) return null;
          return (
            <div key={i} className="text-sm text-foreground">
              <ReactMarkdown components={mdComponents}>{b.text}</ReactMarkdown>
            </div>
          );
        }
        if (b.type === "tool_use") {
          let node: React.ReactNode = null;
          if (b.name === "generate_document") node = <DocumentCard input={b.input} isCorrection={false} onSaved={onSaved} />;
          else if (b.name === "correct_document") node = <DocumentCard input={b.input} isCorrection onSaved={onSaved} />;
          else if (b.name === "generate_report") node = <MediaReportCard input={b.input} onSaved={onSaved} />;
          else if (b.name === "display_table") node = <ToolTable input={b.input} />;
          return node ? <ToolErrorBoundary key={i}>{node}</ToolErrorBoundary> : null;
        }
        return null;
      })}
    </>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function MediaChatInterface() {
  const queryClient = useQueryClient();
  const [model, setModel] = useState<ChatModelId>(DEFAULT_MODEL);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false); // synchronous guard against double-send before isLoading re-renders
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const onSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["media-documents"] });
    queryClient.invalidateQueries({ queryKey: ["media-activity"] });
  }, [queryClient]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading || sendingRef.current) return;
      sendingRef.current = true;

      const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
      const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", content: "", blocks: [] };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput("");
      setIsLoading(true);
      if (textareaRef.current) textareaRef.current.style.height = "auto";

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const apiMessages = messagesToApi([...messages, userMessage]);
        const res = await fetch("/api/media-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, model }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `HTTP ${res.status}`);
        }

        for await (const event of parseSSEStream(res.body!)) {
          if (controller.signal.aborted) break;
          if (event.type === "text_delta") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const blocks = [...(last.blocks ?? [])];
              const lastBlock = blocks[blocks.length - 1];
              if (lastBlock?.type === "text") {
                blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + event.text };
              } else {
                blocks.push({ type: "text", text: event.text });
              }
              return [...prev.slice(0, -1), { ...last, content: last.content + event.text, blocks }];
            });
          } else if (event.type === "tool_use") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const blocks = [...(last.blocks ?? [])];
              blocks.push({ type: "tool_use", id: event.id, name: event.name, input: event.input });
              return [...prev.slice(0, -1), { ...last, blocks }];
            });
          } else if (event.type === "tool_result") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const blocks = [...(last.blocks ?? [])];
              blocks.push({ type: "tool_result", tool_use_id: event.tool_use_id, content: String(event.result ?? "") });
              return [...prev.slice(0, -1), { ...last, blocks }];
            });
          } else if (event.type === "error") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const blocks = [...(last.blocks ?? [])];
              blocks.push({ type: "text", text: `\n\n*Error: ${event.message}*` });
              return [...prev.slice(0, -1), { ...last, content: last.content + `\n\n*Error: ${event.message}*`, blocks }];
            });
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const errorText = err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          const blocks = [...(last.blocks ?? [])];
          blocks.push({ type: "text", text: `*Error: ${errorText}*` });
          return [...prev.slice(0, -1), { ...last, content: `*Error: ${errorText}*`, blocks }];
        });
      } finally {
        setIsLoading(false);
        sendingRef.current = false;
        abortRef.current = null;
      }
    },
    [messages, isLoading, model]
  );

  function handleStop() {
    abortRef.current?.abort();
    setIsLoading(false);
    sendingRef.current = false;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const lastMsg = messages[messages.length - 1];
  const isThinking = isLoading && lastMsg?.role === "assistant" && (!lastMsg.blocks || lastMsg.blocks.length === 0);

  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-[24rem] flex-col rounded-2xl border border-border/50 bg-card overflow-hidden md:h-[calc(100vh-16rem)] md:min-h-[28rem]">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground">Media Buyer Assistant</span>
        </div>
        {CHAT_MODELS.length > 1 ? (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ChatModelId)}
            disabled={isLoading}
            className="h-7 rounded-full border border-border bg-muted/40 px-2 text-[11px] text-muted-foreground disabled:opacity-50"
          >
            {CHAT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        ) : (
          <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {CHAT_MODELS[0].label}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 space-y-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-xl">
              <Megaphone className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">Media Buyer Assistant</h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Draft and correct SOPs, briefs, audits, and reports for Meta, TikTok &amp; Google. Generated docs save straight to your directory.
              </p>
            </div>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    onClick={() => sendMessage(s.prompt)}
                    className="flex items-center gap-3 rounded-xl border border-border/50 bg-background p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-xs font-medium text-foreground">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            if (isThinking && i === messages.length - 1) return null;
            if (msg.role === "user") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {msg.content}
                  </div>
                </div>
              );
            }
            return (
              <div key={msg.id} className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Megaphone className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <AssistantBlocks blocks={msg.blocks ?? []} onSaved={onSaved} />
                </div>
              </div>
            );
          })
        )}
        {isThinking && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Megaphone className="h-4 w-4 animate-pulse text-primary" />
            </div>
            <div className="flex items-center gap-1.5 pt-2">
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:py-3">
        <div className="relative flex items-end gap-2 rounded-2xl border border-border/50 bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-primary/20">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask for a document, or paste one to correct…"
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
            style={{ maxHeight: "160px" }}
          />
          {isLoading ? (
            <button
              onClick={handleStop}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20"
              title="Stop"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim()}
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                input.trim() ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              title="Send (Enter)"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          AI can make mistakes. Review documents before sharing or acting on them.
        </p>
      </div>
    </div>
  );
}
