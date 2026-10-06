import { describe, it, expect } from "vitest";
import { matchCloserBySalesRep, type SalesRepCandidate } from "@/lib/salesRepMatch";

const c = (id: string, displayName: string, status = "active", role = "closer", slug?: string): SalesRepCandidate => ({
  id,
  displayName,
  slug: slug ?? displayName.toLowerCase().replace(/\s+/g, "-"),
  role,
  status,
});

// Mirrors the live roster shape: mostly inactive past closers, one active.
const roster: SalesRepCandidate[] = [
  c("angelina", "Angelina Ostap", "inactive"),
  c("gabriel", "Gabriel C"),
  c("matheus", "Matheus Franco", "inactive"),
  c("milosh", "Milosh Stupar", "inactive", "senior_closer"),
  c("peter", "Peter Borreggine", "inactive", "senior_closer"),
  c("konstantin", "Konstantin", "active", "setter"),
  { ...c("house", "House"), isSystem: true },
];

describe("matchCloserBySalesRep", () => {
  it("matches an active closer by full display name, case/space-insensitively", () => {
    expect(matchCloserBySalesRep("Gabriel C", roster)).toBe("gabriel");
    expect(matchCloserBySalesRep("  gabriel   c ", roster)).toBe("gabriel");
  });

  it("matches a bare first name and a slug", () => {
    expect(matchCloserBySalesRep("Gabriel", roster)).toBe("gabriel");
    expect(matchCloserBySalesRep("gabriel-c", roster)).toBe("gabriel");
  });

  it("never moves a deal to an inactive closer", () => {
    expect(matchCloserBySalesRep("Peter Borreggine", roster)).toBeNull();
    expect(matchCloserBySalesRep("Milosh", roster)).toBeNull();
  });

  it("an inactive closer's first name is not stolen by an active namesake", () => {
    const withNamesake = [...roster, c("peter2", "Peter Novak")];
    expect(matchCloserBySalesRep("Peter", withNamesake)).toBeNull();
    expect(matchCloserBySalesRep("Peter Novak", withNamesake)).toBe("peter2");
  });

  it("ignores split credits", () => {
    expect(matchCloserBySalesRep("Angelina / Milosh", roster)).toBeNull();
    expect(matchCloserBySalesRep("Gabriel C/Roxana", roster)).toBeNull();
    expect(matchCloserBySalesRep("Gabriel & Matt", roster)).toBeNull();
  });

  it("ignores markers, unknown names, setters, system rows and blanks", () => {
    for (const rep of ["REBILL", "Ad Account", "Samantha", "Tommy's Referral", "Konstantin", "House", "", "  ", null, undefined]) {
      expect(matchCloserBySalesRep(rep, roster)).toBeNull();
    }
  });

  it("an ambiguous first name matches nobody", () => {
    const twoGabriels = [...roster, c("gabriel2", "Gabriel Silva")];
    expect(matchCloserBySalesRep("Gabriel", twoGabriels)).toBeNull();
    expect(matchCloserBySalesRep("Gabriel C", twoGabriels)).toBe("gabriel");
  });
});
