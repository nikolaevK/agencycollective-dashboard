import { describe, it, expect } from "vitest";
import {
  normalizeBrandName,
  brandsMatch,
  isAdAccountSalesRep,
} from "@/lib/payouts";

// The fuzzy brand key drives client↔payout matching across the whole
// directory; the Sales-Rep markers drive auto-`paid` promotion. A regression
// here silently breaks reconciliation (CLAUDE.md gotcha).

describe("normalizeBrandName", () => {
  it("collapses case, punctuation, and whitespace", () => {
    expect(normalizeBrandName("Acme  Labs")).toBe(normalizeBrandName("acme-labs!"));
  });

  it("strips business suffixes and a leading 'the'", () => {
    expect(normalizeBrandName("The Acme Labs LLC")).toBe(normalizeBrandName("Acme Labs"));
    expect(normalizeBrandName("Acme Labs Inc")).toBe(normalizeBrandName("acme labs"));
  });

  it("strips possessives and accents", () => {
    expect(normalizeBrandName("Renée's Café")).toBe("reneecafe");
  });

  it("keeps genuinely different brands apart", () => {
    expect(normalizeBrandName("Acme Labs")).not.toBe(normalizeBrandName("Zenith Media"));
  });
});

describe("brandsMatch", () => {
  it("matches identical normalized keys", () => {
    expect(brandsMatch("acmelabs", "acmelabs")).toBe(true);
  });

  it("matches substring-contained keys of 4+ chars", () => {
    expect(brandsMatch("acmelabs", "acme")).toBe(true);
    expect(brandsMatch("acme", "acmelabs")).toBe(true);
  });

  it("requires exact equality for very short keys", () => {
    expect(brandsMatch("abc", "abcdef")).toBe(false);
    expect(brandsMatch("abc", "abc")).toBe(true);
  });

  it("does not match unrelated brands", () => {
    expect(brandsMatch("acmelabs", "zenithmedia")).toBe(false);
  });
});

describe("isAdAccountSalesRep", () => {
  it("is a case-insensitive substring match on 'ad account'", () => {
    expect(isAdAccountSalesRep("Ad Account")).toBe(true);
    expect(isAdAccountSalesRep("AD ACCOUNT — July")).toBe(true);
    expect(isAdAccountSalesRep("john")).toBe(false);
    expect(isAdAccountSalesRep(null)).toBe(false);
  });
});
