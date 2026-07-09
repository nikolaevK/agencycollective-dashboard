export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Scope PDFs are fetched from DocuSeal (fresh-URL-first) — can take a while
// under their rate limits; the payout row itself is inserted up front.
export const maxDuration = 30;

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import {
  insertPayout,
  getImportedDealIds,
  normalizeBrandName,
  type PayoutRecord,
} from "@/lib/payouts";
import { findDeal } from "@/lib/deals";
import { findDealContractByDealId } from "@/lib/dealContracts";
import { findAdditionalContractsByDealId } from "@/lib/dealAdditionalContracts";
import { findDealInvoiceByDealId, getDealInvoicePdf } from "@/lib/dealInvoices";
import {
  findAdditionalInvoicesByDealId,
  getAdditionalInvoicePdf,
} from "@/lib/dealAdditionalInvoices";
import { fetchSignedContractPdf } from "@/lib/docuseal/signedDocument";
import { insertDocument, MAX_DOCUMENT_SIZE_BYTES } from "@/lib/payoutDocuments";
import type { PayoutDocument } from "@/lib/payoutDocuments";
import { autofillClientProfileFromDeal } from "@/lib/clientProfile";
import { parsePayoutFields } from "@/lib/api/payoutInput";
import { logAuditEvent } from "@/lib/auditLog";

const MAX_ATTACHED_DOCS = 50;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Create a payout from a closed deal (signed contract or marked paid) and
 * attach every signed scope + stored invoice PDF as payout documents —
 * mirroring /api/admin/payouts/from-deal. One payout per deal (partial
 * unique index backstop → 409). Doc attach is non-blocking: failures land
 * in `warnings[]`, never block the insert. Amounts are integer CENTS.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const dealId = String(body.dealId ?? "");
    if (!UUID_RE.test(dealId)) {
      return fail("invalid_request", "Invalid dealId", 400);
    }

    const parsed = parsePayoutFields(body);
    if ("error" in parsed && parsed.error) return fail("invalid_request", parsed.error, 400);
    const fields = "changes" in parsed ? parsed.changes : {};

    const brandName = fields.brandName;
    if (!brandName) return fail("invalid_request", "brandName is required", 400);

    // Re-validate eligibility server-side (mirrors the dashboard route).
    const deal = await findDeal(dealId);
    if (!deal) return fail("not_found", "Deal not found", 404);
    if (!tokenHasResource(auth.token, "closer", deal.closerId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }
    if (deal.status !== "closed") {
      return fail("invalid_request", "Deal is not closed", 400);
    }
    const contract = await findDealContractByDealId(dealId);
    const contractSigned = contract?.status === "signed";
    if (!contractSigned && deal.paidStatus !== "paid") {
      return fail(
        "invalid_request",
        "Deal contract is not signed and the deal is not marked paid",
        400
      );
    }

    const importedIds = await getImportedDealIds();
    if (importedIds.has(dealId)) {
      return fail("conflict", "Deal already imported", 409);
    }

    const actor = tokenAuditActor(auth.token);
    const now = new Date();
    const nowIso = now.toISOString();
    const id = crypto.randomUUID();
    const payoutMonth = fields.payoutMonth ?? now.getMonth() + 1;
    const payoutYear = fields.payoutYear ?? now.getFullYear();
    const payout: PayoutRecord = {
      id,
      payoutMonth,
      payoutYear,
      dateJoined: fields.dateJoined ?? null,
      firstDayAdSpend: fields.firstDayAdSpend ?? null,
      brandName,
      vertical: fields.vertical ?? null,
      pointOfContact: fields.pointOfContact ?? null,
      service: fields.service ?? null,
      isSigned: fields.isSigned ?? true,
      isPaid: fields.isPaid ?? false,
      addedToSlack: fields.addedToSlack ?? false,
      amountDue: fields.amountDue ?? 0,
      amountPaid: fields.amountPaid ?? 0,
      paymentNotes: fields.paymentNotes ?? null,
      salesRep: fields.salesRep ?? null,
      payDistributed: fields.payDistributed ?? "No",
      payDistributedDate: fields.payDistributedDate ?? null,
      commissionSplit: fields.commissionSplit ?? false,
      splitDetails: fields.splitDetails ?? [],
      referral: fields.referral ?? null,
      referralPct: fields.referralPct ?? null,
      sourceDealId: dealId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await insertPayout(payout);
    } catch (err) {
      // Read-then-insert race: the partial unique index on source_deal_id
      // rejects the duplicate — surface the same 409 as the pre-check.
      const msg = err instanceof Error ? err.message : String(err);
      if (/unique constraint/i.test(msg)) {
        return fail("conflict", "Deal already imported", 409);
      }
      throw err;
    }

    // ── Attach documents (non-blocking; collect warnings) ─────────────────
    const warnings: string[] = [];
    const normalizedBrand = normalizeBrandName(brandName);
    const baseDoc = {
      normalizedBrand,
      brandName,
      payoutMonth,
      payoutYear,
      uploadedBy: actor.adminId,
    };
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

    const additionalContracts = await findAdditionalContractsByDealId(dealId);
    const signedAdditional = additionalContracts.filter((c) => c.status === "signed");
    const signedPrimary = contractSigned && contract ? [contract] : [];
    const signedContracts = [...signedPrimary, ...signedAdditional].slice(0, MAX_ATTACHED_DOCS);
    if (signedPrimary.length + signedAdditional.length > MAX_ATTACHED_DOCS) {
      warnings.push(`Only the first ${MAX_ATTACHED_DOCS} signed scopes were attached.`);
    } else if (signedContracts.length === 0) {
      warnings.push("No signed scope was found on this deal.");
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
        const attached = await attach(
          "project_scope",
          `${brandName} - Signed Scope${suffix}.pdf`,
          bytes
        );
        if (attached) scopeCount = n;
        else warnings.push("A signed scope PDF exceeded the 10 MB limit and was skipped.");
      } catch (err) {
        console.error("[v1 payouts/import-from-deal] scope attach failed:", err);
        warnings.push("A signed scope PDF could not be attached.");
      }
    }

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
        const attached = await attach("invoice", `${src.invoiceNumber}.pdf`, pdf);
        if (!attached) {
          warnings.push(`Invoice ${src.invoiceNumber} exceeded the 10 MB limit and was skipped.`);
        }
      } catch (err) {
        console.error("[v1 payouts/import-from-deal] invoice attach failed:", err);
        warnings.push(`Invoice ${src.invoiceNumber} could not be attached.`);
      }
    }

    // Fill-only-when-empty roster auto-fill, same contract as doc attach.
    try {
      const fill = await autofillClientProfileFromDeal({ ...deal, brandName });
      warnings.push(...fill.warnings);
    } catch (err) {
      console.error("[v1 payouts/import-from-deal] profile auto-fill failed:", err);
      warnings.push("Client profile auto-fill failed.");
    }

    logAuditEvent({
      ...actor,
      action: "payout.import_from_deal",
      targetType: "payout",
      targetId: id,
      details: JSON.stringify({ brandName, dealId, warnings }),
    }).catch(() => {});

    return ok(payout, { warnings }, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/closer/payouts/import-from-deal error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
