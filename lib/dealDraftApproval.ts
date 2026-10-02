import { randomUUID } from "crypto";
import { findCloser } from "./closers";
import { findDealByCloserAndEvent, dealInsertParts, findDeal, type DealRecord } from "./deals";
import { setEventAttendance } from "./eventAttendance";
import { bestEffortPushAttendanceToGhl } from "./attendanceSync";
import { bestEffortSyncShowedDidntClose, bestEffortSyncActiveClient } from "./ghlCrmSync";
import { resolveSetterForEvent } from "./setterAttribution";
import { ensureDealPaperwork } from "./dealPaperwork";
import { findDealInvoiceByDealId, updateDealInvoice } from "./dealInvoices";
import { generateInvoiceFromDeal } from "./dealInvoiceGenerator";
import { applyInvoiceSpec } from "./invoice/invoiceSpec";
import type { InvoiceData } from "@/types/invoice";
import { approveDealDraftWithInsert, type DealDraft } from "./dealDrafts";
import type { DealDraftFields } from "./dealDraftFields";

export type DealDraftCheck = { ok: true } | { ok: false; status: number; error: string };

/** References a draft's fields point at must still exist / be free / fit their role. */
export async function checkDealDraftReferences(f: DealDraftFields): Promise<DealDraftCheck> {
  // Same bar as the closer portal: credit goes to an ACTIVE closer (not a
  // setter), and setter commission only to an actual setter.
  const closer = await findCloser(f.closerId);
  if (!closer) return { ok: false, status: 400, error: "Unknown closerId" };
  if (closer.role === "setter") return { ok: false, status: 400, error: "closerId is a setter — pick a closer" };
  if (closer.status !== "active") return { ok: false, status: 400, error: "That closer is inactive" };
  if (f.setterId) {
    const setter = await findCloser(f.setterId);
    if (!setter) return { ok: false, status: 400, error: "Unknown setterId" };
    if (setter.role !== "setter") return { ok: false, status: 400, error: "setterId is not a setter" };
  }
  // One deal per (closer, event) — same guard as the closer portal.
  if (f.googleEventId && (await findDealByCloserAndEvent(f.closerId, f.googleEventId))) {
    return { ok: false, status: 409, error: "This closer already has a deal linked to that calendar event" };
  }
  return { ok: true };
}

export type ApproveDealDraftResult =
  | { ok: true; deal: DealRecord; invoiceId: string | null; warnings: string[] }
  | { ok: false; status: number; error: string };

/**
 * Turn a pending draft into a real deal, exactly as if a closer had entered
 * it in the portal: setter attribution from the calendar claim, auto-show +
 * GHL attendance on a closed calendar-linked deal, and the invoice + contract
 * records (ensureDealPaperwork) — then the draft's proposed invoice changes
 * are applied to the generated invoice, which lands in the Deal queue as a
 * normal "Needs review" draft. Nothing is emailed: sending stays a separate,
 * deliberate step in the invoice drawer.
 */
export async function approveDealDraft(
  draft: DealDraft,
  actor: { id: string; name: string },
  note: string | null
): Promise<ApproveDealDraftResult> {
  if (draft.status !== "pending") return { ok: false, status: 409, error: `Draft is already ${draft.status}` };
  const f = draft.fields;

  const check = await checkDealDraftReferences(f);
  if (!check.ok) return check;

  // Setter credit: an explicit setter on the draft is a deliberate pick (pinned
  // like an admin edit); otherwise attribute the calendar claimer, if any —
  // at the tier THEY committed (only the setter's own pick counts), exactly
  // like the closer portal.
  let setterId = f.setterId;
  let setterTier = f.setterTier;
  const explicitSetter = !!f.setterId;
  if (!explicitSetter) {
    setterTier = null;
    if (f.googleEventId) {
      const resolved = await resolveSetterForEvent(f.googleEventId);
      if (resolved) {
        setterId = resolved.setterId;
        setterTier = resolved.tier;
      }
    }
  }

  const dealId = randomUUID();
  const closed = f.status === "closed";
  const now = new Date().toISOString();
  const record: DealRecord = {
    id: dealId,
    closerId: f.closerId,
    setterId,
    clientName: f.clientName,
    clientUserId: f.clientUserId,
    clientEmail: f.clientEmail,
    dealValue: f.dealValue,
    serviceCategory: f.serviceCategory,
    industry: f.industry,
    closingDate: f.closingDate,
    status: f.status,
    showStatus: closed && f.googleEventId ? "showed" : null,
    notes: f.notes,
    googleEventId: f.googleEventId,
    paymentType: f.paymentType,
    brandName: f.brandName,
    website: f.website,
    paidStatus: f.paidStatus,
    additionalCcEmails: f.additionalCcEmails,
    setterTier,
    noRetainer: f.noRetainer,
    setterOverride: explicitSetter,
    createdAt: now,
    updatedAt: now,
  };

  // Claim + insert commit together (or not at all), and only for the exact
  // version the reviewer approved — an agent edit since then → 409.
  let claimed: boolean;
  try {
    claimed = await approveDealDraftWithInsert(
      draft.id,
      { reviewedBy: actor.id, reviewedByName: actor.name, dealId, note, expectedUpdatedAt: draft.updatedAt },
      dealInsertParts(record)
    );
  } catch (err) {
    console.error("[approveDealDraft] approve/insert failed:", err instanceof Error ? err.message : err);
    return { ok: false, status: 500, error: "Failed to create the deal" };
  }
  if (!claimed) {
    return { ok: false, status: 409, error: "This draft was already reviewed or changed since you opened it — reload it" };
  }

  const warnings: string[] = [];

  // Paperwork + the proposed invoice first: they're what the reviewer acts on
  // next, and the GHL calls below can be slow (no fetch timeout) — a function
  // timeout there must not leave the deal without its invoice.
  // insertDeal may backfill closing_date — re-read so paperwork sees the row.
  const deal = (await findDeal(dealId).catch(() => null)) ?? record;
  await ensureDealPaperwork(deal, actor.id);

  let invoiceId: string | null = null;
  const invoice = await findDealInvoiceByDealId(dealId).catch(() => null);
  if (invoice) {
    invoiceId = invoice.id;
    if (draft.invoice) {
      try {
        const data = applyInvoiceSpec(invoice.invoiceData, draft.invoice);
        await updateDealInvoice(invoice.id, { invoiceData: JSON.stringify(data) });
      } catch (err) {
        console.error("[approveDealDraft] applying invoice spec failed:", err);
        warnings.push("The deal was created, but the proposed invoice lines couldn't be applied — review the invoice before sending.");
      }
    }
  } else if (closed && f.dealValue > 0) {
    warnings.push("The deal was created, but its invoice couldn't be generated. Re-save the deal as closed to retry.");
  } else if (draft.invoice) {
    warnings.push("Proposed invoice lines are only applied to closed deals — none was generated for this status.");
  }

  if (closed && f.googleEventId) {
    try {
      await setEventAttendance(f.googleEventId, f.closerId, "showed");
    } catch (err) {
      console.error("[approveDealDraft] attendance write failed:", err);
    }
    // Same GHL stage logic as the admin deal PATCH: a deal that's already paid
    // goes straight to "Active Client" — also running "Showed didn't close"
    // would race GHL into a duplicate opportunity.
    await Promise.allSettled([
      bestEffortPushAttendanceToGhl({ googleEventId: f.googleEventId, dashboardStatus: "showed" }),
      f.paidStatus === "paid"
        ? bestEffortSyncActiveClient({ googleEventId: f.googleEventId, leadName: f.clientName })
        : bestEffortSyncShowedDidntClose({ googleEventId: f.googleEventId, leadName: f.clientName }),
    ]);
  }

  return { ok: true, deal, invoiceId, warnings };
}

/**
 * The invoice approval would produce — the same generator the deal paperwork
 * uses, plus the draft's proposed changes — without creating anything. Null
 * when the draft's status wouldn't generate an invoice (not closed / no value).
 */
export async function buildDealDraftInvoicePreview(draft: DealDraft): Promise<InvoiceData | null> {
  const f = draft.fields;
  if (f.status !== "closed" || f.dealValue <= 0) return null;
  const now = new Date().toISOString();
  const dealLike: DealRecord = {
    id: draft.id,
    closerId: f.closerId,
    setterId: f.setterId,
    clientName: f.clientName,
    clientUserId: f.clientUserId,
    clientEmail: f.clientEmail,
    dealValue: f.dealValue,
    serviceCategory: f.serviceCategory,
    industry: f.industry,
    closingDate: f.closingDate,
    status: f.status,
    showStatus: null,
    notes: f.notes,
    googleEventId: f.googleEventId,
    paymentType: f.paymentType,
    brandName: f.brandName,
    website: f.website,
    paidStatus: f.paidStatus,
    additionalCcEmails: f.additionalCcEmails,
    setterTier: f.setterTier,
    noRetainer: f.noRetainer,
    setterOverride: false,
    createdAt: now,
    updatedAt: now,
  };
  const base = await generateInvoiceFromDeal(dealLike, f.clientEmail, "DRAFT");
  return draft.invoice ? applyInvoiceSpec(base, draft.invoice) : base;
}
