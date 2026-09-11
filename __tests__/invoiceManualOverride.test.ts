import { describe, it, expect } from "vitest";
import { parseManualInvoicePatch } from "@/lib/api/invoiceManualPatch";
import { manualUpdateConflict } from "@/lib/invoiceManualOverride";

describe("parseManualInvoicePatch", () => {
  it("accepts each override on its own", () => {
    expect(parseManualInvoicePatch({ status: "paid" })).toEqual({ ok: true, value: { status: "paid" } });
    expect(parseManualInvoicePatch({ resync: true })).toEqual({ ok: true, value: { resync: true } });
    expect(parseManualInvoicePatch({ cycleAnchor: "2026-10-15" })).toEqual({
      ok: true,
      value: { cycleAnchor: "2026-10-15" },
    });
    expect(parseManualInvoicePatch({ paidPayoutId: null })).toEqual({ ok: true, value: { paidPayoutId: null } });
  });

  it("rejects impossible dates, bad statuses and empty bodies", () => {
    expect(parseManualInvoicePatch({ cycleAnchor: "2026-02-30" }).ok).toBe(false);
    expect(parseManualInvoicePatch({ cycleAnchor: "15/10/2026" }).ok).toBe(false);
    expect(parseManualInvoicePatch({ status: "superseded" }).ok).toBe(false);
    expect(parseManualInvoicePatch({}).ok).toBe(false);
    expect(parseManualInvoicePatch(null).ok).toBe(false);
  });

  it("rejects resync combined with a manual status or payout link", () => {
    expect(parseManualInvoicePatch({ resync: true, status: "paid" }).ok).toBe(false);
    expect(parseManualInvoicePatch({ resync: true, paidPayoutId: "p1" }).ok).toBe(false);
  });

  it("rejects a payout link on a non-paid status set", () => {
    expect(parseManualInvoicePatch({ status: "unpaid", paidPayoutId: "p1" }).ok).toBe(false);
    expect(parseManualInvoicePatch({ status: "paid", paidPayoutId: "p1" }).ok).toBe(true);
  });

  it("trims and caps the note, null clears it", () => {
    const r = parseManualInvoicePatch({ note: "  late wire  " });
    expect(r.ok && r.value.note).toBe("late wire");
    const cleared = parseManualInvoicePatch({ note: "" });
    expect(cleared.ok && cleared.value.note).toBeNull();
  });
});

describe("manualUpdateConflict — current-status guard", () => {
  it("superseded rows can never change status or resync", () => {
    expect(manualUpdateConflict("superseded", { status: "sent" })).not.toBeNull();
    expect(manualUpdateConflict("superseded", { status: "paid" })).not.toBeNull();
    expect(manualUpdateConflict("superseded", { resync: true })).not.toBeNull();
    // A cycle/note-only edit is still fine.
    expect(manualUpdateConflict("superseded", {})).toBeNull();
  });

  it("a payout link without a status change requires a paid row", () => {
    const link = { id: "p1", month: 11, year: 2026 };
    expect(manualUpdateConflict("sent", { paidPayout: link })).not.toBeNull();
    expect(manualUpdateConflict("unpaid", { paidPayout: null })).not.toBeNull();
    expect(manualUpdateConflict("paid", { paidPayout: link })).toBeNull();
    expect(manualUpdateConflict("sent", { status: "paid", paidPayout: link })).toBeNull();
  });
});
