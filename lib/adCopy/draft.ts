import { cleanText } from "./settings";

/**
 * Draft-ad publishing (POST /api/ad-copy/publish-draft) — pure pieces:
 * input validation, the Meta request bodies, and the duplicate / resume
 * rules. The route does the I/O; everything that decides WHAT gets written
 * to Meta lives here so it's unit-tested without ever calling Meta.
 */

export const DRAFT_LIMITS = {
  adName: 400,
  primaryText: 5000,
  headline: 255,
  description: 255,
  websiteUrl: 2048,
  /** Decoded bytes of an uploaded image (≈4 MB of base64 — under Vercel's 4.5 MB body cap). */
  imageBytes: 3 * 1024 * 1024,
} as const;

const ACCOUNT_RE = /^act_\d{1,30}$/;
const NUMERIC_ID_RE = /^\d{1,30}$/;
const IMAGE_HASH_RE = /^[A-Za-z0-9_-]{6,128}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,80}$/;

export type DraftImageSource =
  | { kind: "hash"; imageHash: string }
  | { kind: "upload"; base64: string }
  | { kind: "url"; url: string };

export interface DraftInput {
  accountId: string;
  adsetId: string;
  pageId: string;
  adName: string;
  primaryText: string;
  headline: string;
  description: string;
  websiteUrl: string | null;
  image: DraftImageSource;
  idempotencyKey: string | null;
  resume: { imageHash: string | null; creativeId: string | null };
  /** The person checked Ads Manager after an "uncertain" answer and asked to create it anyway. */
  confirmRetry: boolean;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Normalize a landing-page URL: http(s) only, a dotted host; bare domains get https://. */
export function normalizeWebsiteUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function validateDraftInput(raw: unknown): Validation<DraftInput> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid request body" };
  const b = raw as Record<string, unknown>;

  const accountId = str(b.accountId);
  if (!ACCOUNT_RE.test(accountId)) return { ok: false, error: "Invalid accountId" };
  const adsetId = str(b.adsetId);
  if (!NUMERIC_ID_RE.test(adsetId)) return { ok: false, error: "Choose an ad set" };
  const pageId = str(b.pageId);
  if (!NUMERIC_ID_RE.test(pageId)) return { ok: false, error: "Choose a Facebook Page" };

  const adName = cleanText(b.adName, DRAFT_LIMITS.adName + 1);
  if (!adName) return { ok: false, error: "Ad name is required" };
  if (adName.length > DRAFT_LIMITS.adName) return { ok: false, error: `Ad name is over ${DRAFT_LIMITS.adName} characters` };
  const primaryText = cleanText(b.primaryText, DRAFT_LIMITS.primaryText + 1);
  if (!primaryText) return { ok: false, error: "Primary text is required" };
  if (primaryText.length > DRAFT_LIMITS.primaryText) return { ok: false, error: "Primary text is too long" };
  const headline = cleanText(b.headline, DRAFT_LIMITS.headline + 1);
  if (!headline) return { ok: false, error: "Headline is required" };
  if (headline.length > DRAFT_LIMITS.headline) return { ok: false, error: "Headline is too long" };
  const description = cleanText(b.description, DRAFT_LIMITS.description + 1);
  if (description.length > DRAFT_LIMITS.description) return { ok: false, error: "Description is too long" };

  const websiteRaw = str(b.websiteUrl);
  let websiteUrl: string | null = null;
  if (websiteRaw.trim()) {
    if (websiteRaw.length > DRAFT_LIMITS.websiteUrl) return { ok: false, error: "Website URL is too long" };
    websiteUrl = normalizeWebsiteUrl(websiteRaw);
    if (!websiteUrl) return { ok: false, error: "Website URL must be an http(s) address" };
  }

  // Image: an existing Meta hash beats an upload beats a CDN URL (same precedence as before).
  let image: DraftImageSource;
  const hash = str(b.imageHash);
  const b64 = str(b.imageBase64);
  const url = str(b.imageUrl);
  if (hash) {
    if (!IMAGE_HASH_RE.test(hash)) return { ok: false, error: "Invalid imageHash" };
    image = { kind: "hash", imageHash: hash };
  } else if (b64) {
    image = { kind: "upload", base64: b64 };
  } else if (url) {
    image = { kind: "url", url };
  } else {
    return { ok: false, error: "Choose an image for the ad" };
  }

  const keyRaw = str(b.idempotencyKey);
  if (keyRaw && !IDEMPOTENCY_RE.test(keyRaw)) return { ok: false, error: "Invalid idempotencyKey" };

  const resumeRaw = b.resume && typeof b.resume === "object" ? (b.resume as Record<string, unknown>) : {};
  const resumeHash = str(resumeRaw.imageHash);
  const resumeCreative = str(resumeRaw.creativeId);
  if (resumeHash && !IMAGE_HASH_RE.test(resumeHash)) return { ok: false, error: "Invalid resume.imageHash" };
  if (resumeCreative && !NUMERIC_ID_RE.test(resumeCreative)) return { ok: false, error: "Invalid resume.creativeId" };

  return {
    ok: true,
    value: {
      accountId,
      adsetId,
      pageId,
      adName,
      primaryText,
      headline,
      description,
      websiteUrl,
      image,
      idempotencyKey: keyRaw || null,
      resume: { imageHash: resumeHash || null, creativeId: resumeCreative || null },
      confirmRetry: b.confirmRetry === true,
    },
  };
}

/** Form body for POST /act_{id}/adcreatives — same shape lib/meta/endpoints createAdCreative sends. */
export function buildCreativeBody(input: {
  adName: string;
  pageId: string;
  imageHash: string;
  primaryText: string;
  headline: string;
  description: string;
  websiteUrl: string | null;
}): Record<string, string> {
  const linkData: Record<string, string> = {
    image_hash: input.imageHash,
    message: input.primaryText,
    name: input.headline,
  };
  if (input.description) linkData.description = input.description;
  if (input.websiteUrl) linkData.link = input.websiteUrl;
  return {
    name: `${input.adName} Creative`.slice(0, DRAFT_LIMITS.adName),
    object_story_spec: JSON.stringify({ page_id: input.pageId, link_data: linkData }),
  };
}

/** Form body for POST /act_{id}/ads — always PAUSED (a draft never spends). */
export function buildAdBody(input: { adName: string; adsetId: string; creativeId: string }): Record<string, string> {
  return {
    name: input.adName,
    adset_id: input.adsetId,
    creative: JSON.stringify({ creative_id: input.creativeId }),
    status: "PAUSED",
  };
}

/** Upload filename for the multipart adimages call, extension from the sniffed type. */
export function uploadFilename(adName: string, mediaType: string): string {
  const ext = mediaType === "image/png" ? "png" : mediaType === "image/gif" ? "gif" : "jpg";
  const base = adName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "ad_image";
  return `${base}.${ext}`;
}

// ─── Duplicate guard + resume ───────────────────────────────────────────────

/** What the client publishes, as far as duplicate detection cares. */
export interface DraftContent {
  accountId: string;
  adsetId: string;
  pageId: string;
  /** Stable identity of the chosen image ("upload:<id>", "creative:<adId>"). */
  imageKey: string;
  primaryText: string;
  headline: string;
  description: string;
  websiteUrl: string;
}

/** Everything Meta's creative is built from (ad set excluded — a creative can serve any ad set). */
export function creativeSignature(c: DraftContent): string {
  return JSON.stringify([c.accountId, c.pageId, c.imageKey, c.primaryText.trim(), c.headline.trim(), c.description.trim(), c.websiteUrl.trim()]);
}

/** The ad as a whole: same creative content in the same ad set = a duplicate ad. */
export function draftSignature(c: DraftContent): string {
  return JSON.stringify([creativeSignature(c), c.adsetId]);
}

/** One publish attempt the client remembers (per session) to resume or warn. */
export interface DraftAttempt {
  idempotencyKey: string;
  accountId: string;
  imageKey: string;
  creativeSig: string;
  draftSig: string;
  imageHash: string | null;
  creativeId: string | null;
  adId: string | null;
  /** The last try failed in a way where Meta may or may not have created the object. */
  uncertain: boolean;
}

/**
 * What a retry may reuse from a failed earlier attempt: its uploaded image
 * when the image is the same (same account), its creative when nothing the
 * creative is built from changed. Prevents orphan creatives piling up on
 * retries, without ever publishing stale copy.
 */
export function resumeFor(prev: DraftAttempt | null, next: DraftContent): { imageHash: string | null; creativeId: string | null } {
  if (!prev || prev.adId || prev.accountId !== next.accountId) return { imageHash: null, creativeId: null };
  const imageHash = prev.imageKey === next.imageKey ? prev.imageHash : null;
  const creativeId = prev.creativeSig === creativeSignature(next) ? prev.creativeId : null;
  return { imageHash, creativeId };
}

/**
 * Reuse the previous idempotency key only for a true retry of the same draft
 * that hasn't succeeded — the server then replays/resumes that attempt (it
 * persists every attempt, see decideAttempt) instead of creating a second ad.
 */
export function idempotencyKeyFor(prev: DraftAttempt | null, next: DraftContent, fresh: () => string): string {
  if (prev && !prev.adId && prev.draftSig === draftSignature(next)) return prev.idempotencyKey;
  return fresh();
}

/**
 * Classify a failed Meta write. "definite" = Meta answered with a real error,
 * so nothing was created; "uncertain" = the request may have landed (network
 * drop, timeout, any 5xx, a transient server error — codes 1/2 or
 * `is_transient` — or an unparseable 200) — never retried automatically, and
 * the person is told to check Ads Manager first.
 */
export function classifyMetaWriteFailure(
  e:
    | { kind: "meta"; code: number; httpStatus?: number; isTransient?: boolean }
    | { kind: "rate_limit" | "token" }
    | { kind: "timeout" | "other" }
): "definite" | "uncertain" {
  if (e.kind === "rate_limit" || e.kind === "token") return "definite";
  if (e.kind === "meta") {
    // Without an HTTP status, a code ≥ 500 is the helper's "HTTP <status>" fallback.
    const status = e.httpStatus ?? (e.code >= 500 ? e.code : 0);
    const serverSide = e.isTransient === true || e.code === 0 || e.code === 1 || e.code === 2 || status >= 500;
    return serverSide ? "uncertain" : "definite";
  }
  return "uncertain";
}

// ─── Server-side attempt record (lib/adCopyDraftAttempts.ts) ────────────────

/** A Meta create the route has started for an attempt. */
export type DraftStage = "creative" | "ad";

/**
 * One persisted publish attempt (per admin + idempotency key) — the
 * cross-instance duplicate guard. Ids are written as soon as their Meta step
 * succeeds; `stage` is written BEFORE each create and cleared once its
 * outcome is known, so a crash/timeout between the two leaves it set.
 */
export interface StoredDraftAttempt {
  accountId: string;
  fingerprint: string;
  imageHash: string | null;
  creativeId: string | null;
  adId: string | null;
  stage: DraftStage | null;
  /** When the request running `stage` started; null once it answered (an uncertain answer keeps `stage`). */
  stageStartedAt: number | null;
}

/** How long a started stage may still be running in some request — longer than publish-draft's maxDuration. */
export const STAGE_IN_FLIGHT_MS = 130_000;

/**
 * What an idempotency key stands for. The image is left out (a retry sends
 * the uploaded image's hash instead of the bytes) and so is the ad name
 * (cosmetic) — the client keys attempts on the same fields (draftSignature).
 */
export function draftFingerprint(input: DraftInput): string {
  return JSON.stringify([input.accountId, input.adsetId, input.pageId, input.primaryText, input.headline, input.description, input.websiteUrl ?? ""]);
}

export type AttemptDecision =
  | { kind: "conflict" }
  | { kind: "replay"; imageHash: string | null; creativeId: string | null; adId: string }
  | { kind: "in_progress"; stage: DraftStage }
  | { kind: "uncertain"; stage: DraftStage; imageHash: string | null; creativeId: string | null }
  | { kind: "run"; resume: { imageHash: string | null; creativeId: string | null } };

/**
 * What a request with a known idempotency key may do: replay a finished ad,
 * resume from the recorded image/creative, or — when a create was started
 * and its result never recorded (crash, timeout, lost response) — refuse to
 * create again until the person confirms they checked Ads Manager.
 */
export function decideAttempt(prev: StoredDraftAttempt | null, input: DraftInput, fingerprint: string, now: number): AttemptDecision {
  if (!prev) return { kind: "run", resume: input.resume };
  if (prev.accountId !== input.accountId || prev.fingerprint !== fingerprint) return { kind: "conflict" };
  if (prev.adId) return { kind: "replay", imageHash: prev.imageHash, creativeId: prev.creativeId, adId: prev.adId };
  const resume = { imageHash: prev.imageHash ?? input.resume.imageHash, creativeId: prev.creativeId ?? input.resume.creativeId };
  if (prev.stage) {
    // Possibly still running in another request: never start it twice, confirmed or not.
    if (prev.stageStartedAt !== null && now - prev.stageStartedAt < STAGE_IN_FLIGHT_MS) return { kind: "in_progress", stage: prev.stage };
    // Only a stage that would run AGAIN is a duplicate risk — a known creative leaves just the ad.
    const rerun = prev.stage === "ad" || !resume.creativeId;
    if (rerun && !input.confirmRetry) return { kind: "uncertain", stage: prev.stage, ...resume };
  }
  return { kind: "run", resume };
}

/** Ads Manager deep link — the account's ads, with the created ad selected when given. */
export function adsManagerUrl(accountId: string, adId?: string): string {
  const act = accountId.replace(/^act_/, "");
  const base = `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(act)}`;
  return adId ? `${base}&selected_ad_ids=${encodeURIComponent(adId)}` : base;
}
