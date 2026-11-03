/**
 * Image removal for the document assistants (pure — server and client).
 *
 * Generated documents are rendered by markdown renderers outside this chat
 * (the SOP library, the v1 API's readers, whatever a copied / exported .md is
 * pasted into) — an image there fetches a model-chosen URL on view, which a
 * prompt-injected pasted document could use to send conversation text to a
 * third party. So images are removed from every tool input (lib/docChat/
 * toolInput) and from copied / exported chat text (stripImagesClient).
 *
 * The markdown is PARSED the way the renderers parse it (remark-parse +
 * remark-gfm, like react-markdown), so every syntax variant is caught —
 * spaced or <bracketed> destinations, titles, nested brackets in the alt,
 * reference images — and only the matched spans change; the rest of the text
 * stays byte-for-byte:
 *
 * - `image` / `imageReference` → its alt text (escaped, so it can't form new
 *   syntax),
 * - `definition` (`[id]: url`) → removed: a reference image needs one, and a
 *   definition in one string can complete a reference image in another once
 *   strings are concatenated (an SOP's blocks in an export),
 * - raw `<img>` / `<image>` tags → removed.
 *
 * Removing a span can join its neighbours into new syntax (`!` + an emptied
 * image + `[a](url)`), so it re-parses until nothing is left; after
 * MAX_PASSES (deliberately nested input) every remaining `![` / `]:` is
 * escaped instead.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Nodes } from "mdast";

const parser = unified().use(remarkParse).use(remarkGfm);

const HTML_IMG_RE = /<(?:img|image)\b[^>]*>/gi;
const MAX_PASSES = 8;

interface Span {
  start: number;
  end: number;
  text: string;
}

/** Alt text as literal markdown: whitespace collapsed, syntax characters escaped. */
function literal(alt: string): string {
  return alt.replace(/\s+/g, " ").trim().replace(/[\\[\]!<]/g, "\\$&");
}

function collect(node: Nodes, out: Span[]): boolean {
  if (node.type === "image" || node.type === "imageReference" || node.type === "definition") {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return false;
    out.push({ start, end, text: node.type === "definition" ? "" : literal(node.alt ?? "") });
    return true;
  }
  if ("children" in node) {
    for (const child of node.children) if (!collect(child, out)) return false;
  }
  return true;
}

/** One pass: the spans to replace, or null when a node has no position (can't splice — defang instead). */
function findSpans(text: string): Span[] | null {
  const spans: Span[] = [];
  return collect(parser.parse(text), spans) ? spans : null;
}

function splice(text: string, spans: Span[]): string {
  let out = "";
  let at = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < at) continue; // nodes never overlap; belt and braces
    out += text.slice(at, span.start) + span.text;
    at = span.end;
  }
  return out + text.slice(at);
}

/** Last resort: escape every `[` that could open an image and every `]:` that could end a definition label. */
function defang(text: string): string {
  return text.replace(/!\[/g, "!\\[").replace(/\]:/g, "]\\:");
}

/** `text` with every markdown image, image reference, link definition and <img> tag removed (alt text kept). */
export function stripMarkdownImages(text: string): string {
  let out = text.replace(HTML_IMG_RE, "");
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    // Every node this removes needs a literal `![` or `]:` — most strings have neither.
    if (!out.includes("![") && !out.includes("]:")) return out;
    const spans = findSpans(out);
    if (!spans) break;
    if (spans.length === 0) return out;
    out = splice(out, spans).replace(HTML_IMG_RE, "");
  }
  return defang(out);
}
