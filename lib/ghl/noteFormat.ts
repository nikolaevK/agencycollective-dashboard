// GHL note bodies are an awkward hybrid: an outer HTML wrapper (typically
// `<p style="…">…</p>`) around what's largely Markdown — headings, bullets,
// **bold** — with HTML entities (`&amp;`, `&quot;`, `&#x27;`, `&gt;`, `&#x60;`)
// peppered through. We strip the HTML shell and decode entities so
// react-markdown can render the inner content cleanly.
//
// Plain-text notes pass through nearly unchanged (no tags to strip, no
// entities to decode beyond the rare stray one).

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (full, code: string) => {
    if (code[0] === "#") {
      const hex = code[1] === "x" || code[1] === "X";
      const cp = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : full;
    }
    return NAMED_ENTITIES[code] ?? full;
  });
}

export function cleanGhlNoteBody(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw;
  // <br> variants → newline before tag-strip so list/paragraph breaks survive.
  s = s.replace(/<br\s*\/?\s*>/gi, "\n");
  // Strip all remaining HTML tags. Inner text/markdown is preserved.
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  s = decodeEntities(s);
  // Tidy excess blank lines.
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
