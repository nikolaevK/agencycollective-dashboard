export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDocumentWithData } from "@/lib/mediaDocuments";

function requireMediaAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media && !session.permissions.media_manage) {
    return null;
  }
  return session;
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = requireMediaAdmin();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = params.id;
  if (!id)
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const result = await findDocumentWithData(id);
  if (!result)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { doc, fileData } = result;

  // ?view=1 → render inline (new browser tab); default → download.
  const { searchParams } = new URL(request.url);
  const inline = searchParams.get("view") === "1";
  const disposition = inline ? "inline" : "attachment";

  // RFC 5987 encoding for non-ASCII filenames
  const asciiName = doc.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_");
  const encodedName = encodeURIComponent(doc.fileName);

  return new NextResponse(new Uint8Array(fileData), {
    headers: {
      "Content-Type": doc.mimeType === "text/markdown" ? "text/markdown; charset=utf-8" : "application/pdf",
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(fileData.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
