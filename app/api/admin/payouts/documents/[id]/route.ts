export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { findDocument } from "@/lib/payoutDocuments";

const UPLOAD_DIR = path.resolve(process.cwd(), "data", "uploads", "documents");

async function requireCloserAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.closers) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return admin;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const admin = await requireCloserAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await findDocument(params.id);
  if (!doc)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });

  // Path traversal prevention: resolve and verify within upload dir
  const fullPath = path.resolve(process.cwd(), doc.filePath);
  if (!fullPath.startsWith(UPLOAD_DIR)) {
    console.error("[admin/payouts/documents/[id] GET] Path traversal blocked:", doc.filePath);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!fs.existsSync(fullPath))
    return NextResponse.json({ error: "File not found" }, { status: 404 });

  const fileBuffer = fs.readFileSync(fullPath);

  // RFC 5987 encoding for non-ASCII filenames
  const asciiName = doc.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_");
  const encodedName = encodeURIComponent(doc.fileName);

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
