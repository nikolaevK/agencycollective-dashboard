export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { findAdAccountInvoice } from "@/lib/adAccountInvoices";
import { findDocumentWithData } from "@/lib/payoutDocuments";
import { requireDirectoryActor, findAdAccountInScope } from "@/lib/api/requireAdmin";
import { isExternalScope } from "@/lib/workspaces";


interface RouteContext {
  params: { invoiceId: string };
}


/**
 * Serve the stored PDF for a sent ad-account invoice. The PDF was filed in
 * payout_documents at send time and linked via the invoice's
 * payout_document_id; this streams it back (gated by the `users` permission via
 * middleware, like the rest of /api/admin/ad-accounts).
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const invoice = await findAdAccountInvoice(params.invoiceId);
  if (!invoice)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  // Workspace scoping: invoices of out-of-book accounts read as not-found;
  // free invoices (no account) are internal-only.
  if (invoice.adAccountId) {
    if (!(await findAdAccountInScope(actor.scope, invoice.adAccountId)))
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  } else if (isExternalScope(actor.scope)) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (!invoice.payoutDocumentId)
    return NextResponse.json({ error: "No stored PDF for this invoice" }, { status: 404 });

  const result = await findDocumentWithData(invoice.payoutDocumentId);
  if (!result)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { doc, fileData } = result;
  const asciiName = doc.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_");
  const encodedName = encodeURIComponent(doc.fileName);

  return new NextResponse(new Uint8Array(fileData), {
    headers: {
      "Content-Type": "application/pdf",
      // inline so it opens in a new tab; the browser's viewer offers download.
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(fileData.length),
      "Cache-Control": "private, no-store",
    },
  });
}
