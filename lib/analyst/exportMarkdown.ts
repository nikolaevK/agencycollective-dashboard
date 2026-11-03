/**
 * Markdown export of AI Analyst messages (pure): "Copy" on one reply and
 * "Export conversation" both use it, so charts / tables / reports survive a
 * paste into Docs, Notion or Slack as readable text and tables.
 */

import type {
  ChatMessage,
  ContentBlock,
  DisplayChartInput,
  DisplayMetricsInput,
  DisplayTableInput,
  ReportResult,
} from "@/types/chat";
import { formatValue } from "@/lib/analyst/format";

function cell(v: string): string {
  return v.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.map(cell).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  return [head, sep, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)].join("\n");
}

function metricsMd(input: DisplayMetricsInput): string {
  return (input.metrics ?? [])
    .map((m) => `- **${m.label}:** ${m.value}${m.subtitle ? ` (${m.subtitle})` : ""}`)
    .join("\n");
}

function tableMd(input: DisplayTableInput): string {
  const cols = input.columns ?? [];
  const rows = (input.rows ?? []).map((row) => cols.map((c) => formatValue(row[c.key], c.format, input.currency)));
  return `${input.title ? `**${input.title}**\n\n` : ""}${mdTable(cols.map((c) => c.label), rows)}`;
}

function chartMd(input: DisplayChartInput): string {
  const x = input.xAxisKey || "name";
  const metrics = input.metrics ?? [];
  const rows = (input.data ?? []).map((p) => [
    String(p[x] ?? ""),
    ...metrics.map((m) => formatValue(p[m], input.valueFormat ?? "number", input.currency)),
  ]);
  return `**${input.title || "Chart"}** (${input.type} chart)\n\n${mdTable([x, ...metrics], rows)}`;
}

function reportMd(report: ReportResult): string {
  const parts = [`### ${report.title}`, `_${report.period}_`];
  for (const s of report.sections ?? []) {
    parts.push(`#### ${s.title}`, s.summary);
    if (s.metrics?.length) parts.push(metricsMd({ metrics: s.metrics }));
    if (s.tableData) parts.push(tableMd(s.tableData));
  }
  return parts.join("\n\n");
}

function blockMd(block: ContentBlock, all: ContentBlock[]): string | null {
  switch (block.type) {
    case "text":
      return block.text.trim() || null;
    case "notice":
      return block.kind === "fallback" ? null : `> ${block.text}`;
    case "tool_use": {
      const input = block.input as Record<string, unknown>;
      if (block.name === "display_metrics") return metricsMd(input as unknown as DisplayMetricsInput);
      if (block.name === "display_table") return tableMd(input as unknown as DisplayTableInput);
      if (block.name === "display_chart") return chartMd(input as unknown as DisplayChartInput);
      if (block.name === "generate_report") {
        const result = all.find((b) => b.type === "tool_result" && b.tool_use_id === block.id);
        if (result?.type === "tool_result" && typeof result.content === "object" && result.content && !result.isError) {
          return reportMd(result.content as ReportResult);
        }
        return null;
      }
      if (block.name === "fetch_landing_page" && typeof input.url === "string") return `_Read ${input.url}_`;
      return null;
    }
    default:
      return null;
  }
}

/** One message as markdown (assistant blocks rendered to text/tables). */
export function messageToMarkdown(message: ChatMessage): string {
  if (message.role === "user" || !message.blocks?.length) return message.content.trim();
  return message.blocks
    .map((b) => blockMd(b, message.blocks!))
    .filter((s): s is string => Boolean(s))
    .join("\n\n");
}

export function conversationToMarkdown(
  messages: ChatMessage[],
  meta: { title: string; subtitle?: string; exportedAt?: Date }
): string {
  const when = (meta.exportedAt ?? new Date()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const header = [`# ${meta.title}`, [meta.subtitle, `Exported ${when}`].filter(Boolean).join(" · ")].join("\n\n");
  const body = messages
    .map((m) => {
      const text = messageToMarkdown(m);
      if (!text) return null;
      return m.role === "user" ? `## You\n\n${text}` : `## AI Analyst\n\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
  return `${header}\n\n${body}\n`;
}
