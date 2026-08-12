export const dynamic = "force-dynamic";
export const maxDuration = 30;

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";
import { getClientDetail } from "@/lib/clientDirectory";
import { ensureMigrated } from "@/lib/db";
import { sendInvoiceEmail, isEmailConfigured } from "@/lib/invoice/emailService";
import { readEmailAttachments } from "@/lib/invoice/readEmailAttachments";
import {
  getAgencyProfileEmailBrand,
  type AgencyProfileEmailBrand,
} from "@/lib/invoiceAgencyProfiles";
import { insertDocument, type PayoutDocument } from "@/lib/payoutDocuments";
import { normalizeBrandName } from "@/lib/payouts";
import { createRebillInvoice } from "@/lib/clientRebillInvoices";
import { businessTodayYmd } from "@/lib/businessTime";

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
  if (!isEmailConfigured())
    return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  await ensureMigrated();

  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const session = { adminId: guard.actor.admin.id };

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

    // Invoice style — when the drawer used a saved Agency Profile (e.g.
    // PepAds), brand the email to match the PDF. Resolved server-side from
    // the profile id so no free-form branding text enters the email.
    const styleProfileId = String(formData.get("styleProfileId") ?? "").trim();
    let emailBrand: AgencyProfileEmailBrand | undefined;
    if (styleProfileId) {
      const brand = await getAgencyProfileEmailBrand(styleProfileId);
      if (!brand)
        return NextResponse.json(
          { error: "Invoice style profile not found" },
          { status: 400 }
        );
      emailBrand = brand;
    }

    // Free-form attachments (receipts, addendums, supporting docs). The PDF
    // itself is NOT counted against the attachments ceiling — that budget is
    // for these extras only (see lib/invoice/attachments.ts).
    const attachRead = await readEmailAttachments(formData);
    if (!attachRead.ok)
      return NextResponse.json(
        { error: attachRead.error },
        { status: attachRead.status }
      );
    const additionalAttachments = attachRead.attachments;

    const sent = await sendInvoiceEmail(email, buffer, safeNumber, {
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      variant: "rebill",
      brand: emailBrand,
      additionalAttachments:
        additionalAttachments.length > 0 ? additionalAttachments : undefined,
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
      workspace: guard.user.workspace,
      docType: "invoice",
      fileName: `invoice-${safeNumber}.pdf`,
      fileSize: buffer.length,
      payoutMonth: month,
      payoutYear: year,
      uploadedBy: session.adminId,
      createdAt: now.toISOString(),
    };

    // Email already went out — don't fail the request if filing the copy hiccups.
    let docSaved = true;
    try {
      await insertDocument(doc, buffer);
    } catch (err) {
      console.error("[client-invoice/send] document save failed (email sent):", err);
      docSaved = false;
    }

    // Record the sent invoice so the client moves into the `invoice_sent`
    // state until a payout for this cycle lands in the Payout DB (auto-
    // promoted on read) or an admin marks it unpaid. Best-effort — the email
    // already went out, and the directory's reconciliation can retry on the
    // next build. `cycle_anchor` is the schedule's nextRebillAt at this
    // moment; if absent (unscheduled client), fall back to today so a "Sent
    // Invoices" entry still surfaces.
    const cycleAnchor =
      detail.row.schedule.nextRebillAt ?? businessTodayYmd();
    const rawAmount = Number(formData.get("amountCents"));
    const amountCents =
      Number.isFinite(rawAmount) && rawAmount >= 0
        ? Math.min(Math.round(rawAmount), 1_000_000_000) // 10M USD safety cap
        : 0;
    try {
      await createRebillInvoice({
        userId: params.userId,
        invoiceNumber: safeNumber,
        payoutDocumentId: docSaved ? doc.id : null,
        cycleAnchor,
        amountCents,
        recipientEmail: email,
        sentByAdminId: session.adminId,
      });
    } catch (err) {
      console.error("[client-invoice/send] invoice record failed:", err);
      // Email + (maybe) doc save already succeeded — surfacing partial save
      // is enough; the next directory build won't show invoice_sent, but the
      // admin can re-send to re-establish the record if needed.
    }

    return NextResponse.json({ success: true, saved: docSaved });
  } catch (err) {
    console.error("[client-invoice/send]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
