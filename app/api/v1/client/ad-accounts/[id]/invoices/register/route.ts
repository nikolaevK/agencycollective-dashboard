export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { readUpload } from "@/lib/api/files";
import { tokenHasResource } from "@/lib/apiScopes";
import { getAdAccount } from "@/lib/adAccounts";
import { findUser } from "@/lib/users";
import {
  normalizeBrandName,
  brandsMatch,
  getAdAccountPayoutMonthsByBrand,
} from "@/lib/payouts";
import { insertDocument, type PayoutDocument } from "@/lib/payoutDocuments";
import {
  createAdAccountInvoice,
  reconcileInvoiceForAdAccount,
} from "@/lib/adAccountInvoices";
import { adInvoiceType, computeAdSpendFeeCents } from "@/lib/adAccountInvoice";
import type { AdInvoiceType } from "@/lib/adAccountLineItem";
import { logAuditEvent } from "@/lib/auditLog";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Register a historical (out-of-band) ad-account invoice — multipart form:
 * invoiceNumber, cycleAnchor (yyyy-mm-dd), amountCents, sentAt?, spendCents?,
 * feeBps?, retainerCents?, invoiceType?, recipientEmail?, pdf? (≤10 MB) —
 * or JSON with the same fields + `fileBase64`/`fileName` for the PDF.
 * Non-superseding backfill, reconciled on insert (mirrors the dashboard).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  try {
    const account = await getAdAccount(params.id);
    if (!account) return fail("not_found", "Ad account not found", 404);
    if (!tokenHasResource(auth.token, "client", account.userId)) {
      return fail("resource_forbidden", "This token is not allowed to access this client", 403);
    }

    let brand: string | null = null;
    const userId: string | null = account.userId;
    if (account.userId) {
      const user = await findUser(account.userId);
      if (user) brand = user.payoutBrand ?? user.displayName;
    }

    const payload = await readUpload(request, { fileField: "pdf" });
    if (!payload) {
      return fail(
        "invalid_request",
        "Expected multipart/form-data, or JSON with `fileBase64` for the PDF",
        400
      );
    }

    const rawNumber = String(payload.get("invoiceNumber") ?? "").trim();
    const invoiceNumber = rawNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100);
    if (!invoiceNumber) return fail("invalid_request", "invoiceNumber is required", 400);

    const cycleAnchor = String(payload.get("cycleAnchor") ?? "").trim();
    if (!DATE_RE.test(cycleAnchor)) {
      return fail("invalid_request", "cycleAnchor must be yyyy-mm-dd", 400);
    }
    const cycleProbe = new Date(`${cycleAnchor}T00:00:00Z`);
    if (isNaN(cycleProbe.getTime()) || cycleProbe.toISOString().slice(0, 10) !== cycleAnchor) {
      return fail("invalid_request", "cycleAnchor is not a real date", 400);
    }

    const sentDate = String(payload.get("sentAt") ?? "").trim();
    let sentAt: string | undefined;
    if (sentDate) {
      if (!DATE_RE.test(sentDate)) {
        return fail("invalid_request", "sentAt must be yyyy-mm-dd", 400);
      }
      const probe = new Date(`${sentDate}T12:00:00Z`);
      if (isNaN(probe.getTime())) {
        return fail("invalid_request", "sentAt is not a real date", 400);
      }
      sentAt = probe.toISOString();
    }

    const rawAmount = Number(payload.get("amountCents"));
    const amountCents =
      Number.isFinite(rawAmount) && rawAmount >= 0
        ? Math.min(Math.round(rawAmount), 1_000_000_000)
        : 0;
    const rawSpend = Number(payload.get("spendCents"));
    const spendCents = Number.isFinite(rawSpend) && rawSpend > 0 ? Math.round(rawSpend) : 0;
    const rawFee = Number(payload.get("feeBps"));
    const feeBps =
      Number.isFinite(rawFee) && rawFee > 0 ? Math.round(rawFee) : account.adSpendFeeBps;
    const rawRetainer = Number(payload.get("retainerCents"));
    const retainerCents =
      Number.isFinite(rawRetainer) && rawRetainer > 0 ? Math.round(rawRetainer) : 0;

    const typeField = String(payload.get("invoiceType") ?? "").trim();
    const feeCents = computeAdSpendFeeCents(spendCents, feeBps);
    const invoiceType: AdInvoiceType =
      typeField === "retainer" || typeField === "ad_spend" || typeField === "combined"
        ? (typeField as AdInvoiceType)
        : adInvoiceType(retainerCents, feeCents);

    let recipientEmail: string | null = null;
    const rawEmail = String(payload.get("recipientEmail") ?? "").trim();
    if (rawEmail) {
      if (!EMAIL_RE.test(rawEmail) || rawEmail.length > 254) {
        return fail("invalid_request", "Invalid recipientEmail", 400);
      }
      recipientEmail = rawEmail;
    }

    const actor = tokenAuditActor(auth.token);

    // Optional PDF upload — filed in payout_documents and linked.
    let payoutDocumentId: string | null = null;
    const pdfFile = payload.file;
    if (pdfFile) {
      if (pdfFile.buffer.length > 10 * 1024 * 1024) {
        return fail("payload_too_large", "PDF too large (max 10 MB)", 413);
      }
      const type = pdfFile.type || "";
      const isPdf = type === "application/pdf" || /\.pdf$/i.test(pdfFile.name) || !type;
      if (!isPdf) return fail("invalid_request", "Only PDF uploads are allowed", 400);
      const buffer = pdfFile.buffer;
      if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
        return fail("invalid_request", "File is not a valid PDF", 400);
      }
      const fileBrand = brand || account.accountName || "Ad Account";
      const anchor = sentDate || cycleAnchor;
      const m = anchor.match(/^(\d{4})-(\d{2})/);
      const doc: PayoutDocument = {
        id: crypto.randomUUID(),
        normalizedBrand: normalizeBrandName(fileBrand),
        brandName: fileBrand,
        docType: "invoice",
        fileName: `invoice-${invoiceNumber}.pdf`,
        fileSize: buffer.length,
        payoutMonth: m ? Number(m[2]) : null,
        payoutYear: m ? Number(m[1]) : null,
        uploadedBy: actor.adminId,
        createdAt: sentAt ?? new Date().toISOString(),
      };
      try {
        await insertDocument(doc, buffer);
        payoutDocumentId = doc.id;
      } catch (err) {
        console.error("[v1 ad-account-invoice/register] PDF file failed:", err);
        return fail("internal_error", "Failed to store the PDF", 500);
      }
    }

    const invoice = await createAdAccountInvoice({
      adAccountId: account.id,
      userId,
      brand,
      invoiceNumber,
      invoiceType,
      payoutDocumentId,
      cycleAnchor,
      amountCents,
      spendCents: spendCents > 0 ? spendCents : null,
      feeBps: spendCents > 0 ? feeBps : null,
      recipientEmail,
      sentByAdminId: actor.adminId,
      sentAt,
      supersede: false, // backfill — keep the current active invoice intact
    });

    // Reconcile immediately so a backdated cycle with a matching payout
    // lands as paid rather than awaiting (best-effort, same as dashboard).
    if (brand) {
      try {
        const byBrand = await getAdAccountPayoutMonthsByBrand();
        const norm = normalizeBrandName(brand);
        const months: Array<{ year: number; month: number }> = [];
        for (const [key, arr] of byBrand) {
          if (key === norm || brandsMatch(norm, key)) months.push(...arr);
        }
        await reconcileInvoiceForAdAccount(invoice, months);
      } catch {
        // best-effort — the directory build will reconcile on next read
      }
    }

    logAuditEvent({
      ...actor,
      action: "ad_account.invoice_register",
      targetType: "ad_account",
      targetId: params.id,
      details: JSON.stringify({ invoiceNumber, cycleAnchor, amountCents }),
    }).catch(() => {});

    return ok(invoice, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/ad-accounts/[id]/invoices/register error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
