export const dynamic = "force-dynamic";
// Every Meta step is time-boxed (image download 10 s, upload 2 × 25 s, each
// create 20 s), so the route answers — with what it created — before the
// platform kills it. STAGE_IN_FLIGHT_MS (lib/adCopy/draft) must stay above this.
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { requireInternalActor } from "@/lib/api/requireAdmin";
import { readJsonCapped } from "@/lib/api/readBodyCapped";
import { logAuditEvent } from "@/lib/auditLog";
import { uploadAdImage } from "@/lib/meta/endpoints";
import { MetaCreateResponseSchema } from "@/lib/meta/schemas";
import { metaFetchPost, RateLimitError, TokenExpiredError, MetaApiError } from "@/lib/meta/client";
import { fetchPublicImage } from "@/lib/publicImageFetch";
import { base64DecodedBytes, base64Head, isBase64, isMetaImageUrl, sniffImageType } from "@/lib/adCopy/images";
import {
  DRAFT_LIMITS,
  buildAdBody,
  buildCreativeBody,
  classifyMetaWriteFailure,
  decideAttempt,
  uploadFilename,
  validateDraftInput,
  type AttemptDecision,
  type DraftInput,
  type DraftStage,
} from "@/lib/adCopy/draft";
import { createIdempotencyStore } from "@/lib/adCopy/idempotency";
import { openDraftAttempt, type DraftAttemptHandle } from "@/lib/adCopyDraftAttempts";

/**
 * Create a PAUSED draft ad in Meta from the chosen copy + image:
 *   1. image hash  (reuse the creative's hash | upload the file | download the Meta-CDN image and upload it)
 *   2. ad creative (POST /act_X/adcreatives)
 *   3. paused ad   (POST /act_X/ads, status PAUSED)
 *
 * Duplicate safety (this route WRITES to client ad accounts):
 *  - steps 2–3 call Meta with retries: 0 and a 20 s timeout — the shared POST
 *    helper otherwise re-sends on network errors / 5xx, which can create the
 *    object twice; a timeout counts as "uncertain", never as "not created";
 *  - every attempt is persisted per admin + idempotency key
 *    (lib/adCopyDraftAttempts.ts): each id is recorded as its step succeeds
 *    and the step is marked BEFORE each create, so a retry on any instance
 *    replays a finished ad, resumes from the recorded creative, or — when a
 *    create was started and never recorded (crash, timeout, lost response) —
 *    answers "uncertain" until the person confirms (`confirmRetry`) that they
 *    checked Ads Manager;
 *  - concurrent same-key requests on one instance join one run (in memory);
 *  - a failure after step 1 or 2 returns what was created (`partial`) and the
 *    client sends it back as `resume`, so a retry doesn't leave orphan
 *    creatives.
 */

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const CREATE_TIMEOUT_MS = 20_000;
/** Image upload is idempotent (same bytes → same hash), so one retry is fine. */
const UPLOAD_OPTIONS = { retries: 1, timeoutMs: 25_000 };

// Per-admin write throttle — Meta writes are rare and deliberate; a burst is a bug.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(adminId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(adminId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(adminId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

interface Outcome {
  status: number;
  body: Record<string, unknown>;
}

const attempts = createIdempotencyStore<Outcome>({
  ttlMs: 10 * 60_000,
  maxEntries: 500,
  keep: (o) => o.status === 200,
});

type Stage = "image" | DraftStage;

class StageError extends Error {
  constructor(
    readonly stage: Stage,
    readonly cause: unknown,
    readonly partial: { imageHash: string | null; creativeId: string | null }
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
  }
}

/** A create this request did NOT send: its attempt row is busy (another request has the stage) or couldn't be written. */
class AttemptGateError extends Error {
  constructor(readonly reason: "busy" | "store") {
    super(reason === "busy" ? "Draft attempt is busy" : "Draft attempt couldn't be recorded");
  }
}

function describeFailure(err: unknown) {
  if (err instanceof RateLimitError) return { kind: "rate_limit" as const };
  if (err instanceof TokenExpiredError) return { kind: "token" as const };
  if (err instanceof MetaApiError) {
    return { kind: "meta" as const, code: err.metaCode, httpStatus: err.httpStatus, isTransient: err.isTransient };
  }
  if (err instanceof Error && err.name === "TimeoutError") return { kind: "timeout" as const };
  return { kind: "other" as const };
}

async function resolveImageHash(input: DraftInput): Promise<string> {
  const src = input.image;
  if (src.kind === "hash") return src.imageHash;

  let bytes: Buffer;
  if (src.kind === "upload") {
    if (!isBase64(src.base64) || base64DecodedBytes(src.base64) > DRAFT_LIMITS.imageBytes) {
      throw new MetaApiError("The image is too large or not valid image data", 400);
    }
    if (!sniffImageType(base64Head(src.base64))) throw new MetaApiError("The upload isn't a JPEG, PNG or GIF image", 400);
    bytes = Buffer.from(src.base64, "base64");
  } else {
    // A creative without a reusable hash: download its Meta-CDN image (SSRF-guarded,
    // every redirect hop held to the CDN allowlist) and upload the bytes — Meta's
    // /adimages takes bytes, not a URL.
    if (!isMetaImageUrl(src.url)) throw new MetaApiError("Image URL must be a Meta CDN image", 400);
    const res = await fetchPublicImage(src.url, DRAFT_LIMITS.imageBytes, { allowHost: (u) => isMetaImageUrl(u.href) });
    if (!res.ok) throw new MetaApiError("Couldn't download the creative's image — upload the original instead", 400);
    bytes = res.data;
  }

  const mediaType = sniffImageType(bytes.subarray(0, 16));
  if (!mediaType || mediaType === "image/webp") {
    throw new MetaApiError("The image must be a JPEG, PNG or GIF", 400);
  }
  return uploadAdImage(
    input.accountId,
    { base64: bytes.toString("base64"), filename: uploadFilename(input.adName, mediaType) },
    UPLOAD_OPTIONS
  );
}

/** Recording a finished step is best-effort: if it fails, the stage marker stays — a retry then asks instead of creating twice. */
function noteRecordFailure(err: unknown) {
  console.error("[ad-copy/publish-draft] couldn't record the attempt:", err instanceof Error ? err.message : err);
}

/** Mark the stage on the attempt row, then send the create; a failure releases (definite) or keeps (uncertain) the mark. */
async function createStep<T>(attempt: DraftAttemptHandle | null, stage: DraftStage, send: () => Promise<T>): Promise<T> {
  if (attempt) {
    let claimed: boolean;
    try {
      claimed = await attempt.claim(stage);
    } catch (err) {
      noteRecordFailure(err);
      throw new AttemptGateError("store");
    }
    if (!claimed) throw new AttemptGateError("busy");
  }
  try {
    return await send();
  } catch (err) {
    const uncertain = classifyMetaWriteFailure(describeFailure(err)) === "uncertain";
    await attempt?.settle(uncertain).catch(noteRecordFailure);
    throw err;
  }
}

async function publish(
  input: DraftInput,
  resume: { imageHash: string | null; creativeId: string | null },
  attempt: DraftAttemptHandle | null
): Promise<{ imageHash: string; creativeId: string; adId: string }> {
  const act = input.accountId;

  let imageHash: string;
  try {
    imageHash = resume.imageHash ?? (await resolveImageHash(input));
  } catch (err) {
    throw new StageError("image", err, { imageHash: null, creativeId: null });
  }
  if (!resume.imageHash) await attempt?.recordImage(imageHash).catch(noteRecordFailure);

  let creativeId: string;
  try {
    creativeId =
      resume.creativeId ??
      (
        await createStep(attempt, "creative", () =>
          metaFetchPost(`/${act}/adcreatives`, MetaCreateResponseSchema, buildCreativeBody({ ...input, imageHash }), {
            retries: 0,
            timeoutMs: CREATE_TIMEOUT_MS,
          })
        )
      ).id;
  } catch (err) {
    throw new StageError("creative", err, { imageHash, creativeId: null });
  }
  if (!resume.creativeId) await attempt?.recordCreative(creativeId).catch(noteRecordFailure);

  let adId: string;
  try {
    adId = (
      await createStep(attempt, "ad", () =>
        metaFetchPost(`/${act}/ads`, MetaCreateResponseSchema, buildAdBody({ adName: input.adName, adsetId: input.adsetId, creativeId }), {
          retries: 0,
          timeoutMs: CREATE_TIMEOUT_MS,
        })
      )
    ).id;
  } catch (err) {
    throw new StageError("ad", err, { imageHash, creativeId });
  }
  await attempt?.recordAd(adId).catch(noteRecordFailure);
  return { imageHash, creativeId, adId };
}

const STAGE_LABEL: Record<Stage, string> = { image: "uploading the image", creative: "creating the ad creative", ad: "creating the ad" };

function failureOutcome(err: StageError): Outcome {
  const cause = err.cause;
  const failure = describeFailure(cause);
  const certainty = classifyMetaWriteFailure(failure);
  const partial = err.partial;
  if (cause instanceof AttemptGateError) {
    return cause.reason === "busy"
      ? {
          status: 409,
          body: { error: "This draft is already being created by another request — wait a moment, then try again.", code: "in_progress", stage: err.stage, partial },
        }
      : {
          status: 503,
          body: { error: `Couldn't record this attempt, so nothing was sent to Meta for ${STAGE_LABEL[err.stage]}. Try again in a moment.`, stage: err.stage, partial },
        };
  }
  if (cause instanceof RateLimitError) {
    return { status: 429, body: { error: cause.message, retryAfter: cause.retryAfterSeconds, stage: err.stage, partial } };
  }
  if (cause instanceof TokenExpiredError) {
    // 502, not 401: the admin's own session is fine — it's the Meta token/permission that failed.
    return { status: 502, body: { error: cause.message || "The Meta connection needs to be re-authorized.", stage: err.stage, partial } };
  }
  // Uploading an image is idempotent (same bytes → same hash), so only the creates can be "uncertain".
  if (certainty === "uncertain" && err.stage !== "image") {
    return {
      status: 502,
      body: {
        error: `Meta didn't confirm the result while ${STAGE_LABEL[err.stage]}. It may have gone through — check Ads Manager; if the ad isn't there, confirm to create it.`,
        code: "uncertain",
        stage: err.stage,
        partial,
      },
    };
  }
  if (failure.kind === "timeout") {
    return { status: 504, body: { error: `Meta took too long to answer while ${STAGE_LABEL[err.stage]}. Try again.`, stage: err.stage, partial } };
  }
  if (cause instanceof MetaApiError) {
    console.error("[ad-copy/publish-draft] Meta API error:", { stage: err.stage, code: cause.metaCode, subcode: cause.metaSubcode, message: cause.message });
    return { status: 400, body: { error: cause.message, metaCode: cause.metaCode, metaSubcode: cause.metaSubcode, stage: err.stage, partial } };
  }
  console.error("[ad-copy/publish-draft] failed:", err.stage, err.message);
  return { status: 500, body: { error: `Something went wrong while ${STAGE_LABEL[err.stage]}.`, stage: err.stage, partial } };
}

/** A known idempotency key that must not run: replay, conflict, still running, or interrupted mid-create. */
function decisionOutcome(decision: Exclude<AttemptDecision, { kind: "run" }>): Outcome {
  switch (decision.kind) {
    case "replay":
      return {
        status: 200,
        body: { success: true, imageHash: decision.imageHash, creativeId: decision.creativeId, adId: decision.adId, replayed: true },
      };
    case "conflict":
      return {
        status: 409,
        body: { error: "This retry doesn't match the earlier try of this draft. Close the dialog and start again.", code: "key_conflict" },
      };
    case "in_progress":
      return {
        status: 409,
        body: { error: "This draft is still being created — wait a moment, then try again.", code: "in_progress", stage: decision.stage },
      };
    case "uncertain":
      return {
        status: 409,
        body: {
          error: `An earlier try was interrupted while ${STAGE_LABEL[decision.stage]}, so it may have gone through. Check Ads Manager — if the ad isn't there, confirm to create it.`,
          code: "uncertain",
          stage: decision.stage,
          partial: { imageHash: decision.imageHash, creativeId: decision.creativeId },
        },
      };
  }
}

export async function POST(request: Request) {
  // Fresh DB read: middleware gates by the session token's permissions, which
  // can be up to 7 days stale — a Meta WRITE re-checks the live record. Partner
  // (external-workspace) admins are refused: these are the agency's ad accounts.
  const gate = await requireInternalActor();
  if (gate.response) return gate.response;
  const admin = gate.actor.admin;
  if (!admin.isSuper && !admin.permissions.adcopy) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonCapped(request, MAX_BODY_BYTES);
  if (!body.ok) {
    return body.reason === "too_large"
      ? NextResponse.json({ error: "The image is too large to send." }, { status: 413 })
      : NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsed = validateDraftInput(body.value);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;

  const run = async (): Promise<Outcome> => {
    if (!checkRateLimit(admin.id)) {
      return { status: 429, body: { error: "Too many draft ads in a minute — wait a moment." } };
    }

    let resume = input.resume;
    let attempt: DraftAttemptHandle | null = null;
    if (input.idempotencyKey) {
      let opened: Awaited<ReturnType<typeof openDraftAttempt>>;
      try {
        opened = await openDraftAttempt(admin.id, input.idempotencyKey, input);
      } catch (err) {
        noteRecordFailure(err);
        return { status: 503, body: { error: "Couldn't check earlier tries of this draft, so nothing was sent to Meta. Try again in a moment." } };
      }
      const decision = decideAttempt(opened.prev, input, opened.fingerprint, Date.now());
      if (decision.kind !== "run") return decisionOutcome(decision);
      resume = decision.resume;
      attempt = opened.handle;
    }

    const auditBase = { adminId: admin.id, adminUsername: admin.username };
    try {
      const created = await publish(input, resume, attempt);
      logAuditEvent({
        ...auditBase,
        action: "adcopy.draft_create",
        targetType: "meta_ad",
        targetId: created.adId,
        details: JSON.stringify({
          accountId: input.accountId,
          adsetId: input.adsetId,
          creativeId: created.creativeId,
          adName: input.adName,
          ...(input.confirmRetry ? { confirmedRetry: true } : {}),
        }),
      }).catch((err) => console.error("[ad-copy/publish-draft] audit log failed:", err));
      return { status: 200, body: { success: true, ...created } };
    } catch (err) {
      if (!(err instanceof StageError)) {
        console.error("[ad-copy/publish-draft] failed:", err);
        return { status: 500, body: { error: "Internal server error" } };
      }
      const outcome = failureOutcome(err);
      // Something may now exist in the account without a finished ad: leave a trail.
      const uncertain = outcome.body.code === "uncertain";
      if (err.partial.creativeId || uncertain) {
        logAuditEvent({
          ...auditBase,
          action: "adcopy.draft_partial",
          targetType: "meta_ad_account",
          targetId: input.accountId,
          details: JSON.stringify({
            stage: err.stage,
            uncertain,
            creativeId: err.partial.creativeId,
            accountId: input.accountId,
            adsetId: input.adsetId,
            adName: input.adName,
            ...(input.confirmRetry ? { confirmedRetry: true } : {}),
          }),
        }).catch((auditErr) => console.error("[ad-copy/publish-draft] audit log failed:", auditErr));
      }
      return outcome;
    }
  };

  const outcome = input.idempotencyKey
    ? await attempts.run(`${admin.id}:${input.idempotencyKey}`, run).then(({ value, replayed }) =>
        replayed && value.status === 200 ? { ...value, body: { ...value.body, replayed: true } } : value
      )
    : await run();

  const headers: Record<string, string> = {};
  if (outcome.status === 429 && typeof outcome.body.retryAfter === "number") headers["Retry-After"] = String(outcome.body.retryAfter);
  return NextResponse.json(outcome.body, { status: outcome.status, headers });
}
