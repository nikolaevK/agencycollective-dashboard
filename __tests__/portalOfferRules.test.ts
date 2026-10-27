import { describe, expect, it } from "vitest";
import {
  DEFAULT_OFFER_ACCENT,
  DEFAULT_OFFER_PAGE,
  HIDEABLE_OFFER_PAGE_FIELDS,
  OFFER_PAGE_LIMITS,
  ctaLabelOf,
  detectOfferImageType,
  isPlainEmail,
  offerLifecycle,
  resolveOfferPage,
  normalizeOfferFields,
  normalizeOfferPage,
  normalizeOfferRequest,
  offerPublishError,
  offerSlugBase,
  validateOfferPagePatch,
  withService,
} from "@/lib/portalOfferRules";
import { isPublicAddress } from "@/lib/publicImageFetch";

describe("offerSlugBase", () => {
  it("slugifies titles and never returns empty", () => {
    expect(offerSlugBase("Peptide Website & CRM")).toBe("peptide-website-crm");
    expect(offerSlugBase("  3PL Select ")).toBe("3pl-select");
    expect(offerSlugBase("Café Ads")).toBe("cafe-ads");
    expect(offerSlugBase("!!!")).toBe("service");
  });

  it("caps length without a trailing dash", () => {
    const s = offerSlugBase("a".repeat(59) + " b");
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("normalizeOfferFields", () => {
  it("fills defaults on create and requires a title", () => {
    expect(normalizeOfferFields({}, false)).toEqual({ ok: false, error: "Title is required" });
    const r = normalizeOfferFields({ title: "  SuppAds " }, false);
    expect(r.ok && r.value).toMatchObject({
      title: "SuppAds",
      tagline: "",
      ctaType: "request_info",
      ctaUrl: null,
      accent: DEFAULT_OFFER_ACCENT,
      featured: false,
      active: false,
      highlights: [],
      badge: null,
      links: [],
    });
  });

  it("only returns the fields sent on a partial update", () => {
    const r = normalizeOfferFields({ active: true }, true);
    expect(r).toEqual({ ok: true, value: { active: true } });
  });

  it("rejects a non-https booking link and a bad color", () => {
    expect(normalizeOfferFields({ ctaUrl: "http://cal.com/x" }, true)).toEqual({
      ok: false,
      error: "Booking link must be an https:// URL",
    });
    expect(normalizeOfferFields({ ctaUrl: "javascript:alert(1)" }, true).ok).toBe(false);
    expect(normalizeOfferFields({ ctaUrl: "" }, true)).toEqual({ ok: true, value: { ctaUrl: null } });
    expect(normalizeOfferFields({ accent: "red" }, true).ok).toBe(false);
    expect(normalizeOfferFields({ accent: "#ABCDEF" }, true)).toEqual({ ok: true, value: { accent: "#abcdef" } });
  });

  it("rejects an unknown button type", () => {
    expect(normalizeOfferFields({ ctaType: "external_link" }, true).ok).toBe(false);
  });

  it("cleans proof points: drops empty lines, blank stat = null", () => {
    const r = normalizeOfferFields(
      {
        highlights: [
          { stat: "$40M+", text: "ad spend managed" },
          { stat: "", text: "Dedicated strategist" },
          { stat: "9x", text: "   " },
          "junk",
        ],
      },
      true
    );
    expect(r).toEqual({
      ok: true,
      value: {
        highlights: [
          { stat: "$40M+", text: "ad spend managed" },
          { stat: null, text: "Dedicated strategist" },
        ],
      },
    });
  });

  it("rejects too much instead of silently cutting it", () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({ text: `point ${i}` }));
    expect(normalizeOfferFields({ highlights: seven }, true)).toEqual({ ok: false, error: "At most 6 proof points" });
    expect(normalizeOfferFields({ title: "x".repeat(81) }, true)).toEqual({
      ok: false,
      error: "Title is too long (81 characters, max 80)",
    });
    expect(normalizeOfferFields({ body: "x".repeat(8001) }, true).ok).toBe(false);
    expect(normalizeOfferFields({ highlights: [{ stat: "x".repeat(25), text: "ok" }] }, true).ok).toBe(false);
    expect(normalizeOfferFields({ body: "x".repeat(8000) }, true).ok).toBe(true);
  });
});

describe("offerPublishError", () => {
  it("blocks a live Book a call without a link, allows a hidden draft", () => {
    expect(offerPublishError({ active: true, ctaType: "book_call", ctaUrl: null })).toMatch(/booking link/);
    expect(offerPublishError({ active: false, ctaType: "book_call", ctaUrl: null })).toBeNull();
    expect(offerPublishError({ active: true, ctaType: "book_call", ctaUrl: "https://x.com" })).toBeNull();
    expect(offerPublishError({ active: true, ctaType: "request_info", ctaUrl: null })).toBeNull();
  });
});

describe("ctaLabelOf", () => {
  it("uses the custom label, else the type's default", () => {
    expect(ctaLabelOf({ ctaType: "book_call", ctaLabel: null })).toBe("Book a call");
    expect(ctaLabelOf({ ctaType: "request_info", ctaLabel: "" })).toBe("Request info");
    expect(ctaLabelOf({ ctaType: "request_info", ctaLabel: "Get a quote" })).toBe("Get a quote");
  });
});

describe("normalizeOfferRequest", () => {
  it("falls back to the email on file; contact details are optional", () => {
    expect(normalizeOfferRequest({}, "a@b.co")).toEqual({
      ok: true,
      value: { contactEmail: "a@b.co", contactPhone: null, message: null },
    });
    expect(normalizeOfferRequest(null, null)).toEqual({
      ok: true,
      value: { contactEmail: null, contactPhone: null, message: null },
    });
  });

  it("validates a typed email and trims the rest", () => {
    expect(normalizeOfferRequest({ contactEmail: "nope" }, "a@b.co").ok).toBe(false);
    expect(
      normalizeOfferRequest({ contactEmail: " x@y.io ", contactPhone: " +1 555 ", message: "  hi " }, null)
    ).toEqual({ ok: true, value: { contactEmail: "x@y.io", contactPhone: "+1 555", message: "hi" } });
  });

  it("ignores a malformed email on file instead of failing the request", () => {
    expect(normalizeOfferRequest({}, "owner@x.co;ops@x.co")).toEqual({
      ok: true,
      value: { contactEmail: null, contactPhone: null, message: null },
    });
  });

  it("rejects mailto tricks in a typed email", () => {
    expect(normalizeOfferRequest({ contactEmail: "a@b.co?cc=x%40evil.com&body=hi" }, null).ok).toBe(false);
    expect(isPlainEmail("a@b.co?cc=x@evil.com")).toBe(false);
    expect(isPlainEmail("first.last+tag@sub.example.co")).toBe(true);
  });

  it("caps the message length", () => {
    const r = normalizeOfferRequest({ message: "x".repeat(5000) }, null);
    expect(r.ok && r.value.message?.length).toBe(2000);
  });
});

describe("normalizeOfferFields — badge + links", () => {
  it("trims the badge, blank = none", () => {
    expect(normalizeOfferFields({ badge: "  New " }, true)).toEqual({ ok: true, value: { badge: "New" } });
    expect(normalizeOfferFields({ badge: "" }, true)).toEqual({ ok: true, value: { badge: null } });
  });

  it("keeps https links with labels, drops empty rows, allows at most four", () => {
    const r = normalizeOfferFields(
      { links: [{ label: "Website", url: " https://suppads.com " }, { label: "", url: "" }] },
      true
    );
    expect(r).toEqual({ ok: true, value: { links: [{ label: "Website", url: "https://suppads.com/" }] } });
    const five = Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, url: `https://x.com/${i}` }));
    expect(normalizeOfferFields({ links: five }, true)).toEqual({ ok: false, error: "At most 4 links" });
  });

  it("rejects a non-https link or a link without a label", () => {
    expect(normalizeOfferFields({ links: [{ label: "Site", url: "http://x.com" }] }, true).ok).toBe(false);
    expect(normalizeOfferFields({ links: [{ label: "Site", url: "javascript:alert(1)" }] }, true).ok).toBe(false);
    expect(normalizeOfferFields({ links: [{ label: "", url: "https://x.com" }] }, true)).toEqual({
      ok: false,
      error: "Give the link https://x.com/ a label",
    });
  });
});

describe("normalizeOfferPage", () => {
  it("keeps only real overrides: blank, missing, default-equal and unknown fields are dropped", () => {
    expect(normalizeOfferPage(null)).toEqual({ ok: true, value: {} });
    const r = normalizeOfferPage({
      heroTitle: "  Grow with us ",
      navLabel: "",
      featuredLabel: DEFAULT_OFFER_PAGE.featuredLabel,
      heroBase: "#123456", // a retired setting still in an old stored value
      junk: "x",
    });
    expect(r).toEqual({ ok: true, value: { heroTitle: "Grow with us" } });
  });

  it("caps text lengths", () => {
    const r = normalizeOfferPage({ navLabel: "x".repeat(100) });
    expect(r.ok && r.value.navLabel?.length).toBe(40);
  });

  it("resolves overrides over the defaults", () => {
    const page = resolveOfferPage({ heroTitle: "Grow with us" });
    expect(page.heroTitle).toBe("Grow with us");
    expect(page.navLabel).toBe(DEFAULT_OFFER_PAGE.navLabel);
  });

  it("hides optional elements with null (and survives storage), ignores null elsewhere", () => {
    const r = normalizeOfferPage({ heroEyebrow: null, ctaFootnote: null, navLabel: null, heroSubtitle: "   " });
    expect(r).toEqual({ ok: true, value: { heroEyebrow: null, ctaFootnote: null } });
    const stored = r.ok ? r.value : {};
    expect(normalizeOfferPage(JSON.parse(JSON.stringify(stored)))).toEqual({ ok: true, value: stored });
    const page = resolveOfferPage(stored);
    expect(page.heroEyebrow).toBe("");
    expect(page.ctaFootnote).toBe("");
    expect(page.navLabel).toBe(DEFAULT_OFFER_PAGE.navLabel);
    expect(page.heroSubtitle).toBe(DEFAULT_OFFER_PAGE.heroSubtitle);
  });

  it("only offers Hide for elements the pages can render empty", () => {
    expect(HIDEABLE_OFFER_PAGE_FIELDS).not.toContain("navLabel");
    expect(HIDEABLE_OFFER_PAGE_FIELDS).not.toContain("heroTitle");
    for (const key of HIDEABLE_OFFER_PAGE_FIELDS) expect(OFFER_PAGE_LIMITS[key]).toBeGreaterThan(0);
  });
});

describe("withService", () => {
  it("fills every {service}", () => {
    expect(withService("Talk to us about {service} — {service}", "SuppAds")).toBe("Talk to us about SuppAds — SuppAds");
    expect(withService("No placeholder", "SuppAds")).toBe("No placeholder");
  });
});

describe("validateOfferPagePatch (API merge write)", () => {
  it("accepts text, \"\" (back to default) and null on hideable fields", () => {
    expect(validateOfferPagePatch({ heroTitle: "Grow", navLabel: "", ctaFootnote: null })).toEqual({
      ok: true,
      value: { heroTitle: "Grow", navLabel: "", ctaFootnote: null },
    });
  });

  it("rejects unknown fields, null on required text, wrong types and over-long text", () => {
    expect(validateOfferPagePatch({ heroColor: "#fff" })).toEqual({ ok: false, error: 'Unknown page field "heroColor"' });
    expect(validateOfferPagePatch({ navLabel: null }).ok).toBe(false);
    expect(validateOfferPagePatch({ heroTitle: 3 }).ok).toBe(false);
    expect(validateOfferPagePatch({ navLabel: "x".repeat(41) }).ok).toBe(false);
    expect(validateOfferPagePatch([]).ok).toBe(false);
  });
});

describe("offerLifecycle", () => {
  it("live / draft (never published) / retired (published before)", () => {
    expect(offerLifecycle({ active: true, publishedAt: "2026-10-01 00:00:00" })).toBe("live");
    expect(offerLifecycle({ active: false, publishedAt: null })).toBe("draft");
    expect(offerLifecycle({ active: false, publishedAt: "2026-10-01 00:00:00" })).toBe("retired");
  });
});

describe("detectOfferImageType", () => {
  it("types images by their bytes, never by name", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectOfferImageType(png)).toBe("image/png");
    expect(detectOfferImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(detectOfferImageType(new TextEncoder().encode("<!doctype html><html>"))).toBeNull();
  });
});

describe("isPublicAddress (imageUrl SSRF guard)", () => {
  it("blocks private, loopback, link-local/metadata, CGNAT and mapped addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["93.184.216.34", "172.32.0.1", "2606:4700::6810:84e5", "::ffff:8.8.8.8"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });
});
