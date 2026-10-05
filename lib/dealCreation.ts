import { randomUUID } from "crypto";
import { findDeal, insertDeal, type DealRecord } from "./deals";
import { setEventAttendance } from "./eventAttendance";
import { bestEffortPushAttendanceToGhl } from "./attendanceSync";
import { bestEffortSyncShowedDidntClose, bestEffortSyncActiveClient } from "./ghlCrmSync";
import { resolveSetterForEvent } from "./setterAttribution";
import { ensureDealPaperwork } from "./dealPaperwork";
import { findDealInvoiceByDealId, updateDealInvoice } from "./dealInvoices";
import { applyInvoiceSpec, type InvoiceSpec } from "./invoice/invoiceSpec";
import type { DealDraftFields } from "./dealDraftFields";

// ---------------------------------------------------------------------------
// Dashboard-side deal creation — the closer-portal semantics (setter credit,
// paperwork, attendance + GHL) for deals created by a PERSON in the admin
// dashboard: agent drafts on approval (lib/dealDraftApproval.ts) and deals an
// admin enters directly from the Deal queue (createAdminDeal below). One
// implementation, so the two paths can't drift apart.
// ---------------------------------------------------------------------------

/**
 * The record a set of validated deal fields becomes. Setter credit: an
 * explicit setter is a deliberate pick (pinned like an admin edit); otherwise
 * the calendar claimer, at the tier THEY committed — exactly like the portal.
 */
export async function buildDealRecord(
  f: DealDraftFields,
  opts: { createdByAdminId?: string | null } = {}
): Promise<DealRecord> {
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

  const closed = f.status === "closed";
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
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
    createdByAdminId: opts.createdByAdminId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface CreatedDeal {
  deal: DealRecord;
  invoiceId: string | null;
  warnings: string[];
}

/**
 * Everything after the deal row exists: the invoice + contract records
 * (ensureDealPaperwork) with an optional proposed invoice spec applied, then
 * auto-show + GHL attendance/CRM for a closed calendar-linked deal. Paperwork
 * runs FIRST — it's what the admin acts on next, and the GHL calls can be slow
 * (no fetch timeout), so a function timeout there must not leave the deal
 * without its invoice. Nothing is emailed.
 */
export async function finishDealCreation(
  record: DealRecord,
  opts: { actorId: string; invoiceSpec: InvoiceSpec | null }
): Promise<CreatedDeal> {
  const warnings: string[] = [];
  const closed = record.status === "closed";

  // insertDeal may backfill closing_date — re-read so paperwork sees the row.
  const deal = (await findDeal(record.id).catch(() => null)) ?? record;
  await ensureDealPaperwork(deal, opts.actorId);

  let invoiceId: string | null = null;
  const invoice = await findDealInvoiceByDealId(deal.id).catch(() => null);
  if (invoice) {
    invoiceId = invoice.id;
    if (opts.invoiceSpec) {
      try {
        const data = applyInvoiceSpec(invoice.invoiceData, opts.invoiceSpec);
        await updateDealInvoice(invoice.id, { invoiceData: JSON.stringify(data) });
      } catch (err) {
        console.error("[finishDealCreation] applying invoice spec failed:", err);
        warnings.push("The deal was created, but the proposed invoice lines couldn't be applied — review the invoice before sending.");
      }
    }
  } else if (closed && deal.dealValue > 0) {
    warnings.push("The deal was created, but its invoice couldn't be generated. Re-save the deal as closed to retry.");
  } else if (opts.invoiceSpec) {
    warnings.push("Proposed invoice lines are only applied to closed deals — none was generated for this status.");
  }

  if (closed && deal.googleEventId) {
    try {
      await setEventAttendance(deal.googleEventId, deal.closerId, "showed");
    } catch (err) {
      console.error("[finishDealCreation] attendance write failed:", err);
    }
    // Same GHL stage logic as the admin deal PATCH: a deal that's already paid
    // goes straight to "Active Client" — also running "Showed didn't close"
    // would race GHL into a duplicate opportunity.
    await Promise.allSettled([
      bestEffortPushAttendanceToGhl({ googleEventId: deal.googleEventId, dashboardStatus: "showed" }),
      deal.paidStatus === "paid"
        ? bestEffortSyncActiveClient({ googleEventId: deal.googleEventId, leadName: deal.clientName })
        : bestEffortSyncShowedDidntClose({ googleEventId: deal.googleEventId, leadName: deal.clientName }),
    ]);
  }

  return { deal, invoiceId, warnings };
}

/**
 * A deal an admin enters directly from the Deal queue — credited to the
 * closer they pick (or the House closer). Callers validate the fields
 * (parseDealDraftFields) and the references (checkDealDraftReferences) first.
 */
export async function createAdminDeal(
  f: DealDraftFields,
  actor: { id: string }
): Promise<CreatedDeal> {
  const record = await buildDealRecord(f, { createdByAdminId: actor.id });
  await insertDeal(record);
  return finishDealCreation(record, { actorId: actor.id, invoiceSpec: null });
}
