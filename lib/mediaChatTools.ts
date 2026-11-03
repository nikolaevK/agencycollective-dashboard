import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { MEDIA_DOC_TYPES, MEDIA_PLATFORMS, isMediaDocType, isMediaPlatform } from "@/lib/mediaDocuments";
import {
  cleanLabel,
  cleanTable,
  cleanText,
  deepStripImages,
  isPlainObject,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  stripMarkdownImages,
  type PreparedTool,
} from "@/lib/docChat/toolInput";

/**
 * Tools for the Media Buyer assistant. All are presentational: the model
 * writes the content straight into the tool input, the route validates and
 * normalizes it (prepareMediaTool) and the chat renders it — a saveable
 * document card, a report card or a table. Nothing runs server-side.
 */

const TABLE_COLUMNS_SCHEMA = {
  type: "array",
  maxItems: MAX_TABLE_COLUMNS,
  items: {
    type: "object",
    properties: {
      key: { type: "string", description: "Data key in the row objects" },
      label: { type: "string", description: "Column header" },
      format: {
        type: "string",
        enum: ["currency", "percent", "number", "text"],
        description: "How values print: currency = USD amount, percent = the percentage itself (34 → 34%), number, text.",
      },
    },
    required: ["key", "label"],
  },
} as const;

const TABLE_ROWS_SCHEMA = {
  type: "array",
  maxItems: MAX_TABLE_ROWS,
  description: "Row objects keyed by column key. Numbers as plain numbers (1234.5, not \"$1,234.50\").",
  items: { type: "object" },
} as const;

const MARKDOWN_RULES =
  "GitHub-flavored markdown: headings, bullet/numbered lists, tables, bold/italics, `code`. No images, raw HTML or emoji (they don't render in the PDF). Don't open with a level-1 heading that repeats the title — the card and the PDF already show it.";

export const MEDIA_CHAT_TOOLS: BetaTool[] = [
  {
    name: "generate_document",
    description:
      "Show a finished media-buying document (SOP, creative brief, campaign brief, account audit, media plan, report, post-mortem, checklist) to the user as a document card with Save to directory, PDF and Copy buttons. Use it whenever the user asks you to draft, write or create a document. Put the COMPLETE document in `markdown` — the card shows it in full, so don't repeat it in your chat text.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          maxLength: 200,
          description: "Short document title, also the file name, e.g. 'Meta Creative Testing SOP'",
        },
        docType: {
          type: "string",
          enum: [...MEDIA_DOC_TYPES],
          description: "Document category. Use 'other' if none fit.",
        },
        platform: {
          type: "string",
          enum: [...MEDIA_PLATFORMS],
          description: "Optional ad platform the document relates to.",
        },
        markdown: { type: "string", description: `The complete document. ${MARKDOWN_RULES}` },
      },
      required: ["title", "docType", "markdown"],
    },
  },
  {
    name: "correct_document",
    description:
      "Show a corrected/improved version of a document the user pasted as a document card (Save to directory, PDF, Copy). Use it when the user pastes a document and asks you to fix, edit, proofread or improve it. Put the full corrected document in `markdown` and a short bullet list of what you changed in `summary`; don't repeat the document in your chat text.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200, description: "Title / file name for the corrected document." },
        docType: {
          type: "string",
          enum: [...MEDIA_DOC_TYPES],
          description: "Document category. Use 'other' if none fit.",
        },
        platform: {
          type: "string",
          enum: [...MEDIA_PLATFORMS],
          description: "Optional ad platform the document relates to.",
        },
        summary: { type: "string", description: "Short markdown bullet list of the changes made." },
        markdown: { type: "string", description: `The complete corrected document. ${MARKDOWN_RULES}` },
      },
      required: ["title", "markdown"],
    },
  },
  {
    name: "generate_report",
    description:
      "Show a polished, branded multi-section REPORT as a report card with KPI cards and data tables (PDF download, or save to the directory). Use it instead of generate_document when the user asks for a report, client summary, performance review, audit report or any formal client-facing deliverable that benefits from KPI cards and tables. You have NO live ad-account data: fill metrics and tables from numbers the user gives you, or use clearly-labeled placeholders like '[insert]'. Lead with an Executive Summary section and end with a Recommendations section (each recommendation owned, with a due date).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: 200, description: "Report title, e.g. 'Q2 Performance Review — ACME'" },
        clientName: { type: "string", description: "Client / brand name" },
        period: { type: "string", description: "Reporting period, e.g. 'Last 30 days', 'June 2026'" },
        sections: {
          type: "array",
          minItems: 1,
          maxItems: 30,
          description: "Report sections in order. Lead with an executive summary; end with recommendations.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Section heading" },
              summary: { type: "string", description: "Narrative prose for this section (plain text, no markdown)." },
              metrics: {
                type: "array",
                maxItems: 8,
                description: "Optional KPI cards for this section (2–6).",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "e.g. 'ROAS', 'CPA', 'Hook Rate'" },
                    value: { type: "string", description: "Formatted value, e.g. '4.2x', '$31', '34%'" },
                    subtitle: { type: "string", description: "Optional context, e.g. 'vs $38 last period'" },
                    trend: { type: "string", enum: ["up", "down", "neutral"], description: "Trend indicator" },
                    color: {
                      type: "string",
                      enum: ["green", "red", "blue", "purple", "amber"],
                      description: "Optional emphasis: green = good, red = bad, amber = watch.",
                    },
                  },
                  required: ["label", "value"],
                },
              },
              table: {
                type: "object",
                description: "Optional data table for this section.",
                properties: {
                  title: { type: "string" },
                  columns: TABLE_COLUMNS_SCHEMA,
                  rows: TABLE_ROWS_SCHEMA,
                },
                required: ["columns", "rows"],
              },
            },
            required: ["title", "summary"],
          },
        },
      },
      required: ["title", "period", "sections"],
    },
  },
  {
    name: "display_table",
    description:
      "Display a formatted data table inline in the chat (the user can copy it into a spreadsheet). Use it for benchmark comparisons, KPI breakdowns or any tabular data with several rows.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Table title" },
        columns: { ...TABLE_COLUMNS_SCHEMA, description: "Column definitions" },
        rows: TABLE_ROWS_SCHEMA,
      },
      required: ["title", "columns", "rows"],
    },
  },
];

/** Every Media Buyer tool is presentational — the route validates and acknowledges it. */
export const MEDIA_DISPLAY_TOOLS = new Set(MEDIA_CHAT_TOOLS.map((t) => t.name));

const DOCUMENT_ACK =
  "Shown to the user as a document card with Save to directory, PDF and Copy buttons. Don't repeat the document in your reply — at most a line or two on what it covers or which placeholders to fill in.";
const REPORT_ACK =
  "Shown to the user as a report card with PDF and Save to directory buttons. Don't repeat the report in your reply.";
const TABLE_ACK = "Displayed to the user as a table.";

const METRIC_TRENDS: readonly string[] = ["up", "down", "neutral"];
const METRIC_COLORS: readonly string[] = ["green", "red", "blue", "purple", "amber"];

function prepareDocument(name: string, raw: Record<string, unknown>): PreparedTool {
  const title = cleanLabel(raw.title, 200);
  if (!title) return { ok: false, error: `"title" is required.` };
  const markdown = typeof raw.markdown === "string" ? stripMarkdownImages(raw.markdown).trim() : "";
  if (!markdown) return { ok: false, error: `"markdown" is required — put the complete document in it.` };
  const docType = typeof raw.docType === "string" && isMediaDocType(raw.docType) ? raw.docType : "other";
  const platform = typeof raw.platform === "string" && isMediaPlatform(raw.platform) ? raw.platform : undefined;
  const summary = name === "correct_document" ? stripMarkdownImages(cleanText(raw.summary, 4_000)) : "";
  return {
    ok: true,
    input: { title, docType, ...(platform ? { platform } : {}), ...(summary ? { summary } : {}), markdown },
    ack: DOCUMENT_ACK,
  };
}

function prepareMetrics(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  const out: Record<string, unknown>[] = [];
  for (const m of raw) {
    if (!isPlainObject(m)) continue;
    const label = cleanLabel(m.label, 60);
    const value = cleanLabel(m.value, 40);
    if (!label && !value) continue;
    const subtitle = cleanLabel(m.subtitle, 160);
    out.push({
      label,
      value,
      ...(subtitle ? { subtitle } : {}),
      ...(typeof m.trend === "string" && METRIC_TRENDS.includes(m.trend) ? { trend: m.trend } : {}),
      ...(typeof m.color === "string" && METRIC_COLORS.includes(m.color) ? { color: m.color } : {}),
    });
    if (out.length >= 8) break;
  }
  return out;
}

function prepareReport(raw: Record<string, unknown>): PreparedTool {
  const title = cleanLabel(raw.title, 200);
  if (!title) return { ok: false, error: `"title" is required.` };
  const period = cleanLabel(raw.period, 120);
  if (!period) return { ok: false, error: `"period" is required (e.g. "Last 30 days").` };
  const clientName = cleanLabel(raw.clientName, 120);

  const sections: Record<string, unknown>[] = [];
  for (const s of Array.isArray(raw.sections) ? raw.sections : []) {
    if (!isPlainObject(s)) continue;
    const sectionTitle = cleanLabel(s.title, 160);
    const summary = cleanText(s.summary, 8_000);
    const metrics = prepareMetrics(s.metrics);
    const table = cleanTable(s.table);
    if (!sectionTitle && !summary && metrics.length === 0 && !table) continue;
    sections.push({
      title: sectionTitle,
      summary,
      ...(metrics.length > 0 ? { metrics } : {}),
      ...(table ? { table } : {}),
    });
    if (sections.length >= 30) break;
  }
  if (sections.length === 0) {
    return { ok: false, error: `"sections" needs at least one section with a title and a summary.` };
  }
  return {
    ok: true,
    input: deepStripImages({ title, ...(clientName ? { clientName } : {}), period, sections }) as Record<string, unknown>,
    ack: REPORT_ACK,
  };
}

function prepareTable(raw: Record<string, unknown>): PreparedTool {
  const table = cleanTable(raw);
  if (!table) {
    return {
      ok: false,
      error: `The table needs "columns" (each with a "key" and "label") and "rows" (objects keyed by those column keys).`,
    };
  }
  return { ok: true, input: deepStripImages(table) as Record<string, unknown>, ack: TABLE_ACK };
}

/** Validate + normalize one Media Buyer tool call (the model sees `error` and can retry). */
export function prepareMediaTool(name: string, input: unknown): PreparedTool {
  if (!MEDIA_DISPLAY_TOOLS.has(name)) return { ok: false, error: `Unknown tool "${name}".` };
  if (!isPlainObject(input)) return { ok: false, error: "The tool input must be an object." };
  switch (name) {
    case "generate_document":
    case "correct_document":
      return prepareDocument(name, input);
    case "generate_report":
      return prepareReport(input);
    default:
      return prepareTable(input);
  }
}
