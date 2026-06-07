"use client";

import * as React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";

// Branded markdown → PDF renderer for documents the AI assistant produces.
// Handles the structured markdown it generates: headings, paragraphs, bold /
// italic / inline code, bullet / numbered / task lists, tables, blockquotes,
// fenced code, and horizontal rules.

const ACCENT = "#2563eb";
const LIGHT_BG = "#EBF4FF";

const st = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 50, paddingHorizontal: 44, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a", lineHeight: 1.45 },
  topbar: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  brand: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#333", letterSpacing: 1 },
  topMeta: { fontSize: 8, color: "#999" },
  docTitle: { fontSize: 19, fontFamily: "Helvetica-Bold", color: ACCENT, marginTop: 8 },
  rule: { height: 2, backgroundColor: ACCENT, marginTop: 10, marginBottom: 12 },

  h1: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#111", marginTop: 10, marginBottom: 4 },
  h2: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: ACCENT, marginTop: 10, marginBottom: 3 },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1a1a1a", marginTop: 8, marginBottom: 2 },
  h4: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#444", marginTop: 6, marginBottom: 2 },
  p: { fontSize: 10, color: "#333", marginBottom: 5 },

  list: { marginBottom: 6, marginTop: 1 },
  li: { flexDirection: "row", marginBottom: 2.5, paddingRight: 6 },
  bullet: { width: 12, fontSize: 10, color: ACCENT },
  num: { width: 16, fontSize: 10, color: ACCENT, fontFamily: "Helvetica-Bold" },
  checkbox: { width: 22, fontSize: 9, fontFamily: "Courier", color: "#16a34a" },
  liText: { flex: 1, fontSize: 10, color: "#333" },

  quote: { borderLeftWidth: 3, borderLeftColor: ACCENT, backgroundColor: LIGHT_BG, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 6, borderRadius: 2 },
  quoteText: { fontSize: 9.5, color: "#334155" },

  codeblock: { backgroundColor: "#f3f4f6", borderRadius: 3, padding: 7, marginBottom: 6 },
  codeText: { fontFamily: "Courier", fontSize: 8.5, color: "#1f2937", lineHeight: 1.35 },

  hr: { height: 1, backgroundColor: "#e5e7eb", marginVertical: 8 },

  table: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 4, marginBottom: 8 },
  tHead: { flexDirection: "row", backgroundColor: LIGHT_BG },
  tRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#eee" },
  tCell: { paddingVertical: 4, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: "#f0f0f0" },
  tHeadText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: ACCENT },
  tCellText: { fontSize: 8.5, color: "#333" },

  b: { fontFamily: "Helvetica-Bold", color: "#111" },
  i: { fontFamily: "Helvetica-Oblique" },
  code: { fontFamily: "Courier", color: ACCENT, fontSize: 9 },

  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 6 },
  footerText: { fontSize: 7.5, color: "#aaa" },
});

type RStyle = (typeof st)[keyof typeof st];

type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

function parseInline(input: string): Run[] {
  // Drop markdown links, keeping the visible text.
  const src = input.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  const runs: Run[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) runs.push({ text: src.slice(last, m.index) });
    if (m[2] !== undefined || m[3] !== undefined) runs.push({ text: (m[2] ?? m[3])!, bold: true });
    else if (m[4] !== undefined || m[5] !== undefined) runs.push({ text: (m[4] ?? m[5])!, italic: true });
    else if (m[6] !== undefined) runs.push({ text: m[6], code: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) runs.push({ text: src.slice(last) });
  return runs.length ? runs : [{ text: src }];
}

function Inline({ runs, base }: { runs: Run[]; base?: RStyle }) {
  return (
    <Text style={base}>
      {runs.map((r, i) => (
        <Text key={i} style={[r.bold && st.b, r.italic && st.i, r.code && st.code].filter(Boolean) as RStyle[]}>
          {r.text}
        </Text>
      ))}
    </Text>
  );
}

const SPLIT_RE = /^(#{1,6}\s|>\s?|```|\s*[-*+]\s+|\s*\d+\.\s+|\s*\|)/;

function splitCells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function Table({ rows }: { rows: string[] }) {
  const parsed = rows.map(splitCells);
  let header: string[] | null = null;
  let body = parsed;
  if (parsed.length >= 2 && parsed[1].every((c) => /^:?-{1,}:?$/.test(c.replace(/\s/g, "")) && c.length > 0)) {
    header = parsed[0];
    body = parsed.slice(2);
  }
  const cols = Math.max(header?.length ?? 0, ...body.map((r) => r.length), 1);
  const w = `${100 / cols}%`;
  return (
    <View style={st.table}>
      {header && (
        <View style={st.tHead} wrap={false}>
          {Array.from({ length: cols }).map((_, c) => (
            <View key={c} style={[st.tCell, { width: w }]}>
              <Inline runs={parseInline(header![c] ?? "")} base={st.tHeadText} />
            </View>
          ))}
        </View>
      )}
      {body.map((row, ri) => (
        <View key={ri} style={st.tRow} wrap={false}>
          {Array.from({ length: cols }).map((_, c) => (
            <View key={c} style={[st.tCell, { width: w }]}>
              <Inline runs={parseInline(row[c] ?? "")} base={st.tCellText} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function renderBlocks(md: string): React.ReactNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  const k = () => key++;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    if (/^```/.test(line.trim())) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
      i++;
      out.push(<View key={k()} style={st.codeblock} wrap={false}><Text style={st.codeText}>{buf.join("\n")}</Text></View>);
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push(<View key={k()} style={st.hr} />); i++; continue; }

    // Blank
    if (line.trim() === "") { out.push(<View key={k()} style={{ height: 4 }} />); i++; continue; }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      const style = lvl === 1 ? st.h1 : lvl === 2 ? st.h2 : lvl === 3 ? st.h3 : st.h4;
      out.push(<View key={k()} wrap={false}><Inline runs={parseInline(h[2])} base={style} /></View>);
      i++; continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(<View key={k()} style={st.quote} wrap={false}><Inline runs={parseInline(buf.join(" "))} base={st.quoteText} /></View>);
      continue;
    }

    // Table
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
      out.push(<Table key={k()} rows={rows} />);
      continue;
    }

    // Unordered / task list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: { text: string; task: "x" | " " | null }[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        let content = lines[i].replace(/^\s*[-*+]\s+/, "");
        let task: "x" | " " | null = null;
        const tm = /^\[([ xX])\]\s+(.*)$/.exec(content);
        if (tm) { task = tm[1].toLowerCase() === "x" ? "x" : " "; content = tm[2]; }
        items.push({ text: content, task });
        i++;
      }
      out.push(
        <View key={k()} style={st.list}>
          {items.map((it, idx) => (
            <View key={idx} style={st.li} wrap={false}>
              {it.task !== null ? <Text style={st.checkbox}>{it.task === "x" ? "[x]" : "[ ]"}</Text> : <Text style={st.bullet}>•</Text>}
              <Inline runs={parseInline(it.text)} base={st.liText} />
            </View>
          ))}
        </View>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: { n: number; text: string }[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const mm = /^\s*(\d+)\.\s+(.*)$/.exec(lines[i])!;
        items.push({ n: Number(mm[1]), text: mm[2] });
        i++;
      }
      out.push(
        <View key={k()} style={st.list}>
          {items.map((it, idx) => (
            <View key={idx} style={st.li} wrap={false}>
              <Text style={st.num}>{it.n}.</Text>
              <Inline runs={parseInline(it.text)} base={st.liText} />
            </View>
          ))}
        </View>
      );
      continue;
    }

    // Paragraph
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !SPLIT_RE.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push(<View key={k()}><Inline runs={parseInline(buf.join(" "))} base={st.p} /></View>);
  }
  return out;
}

/** Drop a leading "# Title" from the body when it just repeats the doc title
 *  (the branded header already shows it). */
function stripRedundantTitle(md: string, title: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const m = i < lines.length ? /^#\s+(.*)$/.exec(lines[i]) : null;
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
        <Text style={st.docTitle}>{title}</Text>
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
