import type Anthropic from "@anthropic-ai/sdk";

/**
 * Tools for the SOP assistant. Presentational: the server auto-acknowledges
 * them and the client renders the result (a saveable SOP card). The model
 * writes the SOP block document directly into the `generate_sop` tool input,
 * which is normalized by `normalizeSopDoc` before it ever touches the DB.
 */

const BLOCK_SCHEMA = {
  anyOf: [
    {
      type: "object",
      description: "A paragraph of GitHub-flavored markdown.",
      properties: {
        type: { type: "string", enum: ["text"] },
        body: { type: "string", description: "Markdown body (bold, italics, lists, links)." },
      },
      required: ["type", "body"],
    },
    {
      type: "object",
      description: "A highlighted note box (tip, warning, etc.).",
      properties: {
        type: { type: "string", enum: ["callout"] },
        variant: { type: "string", enum: ["info", "success", "warning", "danger", "neutral"] },
        icon: { type: "string", description: "Icon key, e.g. info, shield, lightbulb, zap." },
        title: { type: "string" },
        body: { type: "string", description: "Markdown body." },
      },
      required: ["type", "body"],
    },
    {
      type: "object",
      description: "A big-number highlight card.",
      properties: {
        type: { type: "string", enum: ["stat"] },
        value: { type: "string", description: "The big value, e.g. '24h', '3'." },
        label: { type: "string" },
        caption: { type: "string" },
      },
      required: ["type", "value", "label"],
    },
    {
      type: "object",
      description: "A checklist with check or dot markers.",
      properties: {
        type: { type: "string", enum: ["checklist"] },
        title: { type: "string" },
        marker: { type: "string", enum: ["check", "dot"] },
        items: { type: "array", items: { type: "string" } },
        note: { type: "string", description: "Optional footnote." },
      },
      required: ["type", "items"],
    },
    {
      type: "object",
      description: "A numbered (or bulleted) step-by-step procedure — the core SOP primitive.",
      properties: {
        type: { type: "string", enum: ["steps"] },
        title: { type: "string" },
        ordered: { type: "boolean", description: "true = numbered (default), false = bulleted." },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "The step instruction." },
              detail: { type: "string", description: "Optional supporting detail / sub-note." },
            },
            required: ["text"],
          },
        },
      },
      required: ["type", "steps"],
    },
    {
      type: "object",
      description: "Icon cards — grid or list.",
      properties: {
        type: { type: "string", enum: ["cards"] },
        layout: { type: "string", enum: ["grid", "list"] },
        columns: { type: "integer", enum: [1, 2, 3, 4] },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              icon: { type: "string" },
              label: { type: "string" },
              desc: { type: "string" },
            },
            required: ["label"],
          },
        },
      },
      required: ["type", "items"],
    },
    {
      type: "object",
      description: "Up to 3 side-by-side info columns, each with bullets.",
      properties: {
        type: { type: "string", enum: ["columns"] },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              icon: { type: "string" },
              title: { type: "string" },
              badge: { type: "string" },
              body: { type: "string" },
              bullets: { type: "array", items: { type: "string" } },
            },
            required: ["title"],
          },
        },
      },
      required: ["type", "items"],
    },
    {
      type: "object",
      description: "Label + right-aligned tag rows (e.g. tool → owner).",
      properties: {
        type: { type: "string", enum: ["rows"] },
        title: { type: "string" },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
            },
            required: ["label"],
          },
        },
      },
      required: ["type", "rows"],
    },
  ],
};

export const SOP_CHAT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "generate_sop",
    description:
      "Produce a finished Standard Operating Procedure as a structured block document for the user to review, edit, and save. Use this whenever the user asks you to draft, write, create, or convert an SOP. Build it from ordered sections (e.g. Purpose & Scope, Roles & Responsibilities, Step-by-step Process, Tools & Access, KPIs, Escalation). Prefer the `steps` block for any procedure. Keep prose tight and operational.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short SOP title, e.g. 'Inbound Lead Intake SOP'." },
        summary: { type: "string", description: "One- or two-sentence overview shown under the title." },
        sections: {
          type: "array",
          minItems: 1,
          description: "Ordered SOP sections.",
          items: {
            type: "object",
            properties: {
              num: { type: "string", description: "Eyebrow label, e.g. '01 / Purpose'." },
              icon: { type: "string", description: "Icon key, e.g. target, users, checkSquare, shield, settings, lightbulb." },
              title: { type: "string", description: "Section heading." },
              blocks: {
                type: "array",
                description: "Ordered content blocks for this section.",
                items: BLOCK_SCHEMA,
              },
            },
            required: ["title", "blocks"],
          },
        },
      },
      required: ["title", "sections"],
    },
  },
];

/** All SOP tools are presentational — the server auto-acks them. */
export const SOP_DISPLAY_TOOLS = new Set(["generate_sop"]);
