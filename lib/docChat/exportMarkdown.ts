/**
 * Markdown export for the document assistants (pure): "Copy" on a reply and
 * "Export conversation" both use it, so generated documents, reports, tables
 * and SOPs paste into Docs / Notion / Slack as readable markdown instead of
 * vanishing (they live in tool calls, not in the reply text).
 */

import type { ChatMessage, ContentBlock } from "@/types/chat";
import { formatValue, type ValueFormat } from "@/lib/analyst/format";

type Input = Record<string, unknown>;

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

function list(v: unknown): Input[] {
  return Array.isArray(v) ? v.filter((x): x is Input => typeof x === "object" && x !== null && !Array.isArray(x)) : [];
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.map(s).filter(Boolean) : [];
}

function cell(v: string): string {
  return v.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function tableMd(table: Input): string {
  const columns = list(table.columns).filter((c) => s(c.key));
  if (columns.length === 0) return "";
  const head = `| ${columns.map((c) => cell(s(c.label) || s(c.key))).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const rows = list(table.rows).map(
    (r) => `| ${columns.map((c) => cell(formatValue(r[s(c.key)], (s(c.format) || "text") as ValueFormat))).join(" | ")} |`
  );
  const title = s(table.title);
  return [title ? `**${title}**\n` : "", [head, sep, ...rows].join("\n")].filter(Boolean).join("\n");
}

function metricsMd(metrics: Input[]): string {
  return metrics.map((m) => `- **${s(m.label)}:** ${s(m.value)}${s(m.subtitle) ? ` (${s(m.subtitle)})` : ""}`).join("\n");
}

// ─── Media Buyers tools ──────────────────────────────────────────────────────

/** Markdown for a Media Buyer tool call (null = nothing to export). */
export function mediaToolMarkdown(name: string, input: Input): string | null {
  switch (name) {
    case "generate_document":
    case "correct_document": {
      const parts = [`## ${s(input.title) || "Document"}`];
      if (s(input.summary)) parts.push(`**Changes made**\n\n${s(input.summary)}`);
      parts.push(s(input.markdown));
      return parts.filter(Boolean).join("\n\n");
    }
    case "generate_report": {
      const meta = [s(input.clientName), s(input.period)].filter(Boolean).join(" · ");
      const parts = [`## ${s(input.title) || "Report"}`, meta ? `_${meta}_` : ""];
      for (const section of list(input.sections)) {
        parts.push(`### ${s(section.title)}`, s(section.summary));
        const metrics = list(section.metrics);
        if (metrics.length > 0) parts.push(metricsMd(metrics));
        if (section.table && typeof section.table === "object") parts.push(tableMd(section.table as Input));
      }
      return parts.filter(Boolean).join("\n\n");
    }
    case "display_table":
      return tableMd(input) || null;
    default:
      return null;
  }
}

// ─── SOP tool ────────────────────────────────────────────────────────────────

function sopBlockMd(block: Input): string {
  const title = s(block.title);
  const heading = title ? `**${title}**\n\n` : "";
  switch (block.type) {
    case "text":
      return s(block.body);
    case "callout":
      return `> ${title ? `**${title}:** ` : ""}${s(block.body).replace(/\n/g, "\n> ")}`;
    case "stat":
      return `**${s(block.value)}** — ${s(block.label)}${s(block.caption) ? ` (${s(block.caption)})` : ""}`;
    case "checklist": {
      const items = strings(block.items).map((i) => (block.marker === "dot" ? `- ${i}` : `- [ ] ${i}`));
      return `${heading}${items.join("\n")}${s(block.note) ? `\n\n_${s(block.note)}_` : ""}`;
    }
    case "steps": {
      const ordered = block.ordered !== false;
      const steps = list(block.steps).map((step, i) => {
        const marker = ordered ? `${i + 1}.` : "-";
        const detail = s(step.detail);
        return `${marker} ${s(step.text)}${detail ? `\n   ${detail.replace(/\n/g, "\n   ")}` : ""}`;
      });
      return `${heading}${steps.join("\n")}`;
    }
    case "cards":
      return list(block.items)
        .map((c) => `- **${s(c.label)}**${s(c.desc) ? ` — ${s(c.desc)}` : ""}`)
        .join("\n");
    case "columns":
      return list(block.items)
        .map((c) => {
          const badge = s(c.badge) ? ` (${s(c.badge)})` : "";
          const lines = [`**${s(c.title)}**${badge}`];
          if (s(c.body)) lines.push(s(c.body));
          lines.push(...strings(c.bullets).map((b) => `- ${b}`));
          return lines.join("\n");
        })
        .join("\n\n");
    case "rows":
      return `${heading}${list(block.rows)
        .map((r) => `- ${s(r.label)}${s(r.value) ? `: ${s(r.value)}` : ""}`)
        .join("\n")}`;
    default:
      return "";
  }
}

/** Markdown for an SOP tool call (null = nothing to export). */
export function sopToolMarkdown(name: string, input: Input): string | null {
  if (name !== "generate_sop") return null;
  const parts = [`## ${s(input.title) || "SOP"}`, s(input.summary)];
  for (const section of list(input.sections)) {
    const num = s(section.num);
    parts.push(`### ${num ? `${num} — ` : ""}${s(section.title)}`);
    parts.push(...list(section.blocks).map(sopBlockMd));
  }
  return parts.filter(Boolean).join("\n\n");
}

// ─── Messages ────────────────────────────────────────────────────────────────

export type ToolMarkdown = (name: string, input: Input) => string | null;

function blockMd(block: ContentBlock, toolMd: ToolMarkdown): string | null {
  if (block.type === "text") return block.text.trim() || null;
  if (block.type === "tool_use") return toolMd(block.name, (block.input ?? {}) as Input);
  if (block.type === "notice" && block.kind !== "fallback") return `> ${block.text}`;
  return null;
}

export function docMessageToMarkdown(message: ChatMessage, toolMd: ToolMarkdown): string {
  if (message.role === "user" || !message.blocks?.length) return message.content.trim();
  return message.blocks
    .map((b) => blockMd(b, toolMd))
    .filter((x): x is string => Boolean(x))
    .join("\n\n");
}

export function docConversationToMarkdown(
  messages: ChatMessage[],
  meta: { title: string; assistantName: string; exportedAt?: Date },
  toolMd: ToolMarkdown
): string {
  const when = (meta.exportedAt ?? new Date()).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const body = messages
    .map((m) => {
      const text = docMessageToMarkdown(m, toolMd);
      if (!text) return null;
      return m.role === "user" ? `## You\n\n${text}` : `## ${meta.assistantName}\n\n${text}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
  return `# ${meta.title}\n\nExported ${when}\n\n${body}\n`;
}
