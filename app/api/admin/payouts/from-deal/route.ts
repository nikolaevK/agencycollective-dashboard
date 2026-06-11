export const dynamic = "force-dynamic";

import crypto from "crypto";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import {
  insertPayout,
  getImportedDealIds,
  normalizeBrandName,
} from "@/lib/payouts";
import type { PayDistributed, PayoutRecord, SplitParty } from "@/lib/payouts";
import { findDeal } from "@/lib/deals";
import { findDealContractByDealId } from "@/lib/dealContracts";
import { findAdditionalContractsByDealId } from "@/lib/dealAdditionalContracts";
import {
  findDealInvoiceByDealId,
  getDealInvoicePdf,
} from "@/lib/dealInvoices";
import {
  findAdditionalInvoicesByDealId,
  getAdditionalInvoicePdf,
} from "@/lib/dealAdditionalInvoices";
import { fetchSignedContractPdf } from "@/lib/docuseal/signedDocument";
import { insertDocument, MAX_DOCUMENT_SIZE_BYTES } from "@/lib/payoutDocuments";
import type { PayoutDocument } from "@/lib/payoutDocuments";
import { autofillClientProfileFromDeal } from "@/lib/clientProfile";
import { logAuditEvent } from "@/lib/auditLog";

const MAX_TEXT = 500;
const MAX_NOTES = 2000;
const MAX_DATE = 20;
/** Cap how many docs a single import can attach, to bound work + storage. */
const MAX_ATTACHED_DOCS = 50;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function trimStr(val: unknown, max: number): string | null {
  if (!val) return null;
  const s = String(val).trim();
  return s ? s.slice(0, max) : null;
}

async function requireAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  // Mirror the manual payout-document upload guard (defense in depth — the
  // route is also middleware-gated on the `closers` permission).
  if (!session.isSuper && !session.permissions.closers) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return { session, admin };
}

/**
 * Create a payout entry from a closed + DocuSeal-signed deal AND attach the
 * signed scope (from DocuSeal) + the deal invoice PDF as payout documents —
 * mirroring a manual entry + manual uploads. Missing docs are skipped with a
 * warning rather than blocking the import.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    const dealId = String(body.dealId ?? "");
    if (!UUID_RE.test(dealId)) {
      return NextResponse.json({ error: "Invalid dealId" }, { status: 400 });
    }

    const brandName = String(body.brandName ?? "").trim().slice(0, MAX_TEXT);
    if (!brandName) {
      return NextResponse.json(
        { error: "Brand name is required" },
        { status: 400 }
      );
    }

    // Re-validate eligibility server-side: closed deal + signed contract.
    const deal = await findDeal(dealId);
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }
    if (deal.status !== "closed") {
      return NextResponse.json(
        { error: "Deal is not closed" },
        { status: 400 }
      );
    }
    const contract = await findDealContractByDealId(dealId);
    if (!contract || contract.status !== "signed") {
      return NextResponse.json(
        { error: "Deal contract is not signed" },
        { status: 400 }
      );
    }

    // De-dupe: one payout per source deal.
    const importedIds = await getImportedDealIds();
    if (importedIds.has(dealId)) {
      return NextResponse.json(
        { error: "Deal already imported" },
        { status: 409 }
      );
    }

    // ── Validate payout fields (mirrors POST /api/admin/payouts) ──────────
    const now = new Date();
    const payoutMonth = Number(body.payoutMonth || now.getMonth() + 1);
    const payoutYear = Number(body.payoutYear || now.getFullYear());
    if (
      !Number.isInteger(payoutMonth) ||
      payoutMonth < 1 ||
      payoutMonth > 12 ||
      !Number.isInteger(payoutYear) ||
      payoutYear < 2000 ||
      payoutYear > 2100
    ) {
      return NextResponse.json(
        { error: "Invalid month or year" },
        { status: 400 }
      );
    }

    let amountDue = 0;
    if (body.amountDue !== undefined) {
      const ad = Number(body.amountDue);
      if (!Number.isFinite(ad) || ad < 0 || ad > 10_000_000) {
        return NextResponse.json({ error: "Invalid amount due" }, { status: 400 });
      }
      amountDue = Math.round(ad * 100);
    }

    let amountPaid = 0;
    if (body.amountPaid !== undefined) {
      const av = Number(body.amountPaid);
      if (!Number.isFinite(av) || av < 0 || av > 10_000_000) {
        return NextResponse.json({ error: "Invalid amount paid" }, { status: 400 });
      }
      amountPaid = Math.round(av * 100);
    }

    const validDistributed = ["Yes", "No", "Hold Til Full Pay"];
    const payDistributed =
      body.payDistributed && validDistributed.includes(body.payDistributed)
        ? (body.payDistributed as PayDistributed)
        : "No";

    const commissionSplit = Boolean(body.commissionSplit);
    let splitDetails: SplitParty[] = [];
    if (commissionSplit && Array.isArray(body.splitDetails)) {
      splitDetails = body.splitDetails
        .slice(0, 20)
        .filter((p: unknown) => p && typeof p === "object")
        .map((p: { name?: string; pct?: number }) => ({
          name: String(p.name ?? "").trim().slice(0, MAX_TEXT),
          pct: Number(p.pct ?? 0),
        }))
        .filter((p: SplitParty) => p.name);
      if (splitDetails.length < 2) {
        return NextResponse.json(
          { error: "Split requires at least 2 parties" },
          { status: 400 }
        );
      }
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const payout: PayoutRecord = {
      id,
      payoutMonth,
      payoutYear,
      dateJoined: trimStr(body.dateJoined, MAX_DATE),
      firstDayAdSpend: trimStr(body.firstDayAdSpend, MAX_DATE),
      brandName,
      vertical: trimStr(body.vertical, MAX_TEXT),
      pointOfContact: trimStr(body.pointOfContact, MAX_TEXT),
      service: trimStr(body.service, MAX_TEXT),
      isSigned: body.isSigned !== undefined ? Boolean(body.isSigned) : true,
      isPaid: Boolean(body.isPaid),
      addedToSlack: Boolean(body.addedToSlack),
      amountDue,
      amountPaid,
      paymentNotes: trimStr(body.paymentNotes, MAX_NOTES),
      salesRep: trimStr(body.salesRep, MAX_TEXT),
      payDistributed,
      payDistributedDate: trimStr(body.payDistributedDate, MAX_DATE),
      commissionSplit,
      splitDetails,
      referral: trimStr(body.referral, MAX_TEXT),
      referralPct:
        body.referralPct !== undefined && body.referralPct !== null
          ? Math.max(0, Math.min(100, Math.round(Number(body.referralPct))))
          : null,
      sourceDealId: dealId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await insertPayout(payout);
    } catch (err) {
      // Loses the read-then-insert race against a concurrent import — the
      // partial unique index on source_deal_id rejects the duplicate. Surface
      // the same 409 as the pre-check rather than a generic 500.
      const msg = err instanceof Error ? err.message : String(err);
      if (/unique constraint/i.test(msg)) {
        return NextResponse.json(
          { error: "Deal already imported" },
          { status: 409 }
        );
      }
      throw err;
    }

    // ── Attach documents (non-blocking; collect warnings) ─────────────────
    // A deal can carry MORE THAN ONE signed scope and invoice (primary +
    // additional contracts/invoices), so attach every one — mirroring how an
    // admin would upload each PDF manually.
    const warnings: string[] = [];
    const normalizedBrand = normalizeBrandName(brandName);

    const baseDoc = {
      normalizedBrand,
      brandName,
      payoutMonth,
      payoutYear,
      uploadedBy: auth.session.adminId,
    };

    // Insert one document, enforcing the same 10 MB ceiling as manual upload.
    // Returns false (skipped) when the PDF is too large so the caller can warn.
    const attach = async (
      docType: PayoutDocument["docType"],
      fileName: string,
      bytes: Buffer
    ): Promise<boolean> => {
      if (bytes.length > MAX_DOCUMENT_SIZE_BYTES) return false;
      const doc: PayoutDocument = {
        id: crypto.randomUUID(),
        ...baseDoc,
        docType,
        fileName,
        fileSize: bytes.length,
        createdAt: new Date().toISOString(),
      };
      await insertDocument(doc, bytes);
      return true;
    };

    // Signed scopes: primary (already validated signed) + signed additionals,
    // bounded so a deal with an unusual number of contracts can't fan out.
    const additionalContracts = await findAdditionalContractsByDealId(dealId);
    const signedAdditional = additionalContracts.filter((c) => c.status === "signed");
    const signedContracts = [contract, ...signedAdditional].slice(0, MAX_ATTACHED_DOCS);
    if (1 + signedAdditional.length > MAX_ATTACHED_DOCS) {
      warnings.push(`Only the first ${MAX_ATTACHED_DOCS} signed scopes were attached.`);
    }
    let scopeCount = 0;
    for (const c of signedContracts) {
      try {
        const bytes = await fetchSignedContractPdf(c);
        if (!bytes) {
          warnings.push("A signed scope PDF could not be retrieved from DocuSeal.");
          continue;
        }
        const n = scopeCount + 1;
        const suffix = n === 1 ? "" : ` ${n}`;
        const ok = await attach("project_scope", `${brandName} - Signed Scope${suffix}.pdf`, bytes);
        if (ok) scopeCount = n;
        else warnings.push("A signed scope PDF exceeded the 10 MB limit and was skipped.");
      } catch (err) {
        console.error("[payouts/from-deal] scope attach failed:", err);
        warnings.push("A signed scope PDF could not be attached.");
      }
    }

    // Invoices: primary + additional, every one that has a stored PDF (bounded).
    const primaryInvoice = await findDealInvoiceByDealId(dealId);
    const additionalInvoices = await findAdditionalInvoicesByDealId(dealId);
    const invoiceSources: { id: string; invoiceNumber: string; additional: boolean }[] = [
      ...(primaryInvoice?.hasPdf
        ? [{ id: primaryInvoice.id, invoiceNumber: primaryInvoice.invoiceNumber, additional: false }]
        : []),
      ...additionalInvoices
        .filter((i) => i.hasPdf)
        .map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, additional: true })),
    ];
    if (invoiceSources.length === 0) {
      warnings.push("No invoice PDF was found on this deal.");
    } else if (invoiceSources.length > MAX_ATTACHED_DOCS) {
      warnings.push(`Only the first ${MAX_ATTACHED_DOCS} invoices were attached.`);
    }
    for (const src of invoiceSources.slice(0, MAX_ATTACHED_DOCS)) {
      try {
        const pdf = src.additional
          ? await getAdditionalInvoicePdf(src.id)
          : await getDealInvoicePdf(src.id);
        if (!pdf) {
          warnings.push(`Invoice ${src.invoiceNumber} PDF could not be read.`);
          continue;
        }
        const ok = await attach("invoice", `${src.invoiceNumber}.pdf`, pdf);
        if (!ok) {
          warnings.push(`Invoice ${src.invoiceNumber} exceeded the 10 MB limit and was skipped.`);
        }
      } catch (err) {
        console.error("[payouts/from-deal] invoice attach failed:", err);
        warnings.push(`Invoice ${src.invoiceNumber} could not be attached.`);
      }
    }

    // Auto-fill the matched Client Directory client's roster profile
    // (website + services) from the deal — only fields that are still empty;
    // manual edits are never overwritten. Brand matching uses the imported
    // payout's brandName (the admin-entered one the directory will see), not
    // the deal's. Non-blocking: the payout is already inserted, so failures
    // surface as warnings (same contract as doc attach).
    try {
      const fill = await autofillClientProfileFromDeal({ ...deal, brandName });
      warnings.push(...fill.warnings);
    } catch (err) {
      console.error("[payouts/from-deal] profile auto-fill failed:", err);
      warnings.push("Client profile auto-fill failed.");
    }

    logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "payout.import_from_deal",
      targetType: "payout",
      targetId: id,
      details: JSON.stringify({ brandName, dealId, warnings }),
    }).catch(() => {});

    return NextResponse.json({ data: payout, warnings });
  } catch (err) {
    console.error("[admin/payouts/from-deal POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
