export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { findUser } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { findDocumentWithData } from "@/lib/payoutDocuments";
import { normalizeBrandName, brandsMatch } from "@/lib/payouts";

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

interface RouteContext {
  params: { userId: string; docId: string };
}

/**
 * Client-scoped document download. Gated by the `users` permission via
 * middleware (`/api/admin/clients/*`), so a Client-Directory admin can pull a
 * client's invoices/scopes without the `closers` perm the Payouts-side download
 * requires. Verifies the document's brand matches the client before streaming,
 * so an arbitrary doc id can't be funnelled through this client's route.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const user = await findUser(params.userId);
  if (!user)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const result = await findDocumentWithData(params.docId);
  if (!result)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { doc, fileData } = result;

  // Scope: the document's brand must match this client's brand (same matcher
  // used to list the docs), so this route only serves *this* client's files.
  const clientNorm = normalizeBrandName(user.payoutBrand ?? user.displayName);
  if (!clientNorm || !brandsMatch(clientNorm, doc.normalizedBrand)) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // RFC 5987 encoding for non-ASCII filenames
  const asciiName = doc.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_");
  const encodedName = encodeURIComponent(doc.fileName);

  return new NextResponse(new Uint8Array(fileData), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(fileData.length),
      "Cache-Control": "private, no-store",
    },
  });
}
