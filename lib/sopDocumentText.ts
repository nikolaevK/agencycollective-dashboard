import { htmlToMarkdownish } from "./sopMarkdown";

// ---------------------------------------------------------------------------
// Deterministic text extraction for uploaded documents — NO AI. Used by the
// SOP import route to turn any supported file into Markdown-ish text, which
// markdownToSopDoc then converts into our block model.
//   - PDF   → unpdf (serverless-safe pdf.js build, no native deps)
//   - DOCX  → mammoth (→ HTML → markdown-ish)
//   - HTML  → tag-stripped markdown-ish
//   - md/txt/csv/json/text → raw UTF-8
// ---------------------------------------------------------------------------

const MAX_TEXT_CHARS = 400_000;
const TEXT_EXTS = [".md", ".markdown", ".txt", ".csv", ".json"];

export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; error: string; status: number };

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

export async function extractDocumentText(
  buffer: Buffer,
  name: string,
  mime: string
): Promise<ExtractResult> {
  const ext = extOf(name);
  const isPdf =
    mime === "application/pdf" || ext === ".pdf" || buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  const isDocx =
    ext === ".docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isHtml = ext === ".html" || ext === ".htm" || mime === "text/html";
  const isText = TEXT_EXTS.includes(ext) || mime.startsWith("text/") || mime === "application/json";

  try {
    if (isPdf) {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return { ok: true, text: String(text ?? "").slice(0, MAX_TEXT_CHARS) };
    }
    if (isDocx) {
      const mod = (await import("mammoth")) as unknown as {
        default?: { convertToHtml: (o: { buffer: Buffer }) => Promise<{ value: string }> };
        convertToHtml?: (o: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const mammoth = mod.default ?? mod;
      const { value } = await mammoth.convertToHtml!({ buffer });
      return { ok: true, text: htmlToMarkdownish(String(value ?? "")).slice(0, MAX_TEXT_CHARS) };
    }
    if (isHtml) {
      return { ok: true, text: htmlToMarkdownish(buffer.toString("utf8")).slice(0, MAX_TEXT_CHARS) };
    }
    if (isText) {
      return { ok: true, text: buffer.toString("utf8").slice(0, MAX_TEXT_CHARS) };
    }
    return {
      ok: false,
      error: "Unsupported file type. Upload a PDF, Word (.docx), Markdown, HTML, or text file.",
      status: 400,
    };
  } catch (err) {
    console.error("[sopDocumentText] extract failed", { name, ext }, err);
    return {
      ok: false,
      error: "Could not read this file — it may be corrupt, image-only, or password-protected.",
      status: 422,
    };
  }
}
