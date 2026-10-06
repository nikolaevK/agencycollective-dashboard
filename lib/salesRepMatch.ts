// Pure (no db imports) — resolves a payout's free-text Sales Rep to the closer
// it names, for lib/dealCloserReassign.ts. Unit-tested in __tests__/.

export interface SalesRepCandidate {
  id: string;
  displayName: string;
  slug: string;
  role: string;
  status: string;
  isSystem?: boolean;
}

/** Split credits ("Angelina / Milosh", "Milosh/Roxana") are handled by the
 *  payout's commission split, never by moving the deal. */
const SPLIT_RE = /[/&+,]|\band\b/i;

function norm(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The closer id a Sales Rep value names, or null. Matching is tiered —
 * full display name, then slug, then a bare first name ("Milosh" → "Milosh
 * Stupar") — and a tier with more than one hit stops (ambiguous, never
 * guess). Matching runs over every closer PERSON (setters + system rows
 * excluded) so an inactive closer still claims their own name; the single
 * match must then be active to receive the deal.
 */
export function matchCloserBySalesRep(
  salesRep: string | null | undefined,
  closers: SalesRepCandidate[]
): string | null {
  if (!salesRep) return null;
  const rep = norm(salesRep);
  if (!rep || SPLIT_RE.test(rep)) return null;

  const people = closers.filter((c) => !c.isSystem && c.role !== "setter");
  const tiers: ((c: SalesRepCandidate) => boolean)[] = [
    (c) => norm(c.displayName) === rep,
    (c) => c.slug.toLowerCase() === rep.replace(/ /g, "-"),
    (c) => !rep.includes(" ") && norm(c.displayName).split(" ")[0] === rep,
  ];
  for (const tier of tiers) {
    const hits = people.filter(tier);
    if (hits.length > 1) return null;
    if (hits.length === 1) return hits[0].status === "active" ? hits[0].id : null;
  }
  return null;
}
