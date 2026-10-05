import { describe, expect, it } from "vitest";
import { dealInsertParts, type DealRecord } from "@/lib/deals";
import { slugify } from "@/lib/users";

function deal(overrides: Partial<DealRecord> = {}): DealRecord {
  return {
    id: "d1",
    closerId: "c1",
    setterId: null,
    clientName: "Acme",
    clientUserId: null,
    clientEmail: null,
    dealValue: 100_00,
    serviceCategory: null,
    industry: null,
    closingDate: "2026-10-05",
    status: "closed",
    showStatus: null,
    notes: null,
    googleEventId: null,
    paymentType: "local",
    brandName: null,
    website: null,
    paidStatus: "unpaid",
    additionalCcEmails: [],
    setterTier: null,
    noRetainer: false,
    setterOverride: false,
    createdAt: "2026-10-05T00:00:00.000Z",
    updatedAt: "2026-10-05T00:00:00.000Z",
    ...overrides,
  };
}

const columnsOf = (parts: { columns: string }) => parts.columns.split(",").map((c) => c.trim());

describe("dealInsertParts — admin provenance", () => {
  it("omits created_by_admin_id for portal / draft / API deals", () => {
    const parts = dealInsertParts(deal());
    expect(columnsOf(parts)).not.toContain("created_by_admin_id");
    expect(parts.args).toHaveLength(columnsOf(parts).length);
  });

  it("writes created_by_admin_id only for admin-entered deals", () => {
    const parts = dealInsertParts(deal({ createdByAdminId: "admin-1" }));
    const cols = columnsOf(parts);
    expect(cols[cols.length - 1]).toBe("created_by_admin_id");
    expect(parts.args).toHaveLength(cols.length);
    expect(parts.args[parts.args.length - 1]).toBe("admin-1");
  });
});

describe("House closer slug", () => {
  // The House row's slug contains underscores; slugify never emits one, so no
  // generated closer slug can ever collide with it (slug is UNIQUE).
  it("slugify never produces an underscore", () => {
    for (const name of ["__system_house__", "System House", "house_closer", "A_B C"]) {
      expect(slugify(name)).not.toContain("_");
    }
  });
});
