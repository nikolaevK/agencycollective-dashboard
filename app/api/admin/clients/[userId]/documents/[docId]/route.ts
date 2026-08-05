export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { findDocumentWithData } from "@/lib/payoutDocuments";
import { normalizeBrandName, brandsMatch } from "@/lib/payouts";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";

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
  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const user = guard.user;

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

  // Cross-book isolation (mirrors the list route): a non-main client serves
  // documents filed under its own book, or whose brand EXACTLY matches the
  // internally-managed payout-brand link (deal imports / Payout Tracker
  // uploads land under 'main'). Fuzzy display-name matches never cross books.
  if (user.workspace !== "main") {
    const linkNorm = user.payoutBrand ? normalizeBrandName(user.payoutBrand) : "";
    const exactLinked = linkNorm !== "" && doc.normalizedBrand === linkNorm;
    if (!exactLinked && doc.workspace !== user.workspace) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
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
