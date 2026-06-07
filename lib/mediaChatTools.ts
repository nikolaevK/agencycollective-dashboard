import type Anthropic from "@anthropic-ai/sdk";
import { MEDIA_DOC_TYPES } from "@/lib/mediaDocuments";

/**
 * Tools for the Media Buyer assistant. All are presentational: the server
 * auto-acknowledges them and the client renders the result (a saveable
 * document card or a table). There is no server-side execution — the model
 * writes the document content directly into the tool input.
 */
export const MEDIA_CHAT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "generate_document",
    description:
      "Produce a finished media-buying document (SOP, creative brief, campaign brief, account audit, media plan, report, or post-mortem) for the user to review and save. Put the FULL document body in `markdown` as well-structured GitHub-flavored markdown (headings, bullet lists, tables). Use this whenever the user asks you to draft, write, or create a document.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Short document title used as the file name, e.g. 'Meta Creative Testing SOP'",
        },
        docType: {
          type: "string",
          enum: MEDIA_DOC_TYPES as unknown as string[],
          description: "Document category. Use 'other' if none fit.",
        },
        platform: {
          type: "string",
          enum: ["meta", "tiktok", "google", "cross"],
          description: "Optional ad platform the document relates to.",
        },
        markdown: {
          type: "string",
          description: "The complete document content as GitHub-flavored markdown.",
        },
      },
      required: ["title", "docType", "markdown"],
    },
  },
  {
    name: "correct_document",
    description:
      "Return a corrected/improved version of a document the user provided as text. Put the full corrected document in `markdown` and a short bullet list of what you changed in `summary`. Use this when the user pastes a document and asks you to fix, edit, proofread, or improve it.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: {
          type: "string",
          description: "Title / file name for the corrected document.",
        },
        docType: {
          type: "string",
          enum: MEDIA_DOC_TYPES as unknown as string[],
          description: "Document category. Use 'other' if none fit.",
        },
        summary: {
          type: "string",
          description: "Short markdown bullet list summarizing the changes made.",
        },
        markdown: {
          type: "string",
          description: "The complete corrected document as GitHub-flavored markdown.",
        },
      },
      required: ["title", "markdown"],
    },
  },
  {
    name: "generate_report",
    description:
      "Produce a polished, branded multi-section REPORT — rendered as an advanced PDF with KPI cards and data tables (download, or save to the directory). Use this (instead of generate_document) when the user asks for a 'report', 'client summary', 'performance review', 'audit report', or any formal client-facing deliverable that benefits from KPI cards and tables. You have NO live ad-account data, so populate metrics/tables from numbers the user provides, or use clearly-labeled placeholders like '[insert]'. Lead with an Executive Summary section and end with a Recommendations section (each recommendation owned, with a due date).",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Report title, e.g. 'Q2 Performance Review — ACME'" },
        clientName: { type: "string", description: "Client / brand name" },
        period: { type: "string", description: "Reporting period, e.g. 'Last 30 days', 'June 2026'" },
        sections: {
          type: "array",
          minItems: 1,
          description: "Report sections in order. Lead with an executive summary; end with recommendations.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Section heading" },
              summary: { type: "string", description: "Narrative prose for this section (plain text, no markdown)." },
              metrics: {
                type: "array",
                description: "Optional KPI cards for this section (2–6).",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "e.g. 'ROAS', 'CPA', 'Hook Rate'" },
                    value: { type: "string", description: "Formatted value, e.g. '4.2x', '$31', '34%'" },
                    subtitle: { type: "string", description: "Optional context, e.g. 'vs $38 last period'" },
                    trend: { type: "string", enum: ["up", "down", "neutral"], description: "Trend indicator" },
                    color: { type: "string", description: "Optional accent: green, red, blue, purple, amber" },
                  },
                  required: ["label", "value"],
                },
              },
              table: {
                type: "object",
                description: "Optional data table for this section.",
                properties: {
                  title: { type: "string" },
                  columns: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        key: { type: "string" },
                        label: { type: "string" },
                        format: { type: "string", enum: ["currency", "percent", "number", "text"] },
                      },
                      required: ["key", "label"],
                    },
                  },
                  rows: { type: "array", items: { type: "object" } },
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
      "Display a formatted data table inline in the chat. Use for benchmark comparisons, KPI breakdowns, or any tabular data with several rows.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Table title" },
        columns: {
          type: "array",
          description: "Column definitions",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Data key in row objects" },
              label: { type: "string", description: "Display header label" },
              format: {
                type: "string",
                enum: ["currency", "percent", "number", "text"],
                description: "Value formatting hint",
              },
            },
            required: ["key", "label"],
          },
        },
        rows: {
          type: "array",
          description: "Array of row data objects",
          items: { type: "object" },
        },
      },
      required: ["title", "columns", "rows"],
    },
  },
];

/** All Media Buyer tools are presentational — the server auto-acks them. */
export const MEDIA_DISPLAY_TOOLS = new Set([
  "generate_document",
  "correct_document",
  "generate_report",
  "display_table",
]);
