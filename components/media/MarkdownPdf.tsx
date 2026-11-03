"use client";

import * as React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { isTableSeparator, parseInline, parseListLine, pdfSafe, splitTableCells, type ListLine, type Run } from "@/lib/mediaChat/pdfText";

// Branded markdown → PDF renderer for documents the AI assistant produces.
// Handles the structured markdown it generates: headings, paragraphs, bold /
// italic / inline code, links (text + URL), nested bullet / numbered / task
// lists, GFM tables (with or without outer pipes), blockquotes, fenced code
// and horizontal rules. Small blocks stay on one page; ones that could be
// taller than a page may break (KEEP_TOGETHER_CHARS). Inline parsing + the
// font-safe character mapping live in lib/mediaChat/pdfText (tested). Colors
// match the report PDF (components/chat/tool-renderers/reportPdfGenerator) so
// both kinds of saved document look like one brand.

const ACCENT = "#7c3aed";
const TEXT = "#203044";
const MUTED = "#68788f";
const SURFACE = "#f4f6ff";
const BORDER = "#e2e8f0";

const st = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 50, paddingHorizontal: 44, fontFamily: "Helvetica", fontSize: 10, color: TEXT, lineHeight: 1.45 },
  topbar: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  brand: { fontSize: 8, fontFamily: "Helvetica-Bold", color: TEXT, letterSpacing: 1 },
  topMeta: { fontSize: 8, color: MUTED },
  docTitle: { fontSize: 19, fontFamily: "Helvetica-Bold", color: ACCENT, marginTop: 8 },
  rule: { height: 2, backgroundColor: ACCENT, marginTop: 10, marginBottom: 12 },

  h1: { fontSize: 15, fontFamily: "Helvetica-Bold", color: TEXT, marginTop: 10, marginBottom: 4 },
  h2: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: ACCENT, marginTop: 10, marginBottom: 3 },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", color: TEXT, marginTop: 8, marginBottom: 2 },
  h4: { fontSize: 10, fontFamily: "Helvetica-Bold", color: MUTED, marginTop: 6, marginBottom: 2 },
  p: { fontSize: 10, color: TEXT, marginBottom: 5 },

  list: { marginBottom: 6, marginTop: 1 },
  li: { flexDirection: "row", marginBottom: 2.5, paddingRight: 6 },
  bullet: { width: 12, fontSize: 10, color: ACCENT },
  num: { width: 18, fontSize: 10, color: ACCENT, fontFamily: "Helvetica-Bold" },
  checkbox: { width: 22, fontSize: 9, fontFamily: "Courier", color: "#059669" },
  liText: { flex: 1, fontSize: 10, color: TEXT },

  quote: { borderLeftWidth: 3, borderLeftColor: ACCENT, backgroundColor: SURFACE, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 6, borderRadius: 2 },
  quoteText: { fontSize: 9.5, color: TEXT },

  codeblock: { backgroundColor: "#f3f4f6", borderRadius: 3, padding: 7, marginBottom: 6 },
  codeText: { fontFamily: "Courier", fontSize: 8.5, color: "#1f2937", lineHeight: 1.35 },

  hr: { height: 1, backgroundColor: BORDER, marginVertical: 8 },

  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, marginBottom: 8 },
  tHead: { flexDirection: "row", backgroundColor: SURFACE },
  tRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER },
  tCell: { paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: "#f0f0f0" },
  tHeadText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: ACCENT },
  tCellText: { fontSize: 8.5, color: TEXT },

  b: { fontFamily: "Helvetica-Bold" },
  i: { fontFamily: "Helvetica-Oblique" },
  bi: { fontFamily: "Helvetica-BoldOblique" },
  code: { fontFamily: "Courier", color: ACCENT, fontSize: 9 },

  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6 },
  footerText: { fontSize: 7.5, color: MUTED },
});

type RStyle = (typeof st)[keyof typeof st];

/**
 * Text up to this length (full page width — a handful of lines) is kept on one
 * page; longer list items, blockquotes and table rows may break across pages,
 * since an unbreakable (`wrap={false}`) element taller than a page is clipped.
 */
const KEEP_TOGETHER_CHARS = 600;

/** A table row stays unbroken while its longest cell, scaled by the column count, is short. */
function rowFitsTogether(cells: string[], cols: number): boolean {
  return Math.max(0, ...cells.map((c) => c.length)) * cols <= KEEP_TOGETHER_CHARS;
}

function runStyle(r: Run): RStyle | undefined {
  if (r.code) return st.code;
  if (r.bold && r.italic) return st.bi;
  if (r.bold) return st.b;
  if (r.italic) return st.i;
  return undefined;
}

function Inline({ text, base }: { text: string; base?: RStyle }) {
  return (
    <Text style={base}>
      {parseInline(text).map((r, i) => (
        <Text key={i} style={runStyle(r)}>
          {r.text}
        </Text>
      ))}
    </Text>
  );
}

function Table({ rows }: { rows: string[] }) {
  const parsed = rows.map(splitTableCells);
  let header: string[] | null = null;
  let body = parsed;
  if (rows.length >= 2 && isTableSeparator(rows[1])) {
    header = parsed[0];
    body = parsed.slice(2);
  }
  const cols = Math.max(header?.length ?? 0, ...body.map((r) => r.length), 1);
  const w = `${100 / cols}%`;
  return (
    <View style={st.table}>
      {header && (
        <View style={st.tHead} wrap={!rowFitsTogether(header, cols)}>
          {Array.from({ length: cols }).map((_, c) => (
            <View key={c} style={[st.tCell, { width: w }]}>
              <Inline text={header![c] ?? ""} base={st.tHeadText} />
            </View>
          ))}
        </View>
      )}
      {body.map((row, ri) => (
        <View key={ri} style={st.tRow} wrap={!rowFitsTogether(row, cols)}>
          {Array.from({ length: cols }).map((_, c) => (
            <View key={c} style={[st.tCell, { width: w }]}>
              <Inline text={row[c] ?? ""} base={st.tCellText} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function ListItem({ item }: { item: ListLine }) {
  const marker =
    item.task !== null ? (
      <Text style={st.checkbox}>{item.task === "x" ? "[x]" : "[ ]"}</Text>
    ) : item.ordered ? (
      <Text style={st.num}>{item.n}.</Text>
    ) : (
      <Text style={st.bullet}>•</Text>
    );
  return (
    <View style={[st.li, { marginLeft: item.depth * 14 }]} wrap={item.text.length > KEEP_TOGETHER_CHARS}>
      {marker}
      <Inline text={item.text} base={st.liText} />
    </View>
  );
}

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const PIPE_ROW_RE = /^\s*\|.*\|\s*$/;
/** Lines that end a paragraph. */
const SPLIT_RE = /^(#{1,6}\s|>\s?|\s*```|\s*~~~|\s*[-*+]\s+|\s*\d{1,9}[.)]\s+|\s*\|)/;

function renderBlocks(md: string): React.ReactNode[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const k = () => key++;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code (a long block may break across pages)
    if (FENCE_RE.test(line)) {
      const fence = FENCE_RE.exec(line)![1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        <View key={k()} style={st.codeblock} wrap={buf.length > 25}>
          <Text style={st.codeText}>{pdfSafe(buf.join("\n"))}</Text>
        </View>
      );
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      out.push(<View key={k()} style={st.hr} />);
      i++;
      continue;
    }

    // Blank
    if (line.trim() === "") {
      out.push(<View key={k()} style={{ height: 4 }} />);
      i++;
      continue;
    }

    // Heading
    const h = HEADING_RE.exec(line);
    if (h) {
      const lvl = h[1].length;
      const style = lvl === 1 ? st.h1 : lvl === 2 ? st.h2 : lvl === 3 ? st.h3 : st.h4;
      out.push(
        <View key={k()} wrap={false}>
          <Inline text={h[2]} base={style} />
        </View>
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*(>\s?)+/, ""));
        i++;
      }
      const quote = buf.join(" ");
      out.push(
        <View key={k()} style={st.quote} wrap={quote.length > KEEP_TOGETHER_CHARS}>
          <Inline text={quote} base={st.quoteText} />
        </View>
      );
      continue;
    }

    // Table: pipe rows, or a header line followed by a separator row (outer pipes optional)
    const nextIsSeparator = i + 1 < lines.length && line.includes("|") && isTableSeparator(lines[i + 1]);
    if (PIPE_ROW_RE.test(line) || nextIsSeparator) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        rows.push(lines[i]);
        i++;
      }
      out.push(<Table key={k()} rows={rows} />);
      continue;
    }

    // Lists (bullet / numbered / task, nested by indentation; indented lines continue an item)
    if (parseListLine(line)) {
      const items: ListLine[] = [];
      while (i < lines.length) {
        const item = parseListLine(lines[i]);
        if (item) {
          items.push(item);
        } else if (items.length > 0 && /^\s{2,}\S/.test(lines[i]) && !SPLIT_RE.test(lines[i].trimStart())) {
          items[items.length - 1] = { ...items[items.length - 1], text: `${items[items.length - 1].text} ${lines[i].trim()}` };
        } else {
          break;
        }
        i++;
      }
      out.push(
        <View key={k()} style={st.list}>
          {items.map((it, idx) => (
            <ListItem key={idx} item={it} />
          ))}
        </View>
      );
      continue;
    }

    // Paragraph
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && (buf.length === 0 || !SPLIT_RE.test(lines[i])) && !HR_RE.test(lines[i])) {
      buf.push(lines[i].trim());
      i++;
    }
    out.push(
      <View key={k()}>
        <Inline text={buf.join(" ")} base={st.p} />
      </View>
    );
  }
  return out;
}

/** Drop a leading "# Title" from the body when it just repeats the doc title
 *  (the branded header already shows it). */
function stripRedundantTitle(md: string, title: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const m = i < lines.length ? /^#\s+(.*?)\s*#*\s*$/.exec(lines[i]) : null;
  if (m && m[1].trim().toLowerCase() === title.trim().toLowerCase()) {
    return lines.slice(i + 1).join("\n").replace(/^\n+/, "");
  }
  return md;
}

export function MarkdownPdf({
  title,
  markdown,
  generatedOn,
}: {
  title: string;
  markdown: string;
  generatedOn: string;
}) {
  const body = stripRedundantTitle(markdown, title);
  return (
    <Document title={title} author="Agency Collective">
      <Page size="A4" style={st.page} wrap>
        <View style={st.topbar} fixed>
          <Text style={st.brand}>AGENCY COLLECTIVE</Text>
          <Text style={st.topMeta}>Media Buyers</Text>
        </View>
        <Text style={st.docTitle}>{pdfSafe(title)}</Text>
        <View style={st.rule} />

        {renderBlocks(body)}

        <View style={st.footer} fixed>
          <Text style={st.footerText}>Agency Collective · Generated {generatedOn}</Text>
          <Text style={st.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
