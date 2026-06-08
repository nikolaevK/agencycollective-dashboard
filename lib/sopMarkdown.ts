import { normalizeSopDoc, type SopDoc } from "./sop";

// ---------------------------------------------------------------------------
// Deterministic Markdown → SOP block-model converter. No AI — instant and
// reliable for .md / .txt (and tag-stripped HTML) imports, e.g. Notion exports.
//   - H1/H2 headings  → section boundaries (first H1 → document title)
//   - ordered lists   → a `steps` block (the core SOP primitive)
//   - task lists      → a `checklist` block
//   - blockquotes     → an info `callout`
//   - everything else → `text` blocks (markdown: bold/italic/links/###/bullets)
// The result is run through normalizeSopDoc so it's clamped + id'd like any SOP.
// ---------------------------------------------------------------------------

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const ORDERED = /^\s*\d+[.)]\s+/;
const TASK = /^\s*[-*+]\s+\[[ xX]\]\s+/;
const QUOTE = /^>\s?/;

function linesToBlocks(lines: string[]): unknown[] {
  const blocks: unknown[] = [];
  let text: string[] = [];

  const flushText = () => {
    const body = text.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (body) blocks.push({ id: uid("blk"), type: "text", body });
    text = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Notion callouts export as <aside>…</aside> → convert to a callout block.
    if (/<aside\b[^>]*>/i.test(line)) {
      flushText();
      const buf: string[] = [];
      const rest = line.replace(/^[\s\S]*?<aside\b[^>]*>/i, "");
      if (/<\/aside>/i.test(rest)) {
        buf.push(rest.replace(/<\/aside>[\s\S]*$/i, ""));
      } else {
        if (rest.trim()) buf.push(rest);
        i++;
        while (i < lines.length && !/<\/aside>/i.test(lines[i])) { buf.push(lines[i]); i++; }
        if (i < lines.length) {
          const last = lines[i].replace(/<\/aside>[\s\S]*$/i, "");
          if (last.trim()) buf.push(last);
        }
      }
      // Drop leading blank / icon-only lines (Notion puts the callout emoji first).
      while (buf.length && (buf[0].trim() === "" || /^[\W_]+$/u.test(buf[0].trim()))) buf.shift();
      const body = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (body) blocks.push({ id: uid("blk"), type: "callout", variant: "info", body });
      continue;
    }

    // Drop stray standalone block-HTML wrappers (Notion toggles, divs, orphan </aside>).
    if (/^<\/?(aside|details|summary|div|span|figure|figcaption)\b[^>]*>$/i.test(trimmed)) continue;

    if (ORDERED.test(line) && !TASK.test(line)) {
      flushText();
      const steps: unknown[] = [];
      while (i < lines.length && ORDERED.test(lines[i]) && !TASK.test(lines[i])) {
        steps.push({ id: uid("step"), text: lines[i].replace(ORDERED, "").trim() });
        i++;
      }
      i--;
      blocks.push({ id: uid("blk"), type: "steps", ordered: true, steps });
      continue;
    }

    if (TASK.test(line)) {
      flushText();
      const items: string[] = [];
      while (i < lines.length && TASK.test(lines[i])) {
        items.push(lines[i].replace(TASK, "").trim());
        i++;
      }
      i--;
      blocks.push({ id: uid("blk"), type: "checklist", marker: "check", items });
      continue;
    }

    if (QUOTE.test(line)) {
      flushText();
      const q: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        q.push(lines[i].replace(QUOTE, ""));
        i++;
      }
      i--;
      blocks.push({ id: uid("blk"), type: "callout", variant: "info", body: q.join("\n").trim() });
      continue;
    }

    text.push(line);
  }
  flushText();
  return blocks;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

/** Flatten inline HTML to a single trimmed line. */
function inlineText(t: string): string {
  return decodeEntities(t.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** Strip HTML tags + decode entities to plain text (line-broken on blocks). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

/**
 * Convert HTML into Markdown-ish text that {@link markdownToSopDoc} can turn
 * into real blocks: headings → #, ordered lists → "1.", unordered → "-",
 * blockquotes → ">". Used for .html uploads and DOCX (via mammoth's HTML).
 * Regex-based (good for clean exporter HTML, not a full DOM parser).
 */
export function htmlToMarkdownish(html: string): string {
  let s = html.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");

  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
    let n = 0;
    const items = String(inner).replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t) => { n += 1; return `\n${n}. ${inlineText(t)}`; });
    return `\n${items}\n`;
  });
  s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) => {
    const items = String(inner).replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, t) => `\n- ${inlineText(t)}`);
    return `\n${items}\n`;
  });
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, t) => `\n${"#".repeat(Number(lvl))} ${inlineText(t)}\n`);
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => `\n> ${inlineText(t)}\n`);
  s = s.replace(/<\/p>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  return decodeEntities(s).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function markdownToSopDoc(md: string, fallbackTitle = "Imported SOP"): SopDoc {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");

  let title = "";
  const pre: string[] = [];
  const sections: { heading: string; body: string[] }[] = [];
  let cur: { heading: string; body: string[] } | null = null;

  for (const line of lines) {
    const h = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (h) {
      const level = h[1].length;
      const heading = h[2].trim();
      if (level <= 2) {
        // First top-level heading with no content yet → document title.
        if (!title && sections.length === 0 && !cur && pre.every((l) => l.trim() === "")) {
          title = heading;
          continue;
        }
        cur = { heading, body: [] };
        sections.push(cur);
        continue;
      }
      // H3–H6 fall through and stay as markdown content in the current section.
    }
    (cur ? cur.body : pre).push(line);
  }

  const raw: { num: string; icon: string; title: string; blocks: unknown[] }[] = [];
  const preBody = pre.join("\n").trim();
  if (preBody) raw.push({ num: "", icon: "file", title: "Overview", blocks: linesToBlocks(preBody.split("\n")) });
  for (const s of sections) raw.push({ num: "", icon: "file", title: s.heading, blocks: linesToBlocks(s.body) });
  if (raw.length === 0) raw.push({ num: "", icon: "file", title: "Overview", blocks: linesToBlocks(lines) });

  raw.forEach((s, i) => { s.num = `${String(i + 1).padStart(2, "0")} / ${s.title}`; });

  return normalizeSopDoc({ title: title || fallbackTitle, summary: "", sections: raw });
}
