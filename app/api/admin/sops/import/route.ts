export const dynamic = "force-dynamic";
// PDF text extraction can take a couple of seconds on large files.
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { markdownToSopDoc } from "@/lib/sopMarkdown";
import { extractDocumentText } from "@/lib/sopDocumentText";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Convert an uploaded document into our internal SOP block model — DETERMINISTIC,
 * no AI. Supports PDF, Word (.docx), Markdown, HTML, and plain text (Notion
 * exports). The AI assistant is only for generating a brand-new SOP from a
 * prompt (see /api/sop-chat); uploads never call a model.
 */
export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File exceeds the 10 MB limit" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name || "document";
    console.log("[admin/sops/import] start", { name, type: file.type, size: file.size });

    const extracted = await extractDocumentText(buffer, name, file.type);
    if (!extracted.ok) {
      return NextResponse.json({ error: extracted.error }, { status: extracted.status });
    }
    if (!extracted.text.trim()) {
      return NextResponse.json(
        { error: "No readable text found in this document (it may be image-only)." },
        { status: 422 }
      );
    }

    const fallbackTitle = name.replace(/\.[^.]+$/, "") || "Imported SOP";
    const doc = markdownToSopDoc(extracted.text, fallbackTitle);
    console.log("[admin/sops/import] done", { name, sections: doc.sections.length });
    return NextResponse.json({ data: { doc, sourceName: name } });
  } catch (err) {
    console.error("[admin/sops/import POST]", err);
    return NextResponse.json({ error: "Failed to import the document." }, { status: 500 });
  }
}
