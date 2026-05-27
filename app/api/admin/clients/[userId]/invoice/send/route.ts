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
import { createRebillInvoice } from "@/lib/clientRebillInvoices";

interface RouteContext {
  params: { userId: string };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Free-form email attachments (alongside the invoice PDF). Limits tuned for
// Vercel Pro's 4.5 MB request body cap (platform-level — exceeded requests are
// rejected by Vercel before reaching this handler with a generic 413).
// Budget: 4.5 MB total = PDF (typically 0.1–0.5 MB; cap 10 MB) + attachments
// (cap 3 MB total) + form fields (~5 KB) + multipart/SMTP framing (~500 KB).
// A degenerate giant PDF can still blow the budget — that's a pre-existing
// concern of the 10 MB PDF cap, not the attachments limit.
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_SIZE = 3 * 1024 * 1024; // 3 MB per file
const MAX_TOTAL_ATTACHMENT_SIZE = 3 * 1024 * 1024; // 3 MB total
// Executable-ish extensions that mail providers commonly bounce or strip;
// blocking up-front avoids a silent partial send and surfaces the issue while
// the admin still has the picker open.
const BLOCKED_ATTACHMENT_EXTS = new Set([
  "exe", "bat", "cmd", "com", "scr", "pif", "msi", "ps1", "vbs", "vbe",
  "js", "jse", "wsf", "wsh", "hta", "jar", "app", "deb", "rpm",
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** Cap filenames echoed back in error messages — a 5000-char filename would
 *  otherwise produce a 5000-char error string the toast/banner has to render. */
function shortName(name: string): string {
  return name.length > 80 ? `${name.slice(0, 77)}…` : name;
}

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

    // Free-form attachments (receipts, addendums, supporting docs). Validated
    // here so a bad upload errors before we even open the SMTP connection;
    // each file is materialised to a Buffer for nodemailer. The PDF itself
    // is NOT counted against MAX_TOTAL_ATTACHMENT_SIZE — that ceiling is for
    // these extras only; total payload to SMTP = PDF (capped 10 MB) + extras
    // (capped 25 MB) = ~35 MB worst case, still inside typical relay limits.
    const attachmentFiles = formData
      .getAll("attachments")
      .filter((v): v is File => v instanceof File);
    if (attachmentFiles.length > MAX_ATTACHMENT_COUNT)
      return NextResponse.json(
        { error: `Too many attachments (max ${MAX_ATTACHMENT_COUNT})` },
        { status: 400 }
      );
    let totalAttachmentBytes = 0;
    const additionalAttachments: Array<{
      filename: string;
      buffer: Buffer;
      contentType: string;
    }> = [];
    for (const file of attachmentFiles) {
      if (file.size === 0) continue; // empty file inputs come through as 0-byte Files
      if (file.size > MAX_ATTACHMENT_SIZE)
        return NextResponse.json(
          { error: `Attachment "${shortName(file.name)}" exceeds ${MAX_ATTACHMENT_SIZE / 1024 / 1024} MB` },
          { status: 413 }
        );
      totalAttachmentBytes += file.size;
      if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_SIZE)
        return NextResponse.json(
          {
            error: `Attachments total exceeds ${MAX_TOTAL_ATTACHMENT_SIZE / 1024 / 1024} MB`,
          },
          { status: 413 }
        );
      const ext = extensionOf(file.name);
      if (ext && BLOCKED_ATTACHMENT_EXTS.has(ext))
        return NextResponse.json(
          { error: `Attachment type ".${ext}" is not allowed` },
          { status: 400 }
        );
      additionalAttachments.push({
        filename: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || "application/octet-stream",
      });
    }

    const sent = await sendInvoiceEmail(email, buffer, safeNumber, {
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      variant: "rebill",
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
      detail.row.schedule.nextRebillAt ?? now.toISOString().slice(0, 10);
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
