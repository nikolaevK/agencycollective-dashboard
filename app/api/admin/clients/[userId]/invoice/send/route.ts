export const dynamic = "force-dynamic";
export const maxDuration = 30;

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getClientDetail } from "@/lib/clientDirectory";
import { ensureMigrated } from "@/lib/db";
import { sendInvoiceEmail, isEmailConfigured } from "@/lib/invoice/emailService";
import { insertDocument, type PayoutDocument } from "@/lib/payoutDocuments";
import { normalizeBrandName } from "@/lib/payouts";

interface RouteContext {
  params: { userId: string };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Send a re-bill invoice to a client and file the PDF where both the Payout
 * page and the client's Documents tab can see it (payout_documents,
 * doc_type='invoice', keyed by the client's brand). The PDF is generated
 * client-side (@react-pdf/renderer) and posted here. Does NOT create a payout
 * row or touch the re-bill schedule — invoice and payment-of-record stay
 * separate (the Payout page still drives the next re-bill).
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const session = getAdminSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isEmailConfigured())
    return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  await ensureMigrated();

  try {
    const detail = await getClientDetail(params.userId);
    if (!detail)
      return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const formData = await req.formData();
    const email = String(formData.get("email") ?? "").trim();
    const pdfFile = formData.get("pdf") as File | null;
    const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
    const ccRaw = formData.getAll("cc").filter((v): v is string => typeof v === "string");

    if (!email || !pdfFile)
      return NextResponse.json({ error: "email and pdf are required" }, { status: 400 });
    if (!EMAIL_RE.test(email) || email.length > 254)
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    if (pdfFile.size > 10 * 1024 * 1024)
      return NextResponse.json({ error: "PDF too large" }, { status: 413 });

    // Validate + dedupe CC, excluding the primary recipient.
    const toLower = email.toLowerCase();
    const seen = new Set<string>([toLower]);
    const ccEmails: string[] = [];
    for (const raw of ccRaw) {
      const v = raw.trim().toLowerCase();
      if (!v) continue;
      if (!EMAIL_RE.test(v) || v.length > 254)
        return NextResponse.json({ error: "Invalid CC email" }, { status: 400 });
      if (seen.has(v)) continue;
      seen.add(v);
      ccEmails.push(v);
      if (ccEmails.length >= 10) break;
    }

    const buffer = Buffer.from(await pdfFile.arrayBuffer());
    const safeNumber =
      invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100) || "Invoice";

    const sent = await sendInvoiceEmail(email, buffer, safeNumber, {
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      variant: "rebill",
    });
    if (!sent)
      return NextResponse.json({ error: "Failed to send invoice email" }, { status: 500 });

    // File the PDF against the client's brand → visible on the Payout page and
    // the client's Documents tab. Brand resolved server-side (don't trust body).
    // Resolve the brand the same way the prefill does (matchedBrand ??
    // displayName) so the filed doc lands under the brand the rest of the
    // billing UI uses.
    const brand = detail.row.matchedBrand ?? detail.row.displayName;
    const now = new Date();
    const rawMonth = Number(formData.get("payoutMonth"));
    const rawYear = Number(formData.get("payoutYear"));
    const month =
      Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12
        ? rawMonth
        : now.getMonth() + 1;
    const year =
      Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
        ? rawYear
        : now.getFullYear();

    const doc: PayoutDocument = {
      id: crypto.randomUUID(),
      normalizedBrand: normalizeBrandName(brand),
      brandName: brand,
      docType: "invoice",
      fileName: `invoice-${safeNumber}.pdf`,
      fileSize: buffer.length,
      payoutMonth: month,
      payoutYear: year,
      uploadedBy: session.adminId,
      createdAt: now.toISOString(),
    };

    // Email already went out — don't fail the request if filing the copy hiccups.
    try {
      await insertDocument(doc, buffer);
    } catch (err) {
      console.error("[client-invoice/send] document save failed (email sent):", err);
      return NextResponse.json({ success: true, saved: false });
    }

    return NextResponse.json({ success: true, saved: true });
  } catch (err) {
    console.error("[client-invoice/send]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
