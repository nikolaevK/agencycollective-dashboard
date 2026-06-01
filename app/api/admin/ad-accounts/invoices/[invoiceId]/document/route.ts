export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { findAdAccountInvoice } from "@/lib/adAccountInvoices";
import { findDocumentWithData } from "@/lib/payoutDocuments";

interface RouteContext {
  params: { invoiceId: string };
}

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

/**
 * Serve the stored PDF for a sent ad-account invoice. The PDF was filed in
 * payout_documents at send time and linked via the invoice's
 * payout_document_id; this streams it back (gated by the `users` permission via
 * middleware, like the rest of /api/admin/ad-accounts).
 */
export async function GET(_request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const invoice = await findAdAccountInvoice(params.invoiceId);
  if (!invoice)
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
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
