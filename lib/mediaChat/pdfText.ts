/**
 * Markdown → PDF text helpers for the Media Buyers document PDF
 * (components/media/MarkdownPdf). Pure, so the parsing rules are testable.
 *
 * The PDF uses react-pdf's built-in Helvetica/Courier, which only cover the
 * WinAnsi (Windows-1252) character set: anything else — arrows, ≥, ✓, emoji,
 * most non-Latin-1 letters — prints as garbage or nothing. `pdfSafe` maps the
 * common ones to readable ASCII and folds accents it can't print.
 */

// ─── Character set ───────────────────────────────────────────────────────────

/** Windows-1252 characters outside Latin-1 that the standard fonts print. */
const WIN_ANSI_EXTRA = new Set(Array.from("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ", (c) => c.codePointAt(0)!));

function printable(code: number): boolean {
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || code === 0x0a || WIN_ANSI_EXTRA.has(code);
}

const REPLACEMENTS: Record<string, string> = {
  "→": "->", "⟶": "->", "➔": "->", "➜": "->", "➝": "->", "⇒": "=>", "←": "<-", "⟵": "<-", "⇐": "<=",
  "↔": "<->", "⇔": "<=>", "↑": "^", "↓": "v", "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~", "∼": "~",
  "−": "-", "‐": "-", "‑": "-", "‒": "-", "―": "—", "⁄": "/", "∕": "/", "∞": "inf", "√": "v",
  "✓": "[x]", "✔": "[x]", "☑": "[x]", "✅": "[x]", "☐": "[ ]", "□": "[ ]", "✗": "x", "✘": "x", "❌": "x",
  "✕": "x", "✖": "x", "★": "*", "☆": "*", "⭐": "*", "●": "•", "○": "o", "◦": "o", "▪": "•", "▫": "•",
  "■": "•", "‣": "•", "⁃": "-", "►": ">", "▶": ">", "▸": ">", "◆": "•", "◇": "o", "′": "'", "″": '"',
  "\t": "    ",
};

/** Zero-width / formatting characters and emoji variation selectors print nothing. */
const INVISIBLE = /[​-‍⁠﻿︎️]/g;
/** Exotic spaces → a plain space. */
const SPACES = /[ -   　]/g;

/** Text the PDF's standard fonts can print. */
export function pdfSafe(text: string): string {
  const cleaned = text.replace(INVISIBLE, "").replace(SPACES, " ");
  let out = "";
  for (const ch of cleaned) {
    const code = ch.codePointAt(0)!;
    if (printable(code)) {
      out += ch;
      continue;
    }
    const mapped = REPLACEMENTS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    // Accented letters outside the set (č, ő, ł…) fold to their base letter; the rest is dropped.
    const folded = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    if (folded && Array.from(folded).every((c) => printable(c.codePointAt(0)!))) out += folded;
  }
  return out;
}

// ─── Inline markdown ─────────────────────────────────────────────────────────

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

type Flags = Omit<Run, "text">;

// Escaped punctuation (\* \_ \|) is parked in the private-use area while parsing.
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!|~>])/g;
const PARKED = /[-]/g;
const park = (s: string) => s.replace(ESCAPED, (_, c: string) => String.fromCharCode(0xe000 + c.charCodeAt(0)));
const unpark = (s: string) => s.replace(PARKED, (c) => String.fromCharCode(c.charCodeAt(0) - 0xe000));

const IMAGE_RE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK_RE = /\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const AUTOLINK_RE = /<((?:https?:\/\/|mailto:)[^>\s]+)>/g;
const BR_RE = /<br\s*\/?>/gi;

/**
 * Emphasis tokens. `_italic_` / `*italic*` need a non-word character before
 * them (captured as a prefix — no lookbehind, for older Safari), so
 * snake_case names and 2*3*4 stay literal; `_<Placeholder>_` in naming
 * conventions isn't emphasis either.
 */
const TOKEN_RE =
  /(\*\*\*(?=\S)([^*]+?)\*\*\*)|(\*\*(?=\S)([^*]+?)\*\*)|(__(?=\S)([^_]+?)__)|(`([^`]+)`)|(~~(?=\S)([^~]+?)~~)|((^|[^\w*])\*(?=\S)([^*\n]+?)\*(?![\w*]))|((^|[^A-Za-z0-9_])_(?=[^\s<>])([^_\n]*?[^_\n\s<>])_(?![A-Za-z0-9_]))/g;

function linkText(label: string, url: string): string {
  const visible = /^(https?:|mailto:)/i.test(url) && label.trim() !== url ? `${label} (${url.replace(/^mailto:/i, "")})` : label;
  return visible;
}

function tokenize(src: string, flags: Flags, out: Run[]): void {
  const re = new RegExp(TOKEN_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  const plain = (text: string) => {
    if (text) out.push({ text, ...flags });
  };
  while ((m = re.exec(src))) {
    let start = m.index;
    if (m[11] !== undefined || m[14] !== undefined) {
      // Emit the captured prefix character as plain text.
      const prefix = m[12] ?? m[15] ?? "";
      plain(src.slice(last, start) + prefix);
      start += prefix.length;
    } else {
      plain(src.slice(last, start));
    }
    if (m[2] !== undefined) tokenize(m[2], { ...flags, bold: true, italic: true }, out);
    else if (m[4] !== undefined || m[6] !== undefined) tokenize((m[4] ?? m[6])!, { ...flags, bold: true }, out);
    else if (m[8] !== undefined) out.push({ text: m[8], ...flags, code: true });
    else if (m[10] !== undefined) tokenize(m[10], flags, out);
    else if (m[13] !== undefined || m[16] !== undefined) tokenize((m[13] ?? m[16])!, { ...flags, italic: true }, out);
    last = m.index + m[0].length;
  }
  plain(src.slice(last));
}

/** Inline markdown → styled runs (links keep their URL, images keep their alt text). */
export function parseInline(input: string): Run[] {
  const src = park(input)
    .replace(BR_RE, " ")
    .replace(IMAGE_RE, "$1")
    .replace(LINK_RE, (_, label: string, url: string) => linkText(label, url))
    .replace(AUTOLINK_RE, "$1");
  const runs: Run[] = [];
  tokenize(src, {}, runs);
  const cleaned = runs.map((r) => ({ ...r, text: pdfSafe(unpark(r.text)) })).filter((r) => r.text);
  return cleaned.length > 0 ? cleaned : [{ text: pdfSafe(unpark(src)) }];
}

// ─── Block helpers ───────────────────────────────────────────────────────────

/** A GFM table row's cells (escaped `\|` stays in the cell). */
export function splitTableCells(row: string): string[] {
  return row
    .replace(/\\\|/g, "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim().replace(//g, "\\|"));
}

/** `|---|:---:|` (leading/trailing pipes optional). */
export function isTableSeparator(line: string): boolean {
  const cells = splitTableCells(line);
  return line.includes("-") && cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, "")));
}

export interface ListLine {
  depth: number;
  ordered: boolean;
  /** The number of an ordered item. */
  n: number;
  /** Task-list state, null when it isn't a task item. */
  task: "x" | " " | null;
  text: string;
}

const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

/** A bullet / numbered / task list line (null otherwise). Two spaces (or a tab) per nesting level. */
export function parseListLine(line: string): ListLine | null {
  const m = LIST_RE.exec(line);
  if (!m) return null;
  const indent = m[1].replace(/\t/g, "    ").length;
  const ordered = /\d/.test(m[2]);
  let text = m[3];
  let task: ListLine["task"] = null;
  const t = /^\[([ xX])\]\s+(.*)$/.exec(text);
  if (t) {
    task = t[1].toLowerCase() === "x" ? "x" : " ";
    text = t[2];
  }
  return { depth: Math.min(3, Math.floor(indent / 2)), ordered, n: ordered ? parseInt(m[2], 10) : 0, task, text };
}
