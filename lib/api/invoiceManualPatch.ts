import type { ManualInvoiceStatus } from "@/lib/invoiceManualOverride";

/**
 * Parsed body of the manual invoice-override PATCH routes (client re-bill +
 * ad-account invoices share it):
 *
 *   { status?: "sent"|"paid"|"unpaid",   // set by hand (locks the row)
 *     cycleAnchor?: "yyyy-mm-dd",        // re-anchor to another billing cycle
 *     paidPayoutId?: string | null,      // link/unlink a payouts.id (paid only)
 *     note?: string | null,
 *     resync?: true }                    // hand the row back to automation
 */
export interface ManualInvoicePatchBody {
  status?: ManualInvoiceStatus;
  cycleAnchor?: string;
  paidPayoutId?: string | null;
  note?: string | null;
  resync?: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseManualInvoicePatch(
  raw: unknown
): { ok: true; value: ManualInvoicePatchBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object")
    return { ok: false, error: "Invalid JSON body" };
  const body = raw as Record<string, unknown>;
  const out: ManualInvoicePatchBody = {};

  if (body.resync !== undefined) {
    if (body.resync !== true && body.resync !== false)
      return { ok: false, error: "resync must be a boolean" };
    out.resync = body.resync;
  }

  if (body.status !== undefined) {
    if (body.status !== "sent" && body.status !== "paid" && body.status !== "unpaid")
      return { ok: false, error: "status must be sent | paid | unpaid" };
    out.status = body.status;
  }

  if (body.cycleAnchor !== undefined) {
    const v = typeof body.cycleAnchor === "string" ? body.cycleAnchor.trim() : "";
    if (!DATE_RE.test(v))
      return { ok: false, error: "cycleAnchor must be yyyy-mm-dd" };
    const probe = new Date(`${v}T00:00:00Z`);
    if (isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== v)
      return { ok: false, error: "cycleAnchor is not a real calendar date" };
    out.cycleAnchor = v;
  }

  if (body.paidPayoutId !== undefined) {
    if (body.paidPayoutId === null) out.paidPayoutId = null;
    else if (typeof body.paidPayoutId === "string" && body.paidPayoutId.trim())
      out.paidPayoutId = body.paidPayoutId.trim().slice(0, 100);
    else return { ok: false, error: "paidPayoutId must be a string or null" };
  }

  if (body.note !== undefined) {
    if (body.note === null) out.note = null;
    else if (typeof body.note === "string") {
      const t = body.note.trim();
      out.note = t ? t.slice(0, 500) : null;
    } else return { ok: false, error: "note must be a string or null" };
  }

  if (out.resync && (out.status !== undefined || out.paidPayoutId !== undefined))
    return { ok: false, error: "resync cannot be combined with status/paidPayoutId" };
  if (out.paidPayoutId && out.status !== undefined && out.status !== "paid")
    return { ok: false, error: "paidPayoutId only applies to a paid invoice" };
  if (
    out.status === undefined &&
    out.cycleAnchor === undefined &&
    out.paidPayoutId === undefined &&
    out.note === undefined &&
    !out.resync
  )
    return { ok: false, error: "Nothing to update" };

  return { ok: true, value: out };
}
