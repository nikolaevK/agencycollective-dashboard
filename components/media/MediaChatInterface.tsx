"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, ClipboardList, Copy, Download, FileText, Loader2, Megaphone, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { badgeTone } from "@/components/ui/badge";
import { InlineTable } from "@/components/chat/tool-renderers/InlineTable";
import { DocChat, type DocChatSuggestion } from "@/components/doc-chat/DocChat";
import { docConversationToMarkdown, docMessageToMarkdown, mediaToolMarkdown } from "@/lib/docChat/exportMarkdown";
import { markOutputSaved, savedOutput } from "@/lib/docChat/store";
import type { ChatMessage, DisplayTableInput, ReportResult, ReportSectionResult, ToolUseBlock } from "@/types/chat";

// Lazy: the report card pulls in the chart renderer, markdown pulls in
// react-markdown — neither belongs in the Media Buyers page's first load.
const ReportCard = dynamic(() => import("@/components/chat/tool-renderers/ReportCard").then((m) => m.ReportCard), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full rounded-3xl" />,
});
const Markdown = dynamic(() => import("@/components/chat/Markdown"), {
  loading: () => <Skeleton className="h-4 w-2/3 rounded-full" />,
});

const SUGGESTIONS: DocChatSuggestion[] = [
  {
    icon: ClipboardList,
    title: "Draft a Meta creative-testing SOP",
    description: "Angles, batch sizing, staged elimination and calling winners.",
    prompt: "Draft a complete SOP for running Meta creative tests, including angles, batch sizing, the staged elimination process, and how to call winners.",
  },
  {
    icon: FileText,
    title: "Write a TikTok campaign brief",
    description: "A launch brief template for a new DTC client.",
    prompt: "Write a TikTok Ads campaign brief template for a new DTC client launch, with objective, audience, angles, hooks, and KPIs.",
  },
  {
    icon: BarChart3,
    title: "Generate a client performance report",
    description: "KPI cards, a channel table and owned recommendations.",
    prompt: "Generate a monthly performance review report for a DTC client across Meta and TikTok. Include an Executive Summary, KPI cards (ROAS, CPA, CPM, hook rate), a channel-breakdown table, and a Recommendations section with owners and due dates. Use clearly-labeled placeholders where I haven't given you numbers.",
  },
  {
    icon: Pencil,
    title: "Correct a brief I paste",
    description: "Paste it after this prompt — proofread, restructured, completed.",
    prompt: "Proofread and improve this campaign brief for clarity, structure, and completeness, then return the corrected version:\n\n",
    fill: true,
  },
];

const DOC_TYPE_LABEL: Record<string, string> = {
  sop: "SOP",
  creative_brief: "Creative brief",
  campaign_brief: "Campaign brief",
  account_audit: "Account audit",
  media_plan: "Media plan",
  report: "Report",
  post_mortem: "Post-mortem",
  other: "Document",
};
const PLATFORM_LABEL: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google", cross: "Cross-platform" };

function pdfFileName(title: string, fallback: string): string {
  let name = title.replace(/[/\\:*?"<>|]/g, "-").trim().slice(0, 180) || fallback;
  if (!name.toLowerCase().endsWith(".pdf")) name += ".pdf";
  return name;
}

/** Save a PDF into the Media Buyers directory ("AI Generated" folder). Throws the route's message. */
async function uploadPdf(blob: Blob, fileName: string, docType: string, platform?: string): Promise<void> {
  const fd = new FormData();
  fd.append("file", new File([blob], fileName, { type: "application/pdf" }));
  fd.append("folder", "AI Generated");
  fd.append("docType", docType);
  if (platform) fd.append("platform", platform);
  const res = await fetch("/api/admin/media-buyers/documents", { method: "POST", body: fd });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(typeof json.error === "string" ? json.error : "Save failed");
  }
}

function useInvalidateDirectory() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["media-documents"] });
    queryClient.invalidateQueries({ queryKey: ["media-activity"] });
  };
}

/** "Saved to directory" — success-toned, not a live action. */
function SavedButton() {
  return (
    <Button size="sm" variant="outline" disabled className={cn("disabled:opacity-100", badgeTone.success)}>
      <Check />
      Saved to directory
    </Button>
  );
}

// ─── Saveable document card ──────────────────────────────────────────────────

const DocumentCard = memo(function DocumentCard({ tool, isCorrection }: { tool: ToolUseBlock; isCorrection: boolean }) {
  const invalidate = useInvalidateDirectory();
  const input = tool.input as Record<string, unknown>;
  const title = String(input.title ?? "Untitled document");
  const docType = String(input.docType ?? "other");
  const platform = typeof input.platform === "string" ? input.platform : undefined;
  const markdown = String(input.markdown ?? "");
  const summary = typeof input.summary === "string" ? input.summary : "";

  const [busy, setBusy] = useState<null | "save" | "pdf">(null);
  const [saved, setSaved] = useState(() => savedOutput(tool.id) !== undefined);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const clipRef = useRef<HTMLDivElement>(null);

  // Show the expand toggle only when the collapsed preview actually clips.
  useEffect(() => {
    const el = clipRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);

  // The markdown → branded PDF renderer (heavy @react-pdf) loads on first use.
  async function buildPdf(): Promise<Blob> {
    const [{ pdf }, { MarkdownPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./MarkdownPdf")]);
    const generatedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    return pdf(<MarkdownPdf title={title} markdown={markdown} generatedOn={generatedOn} />).toBlob();
  }

  async function handleSave() {
    setBusy("save");
    setErr("");
    try {
      await uploadPdf(await buildPdf(), pdfFileName(title, "document"), docType, platform);
      markOutputSaved(tool.id);
      setSaved(true);
      invalidate();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    setBusy("pdf");
    setErr("");
    try {
      const url = URL.createObjectURL(await buildPdf());
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFileName(title, "document");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setErr("Download failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(mediaToolMarkdown(tool.name, input) ?? markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setErr("Couldn't copy to the clipboard.");
    }
  }

  const meta = [isCorrection ? "Corrected document" : "Generated document", DOC_TYPE_LABEL[docType] ?? docType, platform ? PLATFORM_LABEL[platform] : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="min-w-0 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="flex min-w-0 items-start gap-3">
          <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h4 className="break-words text-sm font-semibold tracking-tight">{title}</h4>
            <p className="text-xs text-muted-foreground">{meta}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy document as markdown"}
            title={copied ? "Copied" : "Copy as markdown"}
            className="text-muted-foreground"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownload} disabled={busy !== null} title="Download as PDF">
            {busy === "pdf" ? <Loader2 className="animate-spin" /> : <Download />}
            PDF
          </Button>
          {saved ? (
            <SavedButton />
          ) : (
            <Button size="sm" onClick={handleSave} disabled={busy !== null} title="Save as a PDF into the Media Buyers directory">
              {busy === "save" ? <Loader2 className="animate-spin" /> : <FileText />}
              Save to directory
            </Button>
          )}
        </div>
        {err && (
          <p role="alert" className="w-full text-xs text-destructive">
            {err}
          </p>
        )}
      </div>
      {summary && (
        <div className="border-b bg-muted/40 px-4 py-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Changes made</p>
          <Markdown text={summary} />
        </div>
      )}
      <div className="px-4 py-3">
        <div
          ref={clipRef}
          className={cn(!expanded && "max-h-80 overflow-hidden", !expanded && overflowing && "[mask-image:linear-gradient(to_bottom,black_75%,transparent)]")}
        >
          <Markdown text={markdown} />
        </div>
        {(expanded || overflowing) && (
          <Button variant="ghost" size="xs" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="mt-1 text-muted-foreground">
            {expanded ? "Show less" : "Show full document"}
          </Button>
        )}
      </div>
    </Card>
  );
});

// ─── Report card (reuses the AI Analyst report renderer) ─────────────────────

function toReport(input: Record<string, unknown>): ReportResult {
  const rawSections = Array.isArray(input.sections) ? (input.sections as Record<string, unknown>[]) : [];
  const sections: ReportSectionResult[] = rawSections.map((sx) => {
    const metrics = Array.isArray(sx?.metrics) ? (sx.metrics as NonNullable<ReportSectionResult["metrics"]>) : undefined;
    const tbl = sx?.table as Record<string, unknown> | undefined;
    const tableData =
      tbl && Array.isArray(tbl.columns) && Array.isArray(tbl.rows)
        ? ({ title: String(tbl.title ?? ""), columns: tbl.columns, rows: tbl.rows } as DisplayTableInput)
        : undefined;
    return {
      title: String(sx?.title ?? ""),
      summary: String(sx?.summary ?? ""),
      ...(metrics && metrics.length > 0 ? { metrics } : {}),
      ...(tableData ? { tableData } : {}),
    };
  });
  return {
    title: String(input.title ?? "Report"),
    clientName: String(input.clientName ?? ""),
    period: String(input.period ?? ""),
    generatedAt: new Date().toISOString(),
    sections,
  };
}

const MediaReportCard = memo(function MediaReportCard({ tool }: { tool: ToolUseBlock }) {
  const invalidate = useInvalidateDirectory();
  // The route already validated + normalized the sections (lib/mediaChatTools).
  const report = useMemo(() => toReport(tool.input as Record<string, unknown>), [tool.input]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(() => savedOutput(tool.id) !== undefined);
  const [err, setErr] = useState("");

  async function handleSave() {
    setSaving(true);
    setErr("");
    try {
      const { buildReportPdfBlob } = await import("@/components/chat/tool-renderers/reportPdfGenerator");
      await uploadPdf(await buildReportPdfBlob(report), pdfFileName(report.title, "report"), "report");
      markOutputSaved(tool.id);
      setSaved(true);
      invalidate();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <ReportCard report={report} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {err && (
          <p role="alert" className="text-xs text-destructive">
            {err}
          </p>
        )}
        {saved ? (
          <SavedButton />
        ) : (
          <Button size="sm" onClick={handleSave} disabled={saving} title="Save this report as a PDF in the Media Buyers directory">
            {saving ? <Loader2 className="animate-spin" /> : <FileText />}
            Save to directory
          </Button>
        )}
      </div>
    </div>
  );
});

// ─── Wiring (module-level: the messages are memoized on these) ──────────────

function renderMediaTool(tool: ToolUseBlock) {
  switch (tool.name) {
    case "generate_document":
      return <DocumentCard tool={tool} isCorrection={false} />;
    case "correct_document":
      return <DocumentCard tool={tool} isCorrection />;
    case "generate_report":
      return <MediaReportCard tool={tool} />;
    case "display_table":
      return <InlineTable input={tool.input as DisplayTableInput} />;
    default:
      return null;
  }
}

const PENDING_LABEL: Record<string, string> = {
  generate_document: "Writing the document…",
  correct_document: "Correcting the document…",
  generate_report: "Building the report…",
  display_table: "Building the table…",
};

function mediaPendingLabel(name: string): string {
  return PENDING_LABEL[name] ?? "Working…";
}

function mediaMessageMarkdown(message: ChatMessage): string {
  return docMessageToMarkdown(message, mediaToolMarkdown);
}

function mediaConversationMarkdown(messages: ChatMessage[]): string {
  return docConversationToMarkdown(
    messages,
    { title: "Media Buyer Assistant conversation", assistantName: "Media Buyer Assistant" },
    mediaToolMarkdown
  );
}

export function MediaChatInterface() {
  return (
    <DocChat
      endpoint="/api/media-chat"
      storeKey="media-chat"
      title="Media Buyer Assistant"
      icon={Megaphone}
      emptyTitle="Media Buyer Assistant"
      emptyDescription="Draft and correct SOPs, briefs, audits and reports for Meta, TikTok & Google. Generated docs save straight to your directory."
      suggestions={SUGGESTIONS}
      placeholder="Ask for a document, or paste one to correct…"
      disclaimer="AI can make mistakes. Review documents before sharing or acting on them."
      exportName="media-assistant"
      conversationToMarkdown={mediaConversationMarkdown}
      renderTool={renderMediaTool}
      pendingLabel={mediaPendingLabel}
      toMarkdown={mediaMessageMarkdown}
    />
  );
}
