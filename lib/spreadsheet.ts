import { inflateRawSync } from "zlib";

// ---------------------------------------------------------------------------
// Minimal, dependency-free spreadsheet reader (XLSX + CSV) — just enough to
// import the Meta Accounts sheets without pulling in a heavy/CVE-prone parser.
// An .xlsx is a ZIP of XML: we walk the central directory (reliable sizes +
// local-header offsets), inflate entries with Node's zlib, and extract the
// first worksheet's cells via lightweight regex. Returns a dense string matrix
// (rows × columns, gaps filled with ""). NOT a general-purpose Office parser —
// numbers come back as their raw string form, dates as serials; the import
// layer treats every cell as text, which is all these sheets need.
// ---------------------------------------------------------------------------

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

// Hard limits so a hostile or malformed file can't OOM the serverless
// function: inflate is capped (zip-bomb guard — a few-MB DEFLATE stream can
// expand ~1000x), and the dense matrix is capped because maxRow/maxCol come
// from attacker-controlled attributes (a single cell ref like "XFD1048576"
// would otherwise demand rows × cols ≈ 17 billion slots).
const MAX_INFLATED_BYTES = 50 * 1024 * 1024; // per ZIP entry
const MAX_SHEET_ROWS = 100_000;
const MAX_SHEET_COLS = 1024;

/** Parse an uploaded spreadsheet (xlsx or csv) into a dense string matrix. */
export function parseSpreadsheet(buffer: Buffer): string[][] {
  const isXlsx = XLSX_MAGIC.every((b, i) => buffer[i] === b);
  if (isXlsx) return readXlsxFirstSheet(buffer);
  // CSV (or TSV): decode as UTF-8, stripping a BOM if present.
  let text = buffer.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return parseDelimited(text);
}

// ── ZIP ────────────────────────────────────────────────────────────────────

function readZip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const EOCD_SIG = 0x06054b50;
  // Locate the End Of Central Directory record by scanning backward (a trailing
  // comment may follow it, so we can't assume it's the final 22 bytes).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("Invalid XLSX: no ZIP end-of-central-directory record");

  const entryCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory offset
  const CEN_SIG = 0x02014b50;
  const LOC_SIG = 0x04034b50;

  for (let n = 0; n < entryCount && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    if (uncompSize > MAX_INFLATED_BYTES) {
      throw new Error("Invalid XLSX: entry too large");
    }
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // The local header carries its own (possibly different) name/extra lengths,
    // which determine where the compressed data actually starts.
    if (buf.readUInt32LE(localOffset) === LOC_SIG) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);
      let data: Buffer;
      if (method === 0) data = Buffer.from(raw);
      // maxOutputLength backstops the central-directory size check above —
      // the recorded uncompSize can lie, the actual inflate cannot.
      else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: MAX_INFLATED_BYTES });
      else throw new Error(`Invalid XLSX: unsupported ZIP compression method ${method}`);
      files.set(name, data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ── XML helpers ──────────────────────────────────────────────────────────────

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&"); // last, so decoded text isn't re-decoded
}

/** "A" → 0, "Z" → 25, "AA" → 26 (bijective base-26). */
function columnToIndex(ref: string): number {
  let idx = 0;
  for (let i = 0; i < ref.length; i++) {
    idx = idx * 26 + (ref.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    let text = "";
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(m[1]))) text += decodeXmlEntities(tm[1]);
    out.push(text);
  }
  return out;
}

/** Resolve the first worksheet's file path via workbook order + rels. */
function firstSheetPath(files: Map<string, Buffer>): string | null {
  const wb = files.get("xl/workbook.xml")?.toString("utf8");
  const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8");
  if (wb && rels) {
    const rid = /<sheet\b[^>]*?\br:id="([^"]+)"/.exec(wb)?.[1];
    if (rid) {
      const relRe = /<Relationship\b([^>]*)\/?>/g;
      let m: RegExpExecArray | null;
      while ((m = relRe.exec(rels))) {
        const attrs = m[1];
        if (/\bId="([^"]+)"/.exec(attrs)?.[1] === rid) {
          const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
          if (target) {
            const clean = target.replace(/^\/?/, "").replace(/^xl\//, "");
            return `xl/${clean}`;
          }
        }
      }
    }
  }
  // Fallback: the lexicographically-first worksheet file.
  const sheets = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort();
  return sheets[0] ?? null;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rowsByNum = new Map<number, Map<number, string>>();
  let maxCol = -1;

  const rowRe = /<row\b[^>]*?\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const rowNum = parseInt(rowMatch[1], 10);
    if (rowNum > MAX_SHEET_ROWS) {
      throw new Error(`Invalid XLSX: sheet exceeds ${MAX_SHEET_ROWS.toLocaleString()} rows`);
    }
    const cells = new Map<number, string>();
    // Either <c ...>...</c> or a self-closing <c ... />.
    const cRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cRe.exec(rowMatch[2]))) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      if (!ref) continue;
      const colIdx = columnToIndex(ref);
      if (colIdx >= MAX_SHEET_COLS) {
        throw new Error(`Invalid XLSX: sheet exceeds ${MAX_SHEET_COLS} columns`);
      }
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      let value = "";
      if (type === "inlineStr") {
        const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let tm: RegExpExecArray | null;
        while ((tm = tRe.exec(body))) value += decodeXmlEntities(tm[1]);
      } else {
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
        if (raw != null) {
          const decoded = decodeXmlEntities(raw);
          value = type === "s" ? shared[parseInt(decoded, 10)] ?? "" : decoded;
        }
      }
      cells.set(colIdx, value);
      if (colIdx > maxCol) maxCol = colIdx;
    }
    rowsByNum.set(rowNum, cells);
  }

  // Loop, not Math.max(...keys) — spreading 100k+ keys overflows the stack.
  let maxRow = 0;
  for (const r of rowsByNum.keys()) if (r > maxRow) maxRow = r;
  const matrix: string[][] = [];
  for (let r = 1; r <= maxRow; r++) {
    const cells = rowsByNum.get(r);
    const row: string[] = [];
    for (let c = 0; c <= maxCol; c++) row.push(cells?.get(c) ?? "");
    matrix.push(row);
  }
  return matrix;
}

function readXlsxFirstSheet(buffer: Buffer): string[][] {
  const files = readZip(buffer);
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
  const sheetPath = firstSheetPath(files);
  if (!sheetPath) throw new Error("Invalid XLSX: no worksheet found");
  const sheetXml = files.get(sheetPath)?.toString("utf8");
  if (!sheetXml) throw new Error("Invalid XLSX: worksheet is empty");
  return parseSheet(sheetXml, shared);
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** RFC-4180-ish parser: quoted fields, "" escaping, comma/tab delimiter, CRLF. */
function parseDelimited(text: string): string[][] {
  // Auto-detect tab vs comma from the first line (outside quotes, roughly).
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // swallow — a following \n ends the row
    } else {
      field += ch;
    }
  }
  // Flush the trailing field/row unless the file ended on a clean newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
