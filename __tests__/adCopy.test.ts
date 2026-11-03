import { describe, it, expect } from "vitest";
import { charCount, displayDomain, fitsByPlacement, tightestLimit, truncateForFeed } from "@/lib/adCopy/limits";
import { DEFAULT_SETTINGS, cleanText, industryLabel, normalizeSettings } from "@/lib/adCopy/settings";
import { AD_COPY_SYSTEM_PROMPT, END_OF_MATERIAL, campaignContextText, creativeText, taskText } from "@/lib/adCopy/prompt";
import { AD_COPY_JSON_SCHEMA, parseAdCopy, stripMarkdown } from "@/lib/adCopy/schema";
import { normalizeAdCopy } from "@/lib/adCopy/normalize";
import { parsePartialJson } from "@/lib/adCopy/partialJson";
import { createNdjsonDecoder, encodeEvent } from "@/lib/adCopy/ndjson";
import { base64DecodedBytes, base64Head, fitWithin, isBase64, isMetaImageUrl, sniffImageType } from "@/lib/adCopy/images";
import {
  adsManagerUrl,
  buildAdBody,
  buildCreativeBody,
  classifyMetaWriteFailure,
  STAGE_IN_FLIGHT_MS,
  creativeSignature,
  decideAttempt,
  draftFingerprint,
  draftSignature,
  idempotencyKeyFor,
  normalizeWebsiteUrl,
  resumeFor,
  uploadFilename,
  validateDraftInput,
  type DraftAttempt,
  type DraftContent,
  type DraftInput,
  type StoredDraftAttempt,
} from "@/lib/adCopy/draft";
import { createIdempotencyStore } from "@/lib/adCopy/idempotency";
import { parseGenerateRequest, parseMode, parseUpload } from "@/lib/adCopy/request";
import {
  EMPTY_LISTS,
  formatCopyAll,
  mergeFullResult,
  partialResult,
  pickVariant,
  pinnedCopy,
  replaceVariant,
  undoVariant,
  variantRequest,
  type CopyLists,
} from "@/lib/adCopy/variants";

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).toString("base64");
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64");

// ─── limits ────────────────────────────────────────────────────────────────
describe("limits", () => {
  it("counts code points, so an emoji is one character", () => {
    expect(charCount("Hi 👋")).toBe(4);
  });

  it("reports per-placement fit and skips placements that hide the field", () => {
    const fits = fitsByPlacement("description", "x".repeat(30));
    expect(fits.map((f) => f.placement.id)).toEqual(["facebook_feed"]);
    expect(fits[0].over).toBe(true);
    const headline = fitsByPlacement("headline", "x".repeat(30));
    expect(headline.find((f) => f.placement.id === "facebook_feed")?.over).toBe(true);
    expect(headline.find((f) => f.placement.id === "instagram_feed")?.over).toBe(false);
  });

  it("knows the tightest limit per field", () => {
    expect(tightestLimit("headline")).toBe(27);
    expect(tightestLimit("primaryText")).toBe(125);
  });

  it("truncates at a word boundary like a feed", () => {
    const text = "Lab tested peptides shipped fast from the US with every order backed by a certificate";
    const { visible, truncated } = truncateForFeed(text, 40);
    expect(truncated).toBe(true);
    expect(visible).toBe("Lab tested peptides shipped fast from");
    expect(truncateForFeed("short", 40)).toEqual({ visible: "short", truncated: false });
  });

  it("extracts a display domain", () => {
    expect(displayDomain("https://www.shop.com/p?x=1")).toBe("shop.com");
    expect(displayDomain("shop.com")).toBe("shop.com");
    expect(displayDomain("not a url")).toBeNull();
    expect(displayDomain("")).toBeNull();
  });
});

// ─── settings ──────────────────────────────────────────────────────────────
describe("normalizeSettings", () => {
  it("falls back to defaults for junk", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ tone: "evil", length: 3, primaryCount: "9" })).toMatchObject({
      tone: "mixed",
      length: "long",
      primaryCount: 5,
    });
  });

  it("clamps counts and caps free text", () => {
    const s = normalizeSettings({ primaryCount: 99, headlineCount: 0, descriptionCount: 2.6, instructions: "x".repeat(5000) });
    expect(s.primaryCount).toBe(10);
    expect(s.headlineCount).toBe(1);
    expect(s.descriptionCount).toBe(3);
    expect(s.instructions.length).toBe(1500);
  });

  it("only keeps a custom industry when one is given", () => {
    expect(normalizeSettings({ industry: "custom", customIndustry: "  Pet food " })).toMatchObject({ industry: "custom", customIndustry: "Pet food" });
    expect(normalizeSettings({ industry: "custom", customIndustry: "" }).industry).toBe("peptides");
    expect(industryLabel({ industry: "wellness" })).toBe("Health & Wellness");
    expect(industryLabel({ industry: "custom", customIndustry: "Pet food" })).toBe("Pet food");
  });

  it("strips control characters but keeps line breaks", () => {
    expect(cleanText("a\u0000b\nc\u0007", 50)).toBe("ab\nc");
  });
});

// ─── prompt ────────────────────────────────────────────────────────────────
describe("prompt", () => {
  it("keeps the system prompt free of per-request data (cacheable prefix)", () => {
    expect(AD_COPY_SYSTEM_PROMPT).not.toMatch(/\$\{/);
    expect(AD_COPY_SYSTEM_PROMPT).not.toMatch(/MUST|step by step/);
    // Opus 5.5's minimum cacheable prefix is 512 tokens (~4 chars/token).
    expect(AD_COPY_SYSTEM_PROMPT.length / 4).toBeGreaterThan(512);
  });

  it("puts campaign facts in the user context", () => {
    const text = campaignContextText({ name: "Spring", objective: "OUTCOME_SALES", spend: 1234.5, roas: 2.345 }, 2);
    expect(text).toContain('Campaign: "Spring"');
    expect(text).toContain("$1234.50");
    expect(text).toContain("ROAS: 2.35");
    expect(text).toContain("2 creative images");
  });

  it("keeps the industry out of the cached prefix (it's a setting, in the task text)", () => {
    const context = campaignContextText({ name: "Spring", objective: null, spend: null, roas: null }, 1);
    expect(context).not.toContain("Industry");
    expect(taskText(DEFAULT_SETTINGS, { kind: "full" })).toContain("Industry: Peptides");
    const variant = taskText({ ...DEFAULT_SETTINGS, industry: "custom", customIndustry: "Pet food" }, {
      kind: "variant",
      field: "headline",
      index: 0,
      current: { primaryTexts: [], headlines: ["A"], descriptions: [] },
    });
    expect(variant).toContain("Industry: Pet food");
  });

  it("describes a creative with its current copy and image state", () => {
    const text = creativeText(
      1,
      { adName: "A", spend: 10, ctr: 1.234, existingPrimaryText: "Buy", existingHeadline: null, existingDescription: null },
      "missing"
    );
    expect(text).toContain("Creative 2");
    expect(text).toContain('Current primary text: "Buy"');
    expect(text).toContain("could not be loaded");
    expect(text).not.toContain("Current headline");
  });

  it("asks for the remaining counts when items are kept", () => {
    const text = taskText(
      { ...DEFAULT_SETTINGS, primaryCount: 5, headlineCount: 5, descriptionCount: 3 },
      { kind: "full", keep: { primaryTexts: [{ angle: "Promo", text: "Use GETPEP15" }], headlines: ["H1", "H2"], descriptions: [] } }
    );
    expect(text).toContain("Write 4 primary texts, 3 headlines and 3 descriptions.");
    expect(text).toContain("Use GETPEP15");
  });

  it("asks for exactly one replacement in variant mode", () => {
    const text = taskText(DEFAULT_SETTINGS, {
      kind: "variant",
      field: "headline",
      index: 1,
      current: { primaryTexts: [], headlines: ["A", "B"], descriptions: [] },
    });
    expect(text).toContain("Write one replacement for headline 2");
    expect(text).toContain("headlines array");
  });

  it("includes the settings and notes in the brief", () => {
    const text = taskText({ ...DEFAULT_SETTINGS, emojis: true, instructions: "Mention free shipping" }, { kind: "full" });
    expect(text).toContain("Emojis: allowed");
    expect(text).toContain("Mention free shipping");
    expect(END_OF_MATERIAL).toBeTruthy();
  });
});

// ─── schema ────────────────────────────────────────────────────────────────
describe("parseAdCopy", () => {
  it("has a strict object schema (structured outputs need additionalProperties:false)", () => {
    expect(AD_COPY_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(AD_COPY_JSON_SCHEMA.properties.primaryTexts.items.additionalProperties).toBe(false);
  });

  it("parses, trims and de-markdowns", () => {
    const result = parseAdCopy(
      JSON.stringify({
        detectedOffers: ["GETPEP15", "getpep15", " 15% OFF "],
        primaryTexts: [{ angle: "**Promo**", text: "**Save 15%** today\n\n\n- fast shipping" }, { angle: "x", text: "  " }],
        headlines: ["Lab Tested.", "Made in the U.S."],
        descriptions: ["Free shipping\nover $99"],
      })
    );
    expect(result).toEqual({
      detectedOffers: ["GETPEP15", "15% OFF"],
      primaryTexts: [{ angle: "Promo", text: "Save 15% today\n\n• fast shipping" }],
      headlines: ["Lab Tested", "Made in the U.S."],
      descriptions: ["Free shipping over $99"],
    });
  });

  it("returns null for invalid JSON or the wrong shape", () => {
    expect(parseAdCopy("{not json")).toBeNull();
    expect(parseAdCopy(JSON.stringify({ headlines: "nope" }))).toBeNull();
  });

  it("strips heading markers", () => {
    expect(stripMarkdown("## Title\nBody")).toBe("Title\nBody");
  });

  it("normalizes a partial (stopped) stream with the same rules", () => {
    const partial = partialResult(parsePartialJson('{"detectedOffers":["X","x"],"primaryTexts":[{"angle":"**A**","text":"**Hi** there"},{"angle":"B","text":"'));
    expect(normalizeAdCopy(partial)).toEqual({
      detectedOffers: ["X"],
      primaryTexts: [{ angle: "A", text: "Hi there" }],
      headlines: [],
      descriptions: [],
    });
  });
});

// ─── partial JSON ──────────────────────────────────────────────────────────
describe("parsePartialJson", () => {
  const full = JSON.stringify({
    detectedOffers: ["GETPEP15"],
    primaryTexts: [{ angle: "Promo", text: 'Say "hi"\nnow' }],
    headlines: ["One", "Two"],
    descriptions: [],
  });

  it("parses complete JSON", () => {
    expect(parsePartialJson(full)).toEqual(JSON.parse(full));
  });

  it("never throws and returns a usable prefix value at every cut point", () => {
    for (let i = 0; i <= full.length; i++) {
      const v = parsePartialJson(full.slice(0, i));
      if (v !== undefined) expect(typeof v).toBe("object");
    }
  });

  it("keeps an unfinished string value", () => {
    expect(parsePartialJson('{"headlines":["One","Tw')).toEqual({ headlines: ["One", "Tw"] });
    expect(parsePartialJson('{"primaryTexts":[{"angle":"Promo","text":"Save 15')).toEqual({
      primaryTexts: [{ angle: "Promo", text: "Save 15" }],
    });
  });

  it("drops an unfinished key, a dangling colon and partial escapes", () => {
    expect(parsePartialJson('{"headlines":["One"],"descr')).toEqual({ headlines: ["One"] });
    expect(parsePartialJson('{"headlines":["One"],"descriptions":')).toEqual({ headlines: ["One"] });
    expect(parsePartialJson('{"a":"x\\')).toEqual({ a: "x" });
    expect(parsePartialJson('{"a":"x\\u00')).toEqual({ a: "x" });
    expect(parsePartialJson('{"a":tru')).toEqual({});
  });

  it("returns undefined before anything arrives", () => {
    expect(parsePartialJson("")).toBeUndefined();
    expect(parsePartialJson("   ")).toBeUndefined();
  });
});

// ─── NDJSON ────────────────────────────────────────────────────────────────
describe("ndjson", () => {
  it("round-trips events split across arbitrary chunks", () => {
    const wire =
      encodeEvent({ t: "status", phase: "thinking" }) +
      encodeEvent({ t: "text", text: 'line\n"two"' }) +
      encodeEvent({ t: "error", code: "refusal", message: "no", category: "bio" });
    const decoder = createNdjsonDecoder();
    const events = [];
    for (let i = 0; i < wire.length; i += 7) events.push(...decoder.push(wire.slice(i, i + 7)));
    events.push(...decoder.flush());
    expect(events).toEqual([
      { t: "status", phase: "thinking" },
      { t: "text", text: 'line\n"two"' },
      { t: "error", code: "refusal", message: "no", category: "bio" },
    ]);
  });

  it("skips malformed lines and parses an unterminated last line on flush", () => {
    const decoder = createNdjsonDecoder();
    expect(decoder.push("garbage\n{\"t\":\"text\",\"text\":\"a\"}")).toEqual([]);
    expect(decoder.flush()).toEqual([{ t: "text", text: "a" }]);
  });
});

// ─── images ────────────────────────────────────────────────────────────────
describe("images", () => {
  it("sniffs magic bytes", () => {
    expect(sniffImageType(base64Head(PNG_B64))).toBe("image/png");
    expect(sniffImageType(base64Head(JPEG_B64))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
  });

  it("checks base64 and its decoded size", () => {
    expect(isBase64(PNG_B64)).toBe(true);
    expect(isBase64("abc")).toBe(false);
    expect(isBase64("ab$=")).toBe(false);
    expect(base64DecodedBytes(Buffer.alloc(10).toString("base64"))).toBe(10);
    expect(base64DecodedBytes(Buffer.alloc(11).toString("base64"))).toBe(11);
  });

  it("fits dimensions without upscaling", () => {
    expect(fitWithin(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("only allows https Meta CDN image URLs", () => {
    expect(isMetaImageUrl("https://scontent-lax3-1.xx.fbcdn.net/v/t45/abc.jpg?x=1")).toBe(true);
    expect(isMetaImageUrl("https://external.xx.fbcdn.net/emg1/v/t13/1.jpg")).toBe(true);
    expect(isMetaImageUrl("https://scontent-iad3-1.cdninstagram.com/v/t51/1.jpg")).toBe(true);
    // facebook.com hosts l.facebook.com, Meta's outbound-link redirector.
    expect(isMetaImageUrl("https://l.facebook.com/l.php?u=https%3A%2F%2Fevil.com")).toBe(false);
    expect(isMetaImageUrl("https://www.facebook.com/ads/image/?d=x")).toBe(false);
    expect(isMetaImageUrl("http://scontent.xx.fbcdn.net/a.jpg")).toBe(false);
    expect(isMetaImageUrl("https://fbcdn.net.evil.com/a.jpg")).toBe(false);
    expect(isMetaImageUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isMetaImageUrl("https://user:pw@scontent.xx.fbcdn.net/a.jpg")).toBe(false);
    expect(isMetaImageUrl("not a url")).toBe(false);
  });
});

// ─── generate request ──────────────────────────────────────────────────────
describe("parseGenerateRequest", () => {
  const base = {
    selectedCreatives: [{ adId: "123", adName: "Ad", imageUrl: null, spend: 5, ctr: 1 }],
    campaignName: "Camp",
  };

  it("accepts the legacy body and fills defaults", () => {
    const r = parseGenerateRequest({ ...base, industry: "skincare" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.settings.industry).toBe("skincare");
    expect(r.value.mode).toEqual({ kind: "full" });
    expect(r.value.creatives[0]).toMatchObject({ adId: "123", existingPrimaryText: null });
  });

  it("rejects bad creatives, missing input and too many items", () => {
    expect(parseGenerateRequest({ ...base, selectedCreatives: [{ adId: "x" }] }).ok).toBe(false);
    expect(parseGenerateRequest({ campaignName: "C" }).ok).toBe(false);
    expect(parseGenerateRequest({ ...base, campaignName: "" }).ok).toBe(false);
    expect(parseGenerateRequest({ ...base, selectedCreatives: Array(11).fill(base.selectedCreatives[0]) }).ok).toBe(false);
  });

  it("sniffs uploads instead of trusting the declared type", () => {
    const r = parseUpload({ name: "a.jpg", base64: PNG_B64, mediaType: "image/jpeg" });
    expect(r.ok && r.value.mediaType).toBe("image/png");
    expect(parseUpload({ name: "x", base64: Buffer.from("<svg/>").toString("base64") }).ok).toBe(false);
    expect(parseUpload({ name: "x", base64: "not base64!" }).ok).toBe(false);
  });

  it("validates variant mode against the current copy", () => {
    expect(parseMode({ kind: "variant", field: "headline", index: 0, current: { headlines: ["A"] } }).ok).toBe(true);
    expect(parseMode({ kind: "variant", field: "headline", index: 1, current: { headlines: ["A"] } }).ok).toBe(false);
    expect(parseMode({ kind: "variant", field: "nope", index: 0, current: {} }).ok).toBe(false);
    expect(parseMode(undefined)).toEqual({ ok: true, value: { kind: "full" } });
  });
});

// ─── draft publish ─────────────────────────────────────────────────────────
describe("validateDraftInput", () => {
  const ok = {
    accountId: "act_1",
    adsetId: "2",
    pageId: "3",
    adName: "Draft",
    primaryText: "Body",
    headline: "Head",
    description: "",
    imageHash: "abc123def456",
  };

  it("accepts a minimal draft (description optional)", () => {
    const r = validateDraftInput(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.image).toEqual({ kind: "hash", imageHash: "abc123def456" });
  });

  it("rejects bad ids, missing copy and junk resume values", () => {
    expect(validateDraftInput({ ...ok, accountId: "1" }).ok).toBe(false);
    expect(validateDraftInput({ ...ok, adsetId: "abc" }).ok).toBe(false);
    expect(validateDraftInput({ ...ok, headline: " " }).ok).toBe(false);
    expect(validateDraftInput({ ...ok, imageHash: undefined }).ok).toBe(false);
    expect(validateDraftInput({ ...ok, resume: { creativeId: "1; drop" } }).ok).toBe(false);
    expect(validateDraftInput({ ...ok, idempotencyKey: "short" }).ok).toBe(false);
    expect(validateDraftInput({ ...ok, websiteUrl: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("only takes an explicit confirmRetry: true", () => {
    const r = (extra: Record<string, unknown>) => {
      const v = validateDraftInput({ ...ok, ...extra });
      return v.ok && v.value.confirmRetry;
    };
    expect(r({})).toBe(false);
    expect(r({ confirmRetry: "true" })).toBe(false);
    expect(r({ confirmRetry: true })).toBe(true);
  });

  it("normalizes the website URL", () => {
    expect(normalizeWebsiteUrl("shop.com/x")).toBe("https://shop.com/x");
    expect(normalizeWebsiteUrl("ftp://shop.com")).toBeNull();
    expect(normalizeWebsiteUrl("localhost")).toBeNull();
  });
});

describe("Meta payload builders", () => {
  it("builds the creative body like lib/meta createAdCreative, omitting empty optionals", () => {
    const body = buildCreativeBody({
      adName: "Draft",
      pageId: "3",
      imageHash: "h",
      primaryText: "Body",
      headline: "Head",
      description: "",
      websiteUrl: null,
    });
    expect(body.name).toBe("Draft Creative");
    expect(JSON.parse(body.object_story_spec)).toEqual({ page_id: "3", link_data: { image_hash: "h", message: "Body", name: "Head" } });
    const withLink = buildCreativeBody({ adName: "D", pageId: "3", imageHash: "h", primaryText: "B", headline: "H", description: "Desc", websiteUrl: "https://s.com/" });
    expect(JSON.parse(withLink.object_story_spec).link_data).toMatchObject({ description: "Desc", link: "https://s.com/" });
  });

  it("always creates the ad PAUSED", () => {
    expect(buildAdBody({ adName: "D", adsetId: "2", creativeId: "9" })).toEqual({
      name: "D",
      adset_id: "2",
      creative: JSON.stringify({ creative_id: "9" }),
      status: "PAUSED",
    });
  });

  it("names uploads by sniffed type", () => {
    expect(uploadFilename("Spring Sale / v2", "image/png")).toBe("Spring_Sale_v2.png");
    expect(uploadFilename("!!!", "image/jpeg")).toBe("ad_image.jpg");
  });

  it("links to Ads Manager", () => {
    expect(adsManagerUrl("act_12", "34")).toBe("https://adsmanager.facebook.com/adsmanager/manage/ads?act=12&selected_ad_ids=34");
    expect(adsManagerUrl("act_12")).toBe("https://adsmanager.facebook.com/adsmanager/manage/ads?act=12");
  });
});

describe("duplicate guard + resume", () => {
  const content: DraftContent = {
    accountId: "act_1",
    adsetId: "2",
    pageId: "3",
    imageKey: "upload:a",
    primaryText: "Body",
    headline: "Head",
    description: "",
    websiteUrl: "",
  };
  const attempt = (over: Partial<DraftAttempt> = {}): DraftAttempt => ({
    idempotencyKey: "key-1234567",
    accountId: "act_1",
    imageKey: "upload:a",
    creativeSig: creativeSignature(content),
    draftSig: draftSignature(content),
    imageHash: "hash1",
    creativeId: "99",
    adId: null,
    uncertain: false,
    ...over,
  });

  it("reuses image + creative only while their inputs are unchanged", () => {
    expect(resumeFor(attempt(), content)).toEqual({ imageHash: "hash1", creativeId: "99" });
    expect(resumeFor(attempt(), { ...content, headline: "New" })).toEqual({ imageHash: "hash1", creativeId: null });
    expect(resumeFor(attempt(), { ...content, imageKey: "upload:b" })).toEqual({ imageHash: null, creativeId: null });
    expect(resumeFor(attempt(), { ...content, accountId: "act_2" })).toEqual({ imageHash: null, creativeId: null });
    expect(resumeFor(attempt({ adId: "5" }), content)).toEqual({ imageHash: null, creativeId: null });
    expect(resumeFor(null, content)).toEqual({ imageHash: null, creativeId: null });
  });

  it("a different ad set is a different ad but the same creative", () => {
    expect(resumeFor(attempt(), { ...content, adsetId: "7" }).creativeId).toBe("99");
    expect(draftSignature({ ...content, adsetId: "7" })).not.toBe(draftSignature(content));
  });

  it("reuses the idempotency key only for a true retry", () => {
    const fresh = () => "fresh-key-000";
    expect(idempotencyKeyFor(attempt(), content, fresh)).toBe("key-1234567");
    expect(idempotencyKeyFor(attempt({ adId: "5" }), content, fresh)).toBe("fresh-key-000");
    expect(idempotencyKeyFor(attempt(), { ...content, headline: "x" }, fresh)).toBe("fresh-key-000");
  });

  it("classifies which Meta failures may have created something", () => {
    expect(classifyMetaWriteFailure({ kind: "meta", code: 100 })).toBe("definite");
    expect(classifyMetaWriteFailure({ kind: "meta", code: 503 })).toBe("uncertain");
    expect(classifyMetaWriteFailure({ kind: "meta", code: 0 })).toBe("uncertain");
    expect(classifyMetaWriteFailure({ kind: "other" })).toBe("uncertain");
    expect(classifyMetaWriteFailure({ kind: "rate_limit" })).toBe("definite");
  });

  it("treats Meta's server-side / transient errors and timeouts as uncertain", () => {
    expect(classifyMetaWriteFailure({ kind: "meta", code: 1, httpStatus: 500, isTransient: true })).toBe("uncertain");
    expect(classifyMetaWriteFailure({ kind: "meta", code: 2, httpStatus: 503 })).toBe("uncertain");
    expect(classifyMetaWriteFailure({ kind: "meta", code: 2 })).toBe("uncertain");
    expect(classifyMetaWriteFailure({ kind: "meta", code: 100, httpStatus: 400, isTransient: true })).toBe("uncertain");
    expect(classifyMetaWriteFailure({ kind: "meta", code: 100, httpStatus: 500 })).toBe("uncertain");
    expect(classifyMetaWriteFailure({ kind: "timeout" })).toBe("uncertain");
    // A real Meta error answered with HTTP 4xx is definite, whatever its code.
    expect(classifyMetaWriteFailure({ kind: "meta", code: 613, httpStatus: 400, isTransient: false })).toBe("definite");
    expect(classifyMetaWriteFailure({ kind: "meta", code: 100, httpStatus: 400, isTransient: false })).toBe("definite");
  });
});

describe("persisted attempt decisions", () => {
  const parsed = validateDraftInput({
    accountId: "act_1",
    adsetId: "2",
    pageId: "3",
    adName: "Draft",
    primaryText: "Body",
    headline: "Head",
    imageHash: "abc123def456",
    idempotencyKey: "key-1234567",
  });
  if (!parsed.ok) throw new Error(parsed.error);
  const input: DraftInput = parsed.value;
  const fp = draftFingerprint(input);
  const now = 1_000_000_000;
  const row = (over: Partial<StoredDraftAttempt> = {}): StoredDraftAttempt => ({
    accountId: "act_1",
    fingerprint: fp,
    imageHash: null,
    creativeId: null,
    adId: null,
    stage: null,
    stageStartedAt: null,
    ...over,
  });

  it("runs a new key with the client's resume ids", () => {
    expect(decideAttempt(null, { ...input, resume: { imageHash: "h", creativeId: null } }, fp, now)).toEqual({
      kind: "run",
      resume: { imageHash: "h", creativeId: null },
    });
  });

  it("replays a finished ad instead of creating it again", () => {
    expect(decideAttempt(row({ imageHash: "h", creativeId: "9", adId: "7" }), input, fp, now)).toEqual({
      kind: "replay",
      imageHash: "h",
      creativeId: "9",
      adId: "7",
    });
  });

  it("resumes from the recorded image + creative (they win over the client's)", () => {
    const d = decideAttempt(row({ imageHash: "h", creativeId: "9" }), { ...input, resume: { imageHash: "x", creativeId: "8" } }, fp, now);
    expect(d).toEqual({ kind: "run", resume: { imageHash: "h", creativeId: "9" } });
  });

  it("refuses a key reused for different content or another account", () => {
    expect(decideAttempt(row(), { ...input, headline: "Other" }, draftFingerprint({ ...input, headline: "Other" }), now).kind).toBe("conflict");
    expect(decideAttempt(row({ accountId: "act_2" }), input, fp, now).kind).toBe("conflict");
    // The image source and ad name aren't part of it (a retry sends the uploaded hash).
    expect(draftFingerprint({ ...input, adName: "Renamed", image: { kind: "upload", base64: "AAAA" } })).toBe(fp);
  });

  it("never starts a stage that may still be running elsewhere — even when confirmed", () => {
    const busy = row({ stage: "ad", stageStartedAt: now - 5_000, creativeId: "9" });
    expect(decideAttempt(busy, input, fp, now)).toEqual({ kind: "in_progress", stage: "ad" });
    expect(decideAttempt(busy, { ...input, confirmRetry: true }, fp, now)).toEqual({ kind: "in_progress", stage: "ad" });
  });

  it("asks before re-running a create that was started but never recorded", () => {
    // Crashed mid-create (start time left behind, now stale) or answered "uncertain" (start time cleared).
    for (const stageStartedAt of [now - STAGE_IN_FLIGHT_MS - 1, null]) {
      const ad = row({ stage: "ad", stageStartedAt, imageHash: "h", creativeId: "9" });
      expect(decideAttempt(ad, input, fp, now)).toEqual({ kind: "uncertain", stage: "ad", imageHash: "h", creativeId: "9" });
      expect(decideAttempt(ad, { ...input, confirmRetry: true }, fp, now)).toEqual({ kind: "run", resume: { imageHash: "h", creativeId: "9" } });
      const creative = row({ stage: "creative", stageStartedAt, imageHash: "h" });
      expect(decideAttempt(creative, input, fp, now).kind).toBe("uncertain");
      expect(decideAttempt(creative, { ...input, confirmRetry: true }, fp, now).kind).toBe("run");
    }
  });

  it("doesn't ask when the interrupted creative is already known (only the ad is left)", () => {
    const creative = row({ stage: "creative", stageStartedAt: null, imageHash: "h" });
    expect(decideAttempt(creative, { ...input, resume: { imageHash: "h", creativeId: "9" } }, fp, now)).toEqual({
      kind: "run",
      resume: { imageHash: "h", creativeId: "9" },
    });
  });
});

describe("idempotency store", () => {
  it("joins concurrent calls and replays successes within the TTL", async () => {
    let t = 0;
    let calls = 0;
    const store = createIdempotencyStore<{ status: number }>({ ttlMs: 1000, maxEntries: 10, keep: (v) => v.status === 200, now: () => t });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fn = async () => {
      calls++;
      await gate;
      return { status: 200 };
    };
    const a = store.run("k", fn);
    const b = store.run("k", fn);
    release();
    expect(await a).toEqual({ value: { status: 200 }, replayed: false });
    expect(await b).toEqual({ value: { status: 200 }, replayed: true });
    expect(calls).toBe(1);
    expect((await store.run("k", fn)).replayed).toBe(true);
    t = 2000;
    expect((await store.run("k", fn)).replayed).toBe(false);
    expect(calls).toBe(2);
  });

  it("forgets failures so a retry runs again", async () => {
    let calls = 0;
    const store = createIdempotencyStore<{ status: number }>({ ttlMs: 1000, maxEntries: 10, keep: (v) => v.status === 200 });
    const fail = async () => {
      calls++;
      return { status: 500 };
    };
    await store.run("k", fail);
    await store.run("k", fail);
    expect(calls).toBe(2);
    const boom = async () => {
      throw new Error("x");
    };
    await expect(store.run("j", boom)).rejects.toThrow("x");
    expect(store.size()).toBe(0);
  });

  it("evicts the oldest settled entries past the cap", async () => {
    const store = createIdempotencyStore<{ status: number }>({ ttlMs: 60_000, maxEntries: 2, keep: () => true });
    for (const k of ["a", "b", "c"]) await store.run(k, async () => ({ status: 200 }));
    await store.run("d", async () => ({ status: 200 }));
    expect(store.size()).toBeLessThanOrEqual(3);
  });
});

// ─── variants ──────────────────────────────────────────────────────────────

describe("variants", () => {
  const lists: CopyLists = {
    primaryText: [
      { id: "p1", text: "Keep me", angle: "Promo", pinned: true },
      { id: "p2", text: "Replace me", angle: "Story" },
    ],
    headline: [
      { id: "h1", text: "" },
      { id: "h2", text: "Head two" },
    ],
    description: [],
  };
  const result = { detectedOffers: [], primaryTexts: [{ angle: "New", text: "Fresh" }], headlines: ["H"], descriptions: ["D"] };

  it("keeps pinned items first on a full regenerate and caps each list", () => {
    const merged = mergeFullResult(lists, result);
    expect(merged.primaryText.map((v) => v.text)).toEqual(["Keep me", "Fresh"]);
    expect(merged.headline.map((v) => v.text)).toEqual(["H"]);
    const many = mergeFullResult(EMPTY_LISTS, { ...result, headlines: Array(14).fill("x") });
    expect(many.headline).toHaveLength(10);
  });

  it("sends only pinned items as 'keep'", () => {
    expect(pinnedCopy(lists)).toEqual({ primaryTexts: [{ angle: "Promo", text: "Keep me" }], headlines: [], descriptions: [] });
    expect(pinnedCopy(EMPTY_LISTS)).toBeUndefined();
  });

  it("indexes a variant among the non-empty items the server will see", () => {
    expect(variantRequest(lists, "headline", "h2")?.index).toBe(0);
    expect(variantRequest(lists, "headline", "h1")).toBeNull();
  });

  it("replaces with undo", () => {
    const replaced = replaceVariant(lists.primaryText, "p2", "New text", "Angle");
    expect(replaced[1]).toMatchObject({ text: "New text", previous: "Replace me", angle: "Angle" });
    expect(undoVariant(replaced, "p2")[1]).toMatchObject({ text: "Replace me", previous: undefined });
  });

  it("falls back to the first non-empty variant when the selection is gone", () => {
    expect(pickVariant(lists.headline, "gone")?.id).toBe("h2");
    expect(pickVariant(lists.headline, "h1")?.id).toBe("h1");
    expect(pickVariant([], null)).toBeNull();
  });

  it("formats Copy all as plain text", () => {
    expect(formatCopyAll(lists)).toBe("PRIMARY TEXT\n\n1. Promo\nKeep me\n\n2. Story\nReplace me\n\n\nHEADLINES\n1. Head two");
  });

  it("reads partial results defensively", () => {
    expect(partialResult({ primaryTexts: [{ angle: "A" }, 5], headlines: ["x", 1] })).toEqual({
      detectedOffers: [],
      primaryTexts: [{ angle: "A", text: "" }],
      headlines: ["x"],
      descriptions: [],
    });
    expect(partialResult(undefined).primaryTexts).toEqual([]);
  });
});
