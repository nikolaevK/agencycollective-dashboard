export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { docusealFetch, docusealPost } from "@/lib/docuseal/client";
import { DocuSealTemplateListSchema, DocuSealTemplateSchema } from "@/lib/docuseal/schemas";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

/**
 * Proxy to DocuSeal GET /templates.
 * Keeps the API key server-side only.
 */
export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await docusealFetch("/templates", DocuSealTemplateListSchema, {
      params: { limit: 100 },
    });
    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[docuseal-templates GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

/**
 * Upload a PDF or DOCX to DocuSeal to create a new template.
 * Uses DocuSeal POST /templates/pdf or /templates/docx.
 */
export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const templateName = formData.get("name") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type) && !file.name.endsWith(".pdf") && !file.name.endsWith(".docx")) {
      return NextResponse.json({ error: "Only PDF and DOCX files are supported" }, { status: 400 });
    }

    // Convert file to bytes and verify magic bytes
    const bytes = await file.arrayBuffer();
    const header = new Uint8Array(bytes).slice(0, 4);
    const isPdf = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46; // %PDF
    const isZip = header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04; // PK.. (DOCX is ZIP)

    if (!isPdf && !isZip) {
      return NextResponse.json({ error: "Invalid file content — only PDF and DOCX are supported" }, { status: 400 });
    }

    const base64 = Buffer.from(bytes).toString("base64");
    const endpoint = isPdf ? "/templates/pdf" : "/templates/docx";
    const mimeType = isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    const safeName = (templateName || file.name.replace(/\.[^.]+$/, "")).slice(0, 200);

    const payload: Record<string, unknown> = {
      documents: [
        {
          name: safeName,
          file: `data:${mimeType};base64,${base64}`,
        },
      ],
      name: safeName,
    };

    const result = await docusealPost(endpoint, payload, DocuSealTemplateSchema);

    return NextResponse.json({
      data: { id: result.id, name: result.name },
    }, { status: 201 });
  } catch (err) {
    console.error("[docuseal-templates POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
