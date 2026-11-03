import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { cleanLabel, cleanText, deepStripImages, isPlainObject, type PreparedTool } from "@/lib/docChat/toolInput";

/**
 * Tools for the SOP assistant. Presentational: the model writes the SOP block
 * document straight into the `generate_sop` input, the route validates it
 * (prepareSopTool) and the chat renders it as a saveable SOP card. Saving
 * runs `normalizeSopDoc` (lib/sop.ts) before anything touches the DB — the
 * limits below mirror its caps so nothing is silently cut on save.
 */

/** Icon keys the SOP renderer knows (components/welcome-kit/icons ICON_MAP; unknown keys show a star). */
export const SOP_ICON_KEYS = [
  "target", "users", "settings", "checkSquare", "checkCircle", "check", "x", "shield", "lock", "lightbulb",
  "trending", "clock", "calendar", "handshake", "rocket", "messages", "message", "mail", "phone", "package",
  "download", "image", "file", "palette", "globe", "scale", "star", "info", "zap", "heart", "award", "book",
  "briefcase", "creditCard", "bell", "thumbsUp", "sparkles", "flag", "gift",
] as const;

const ICON = { type: "string", description: `Icon key: one of ${SOP_ICON_KEYS.join(", ")}.` } as const;
/** lib/sop.ts LIMITS: short text 240, bodies 8,000, ≤ 80 items per list, ≤ 80 blocks per section, ≤ 60 sections. */
const SHORT = 240;
const BODY = 8_000;
const ITEMS = 80;

const BLOCK_SCHEMA = {
  anyOf: [
    {
      type: "object",
      description: "A paragraph of GitHub-flavored markdown (no images).",
      properties: {
        type: { type: "string", enum: ["text"] },
        body: { type: "string", maxLength: BODY, description: "Markdown body (bold, italics, lists, links)." },
      },
      required: ["type", "body"],
    },
    {
      type: "object",
      description: "A highlighted note box (tip, warning, etc.).",
      properties: {
        type: { type: "string", enum: ["callout"] },
        variant: { type: "string", enum: ["info", "success", "warning", "danger", "neutral"] },
        icon: ICON,
        title: { type: "string", maxLength: SHORT },
        body: { type: "string", maxLength: BODY, description: "Markdown body." },
      },
      required: ["type", "body"],
    },
    {
      type: "object",
      description: "A big-number highlight card.",
      properties: {
        type: { type: "string", enum: ["stat"] },
        value: { type: "string", maxLength: 40, description: "The big value, e.g. '24h', '3'." },
        label: { type: "string", maxLength: SHORT },
        caption: { type: "string", maxLength: 400 },
      },
      required: ["type", "value", "label"],
    },
    {
      type: "object",
      description: "A checklist with check or dot markers.",
      properties: {
        type: { type: "string", enum: ["checklist"] },
        title: { type: "string", maxLength: SHORT },
        marker: { type: "string", enum: ["check", "dot"] },
        items: { type: "array", maxItems: ITEMS, items: { type: "string", maxLength: 400 } },
        note: { type: "string", maxLength: 600, description: "Optional footnote." },
      },
      required: ["type", "items"],
    },
    {
      type: "object",
      description: "A numbered (or bulleted) step-by-step procedure — the core SOP primitive.",
      properties: {
        type: { type: "string", enum: ["steps"] },
        title: { type: "string", maxLength: SHORT },
        ordered: { type: "boolean", description: "true = numbered (default), false = bulleted." },
        steps: {
          type: "array",
          maxItems: ITEMS,
          items: {
            type: "object",
            properties: {
              text: { type: "string", maxLength: BODY, description: "The step instruction." },
              detail: { type: "string", maxLength: BODY, description: "Optional supporting detail / sub-note." },
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
          maxItems: ITEMS,
          items: {
            type: "object",
            properties: {
              icon: ICON,
              label: { type: "string", maxLength: SHORT },
              desc: { type: "string", maxLength: 400 },
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
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              icon: ICON,
              title: { type: "string", maxLength: SHORT },
              badge: { type: "string", maxLength: SHORT },
              body: { type: "string", maxLength: 800 },
              bullets: { type: "array", maxItems: 20, items: { type: "string", maxLength: 300 } },
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
        title: { type: "string", maxLength: SHORT },
        rows: {
          type: "array",
          maxItems: ITEMS,
          items: {
            type: "object",
            properties: {
              label: { type: "string", maxLength: SHORT },
              value: { type: "string", maxLength: SHORT },
            },
            required: ["label"],
          },
        },
      },
      required: ["type", "rows"],
    },
  ],
};

export const SOP_BLOCK_TYPES: readonly string[] = ["text", "callout", "stat", "checklist", "steps", "cards", "columns", "rows"];

export const SOP_CHAT_TOOLS: BetaTool[] = [
  {
    name: "generate_sop",
    description:
      "Show a finished Standard Operating Procedure to the user as an SOP card they can open in the builder (to edit, export and save) or save to the library. Use it whenever the user asks you to draft, write, create or convert an SOP. Build it from ordered sections (e.g. Purpose & Scope, Roles & Responsibilities, Step-by-step Process, Tools & Access, KPIs, Escalation). Prefer the `steps` block for any procedure. Keep prose tight and operational. The card shows the SOP, so don't repeat it in your chat text.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", maxLength: SHORT, description: "Short SOP title, e.g. 'Inbound Lead Intake SOP'." },
        summary: { type: "string", maxLength: 1_200, description: "One- or two-sentence overview shown under the title." },
        sections: {
          type: "array",
          minItems: 1,
          maxItems: 60,
          description: "Ordered SOP sections.",
          items: {
            type: "object",
            properties: {
              num: { type: "string", maxLength: 60, description: "Eyebrow label, e.g. '01 / Purpose'." },
              icon: ICON,
              title: { type: "string", maxLength: SHORT, description: "Section heading." },
              blocks: {
                type: "array",
                maxItems: ITEMS,
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

/** All SOP tools are presentational — the route validates and acknowledges them. */
export const SOP_DISPLAY_TOOLS = new Set(SOP_CHAT_TOOLS.map((t) => t.name));

const SOP_ACK =
  "Shown to the user as an SOP card with Open in builder and Save to library buttons. Don't repeat the SOP in your reply — at most a line or two on what it covers or which placeholders to fill in.";

/**
 * Validate one `generate_sop` call: a title and at least one section with a
 * known block. Unknown block types are dropped (saving drops them too, so the
 * card's counts match what gets saved); markdown images become alt text.
 * Length caps are left to normalizeSopDoc on save.
 */
export function prepareSopTool(name: string, input: unknown): PreparedTool {
  if (!SOP_DISPLAY_TOOLS.has(name)) return { ok: false, error: `Unknown tool "${name}".` };
  if (!isPlainObject(input)) return { ok: false, error: "The tool input must be an object." };
  const title = cleanLabel(input.title, SHORT);
  if (!title) return { ok: false, error: `"title" is required.` };

  const sections: Record<string, unknown>[] = [];
  let blockCount = 0;
  for (const s of Array.isArray(input.sections) ? input.sections : []) {
    if (!isPlainObject(s)) continue;
    const blocks = (Array.isArray(s.blocks) ? s.blocks : []).filter(
      (b): b is Record<string, unknown> => isPlainObject(b) && typeof b.type === "string" && SOP_BLOCK_TYPES.includes(b.type)
    );
    const sectionTitle = cleanLabel(s.title, SHORT);
    if (!sectionTitle && blocks.length === 0) continue;
    blockCount += blocks.length;
    sections.push({ ...s, title: sectionTitle, blocks });
  }
  if (sections.length === 0 || blockCount === 0) {
    return {
      ok: false,
      error: `"sections" needs at least one section with content blocks (types: ${SOP_BLOCK_TYPES.join(", ")}).`,
    };
  }
  const summary = cleanText(input.summary, 1_200);
  return {
    ok: true,
    input: deepStripImages({ title, ...(summary ? { summary } : {}), sections }) as Record<string, unknown>,
    ack: SOP_ACK,
  };
}
