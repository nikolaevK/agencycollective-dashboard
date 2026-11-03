import { createHash } from "crypto";
import type { InValue, Row } from "@libsql/client";
import { getDb, ensureMigrated } from "./db";
import { draftFingerprint, type DraftInput, type DraftStage, type StoredDraftAttempt } from "./adCopy/draft";

// ---------------------------------------------------------------------------
// Persisted "Create draft ad" attempts (table ad_copy_draft_attempts, one row
// per admin + idempotency key) — so a retry on ANY instance, after a cold
// start or a lost response, replays / resumes / asks instead of creating a
// second creative + paused ad in a client's Meta account. The decisions are
// pure (decideAttempt in lib/adCopy/draft.ts); this module is the I/O.
//
// Stage writes are compare-and-set against the row as this request last saw
// it, so two requests holding one key (two instances, two tabs) can't both
// start the same create: the loser's claim fails before it calls Meta.
// ---------------------------------------------------------------------------

const PRUNE_AFTER_MS = 24 * 60 * 60_000;
const PRUNE_EVERY_MS = 10 * 60_000;
let lastPrune = 0;

const TABLE = "ad_copy_draft_attempts";
const BY_KEY = "admin_id = ? AND idempotency_key = ?";

function rowToAttempt(row: Row): StoredDraftAttempt {
  const text = (v: unknown) => (v == null ? null : String(v));
  return {
    accountId: String(row.account_id),
    fingerprint: String(row.fingerprint),
    imageHash: text(row.image_hash),
    creativeId: text(row.creative_id),
    adId: text(row.ad_id),
    stage: row.stage === "creative" || row.stage === "ad" ? row.stage : null,
    stageStartedAt: row.stage_started_at == null ? null : Number(row.stage_started_at),
  };
}

/** This request's writes to its attempt row. */
export interface DraftAttemptHandle {
  /** Mark `stage` started — false when the row changed since this request read it (another request is on it). */
  claim(stage: DraftStage): Promise<boolean>;
  /** The claimed create failed: definite → stage cleared; uncertain → stage kept, no longer in flight. */
  settle(uncertain: boolean): Promise<void>;
  recordImage(imageHash: string): Promise<void>;
  recordCreative(creativeId: string): Promise<void>;
  recordAd(adId: string): Promise<void>;
}

function attemptHandle(adminId: string, key: string, prev: StoredDraftAttempt | null): DraftAttemptHandle {
  const db = getDb();
  // The stage columns as this request last saw / wrote them.
  let seen = { stage: prev?.stage ?? null, startedAt: prev?.stageStartedAt ?? null };
  // `cas` (null = unguarded): also require the stage columns to still be what
  // this request last saw, plus any extra SQL conditions it carries.
  const write = async (set: string, args: InValue[], cas: string | null = null) => {
    const sql = `UPDATE ${TABLE} SET ${set}, updated_at = ? WHERE ${BY_KEY}${cas === null ? "" : ` AND stage IS ? AND stage_started_at IS ?${cas}`}`;
    const tail: InValue[] = cas === null ? [] : [seen.stage, seen.startedAt];
    const res = await db.execute({ sql, args: [...args, Date.now(), adminId, key, ...tail] });
    return res.rowsAffected === 1;
  };
  return {
    async claim(stage) {
      const now = Date.now();
      // Never start a create whose object another request has already recorded.
      const guard = stage === "creative" ? " AND ad_id IS NULL AND creative_id IS NULL" : " AND ad_id IS NULL";
      const ok = await write("stage = ?, stage_started_at = ?", [stage, now], guard);
      if (ok) seen = { stage, startedAt: now };
      return ok;
    },
    async settle(uncertain) {
      const next = { stage: uncertain ? seen.stage : null, startedAt: null };
      if (await write("stage = ?, stage_started_at = NULL", [next.stage], "")) seen = next;
    },
    async recordImage(imageHash) {
      await write("image_hash = ?", [imageHash]);
    },
    async recordCreative(creativeId) {
      if (await write("creative_id = ?, stage = NULL, stage_started_at = NULL", [creativeId])) seen = { stage: null, startedAt: null };
    },
    async recordAd(adId) {
      if (await write("ad_id = ?, stage = NULL, stage_started_at = NULL", [adId])) seen = { stage: null, startedAt: null };
    },
  };
}

/**
 * Load the attempt for (admin, key), creating its row when the key is new
 * (`prev` null). `fingerprint` is what decideAttempt compares the row to.
 */
export async function openDraftAttempt(
  adminId: string,
  key: string,
  input: DraftInput
): Promise<{ prev: StoredDraftAttempt | null; fingerprint: string; handle: DraftAttemptHandle }> {
  await ensureMigrated();
  const db = getDb();
  const now = Date.now();
  const fingerprint = createHash("sha256").update(draftFingerprint(input)).digest("hex");

  const inserted = await db.execute({
    sql: `INSERT OR IGNORE INTO ${TABLE} (admin_id, idempotency_key, account_id, fingerprint, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [adminId, key, input.accountId, fingerprint, now, now],
  });

  let prev: StoredDraftAttempt | null = null;
  if (inserted.rowsAffected === 0) {
    const existing = await db.execute({ sql: `SELECT * FROM ${TABLE} WHERE ${BY_KEY}`, args: [adminId, key] });
    if (!existing.rows[0]) throw new Error("draft attempt row disappeared");
    prev = rowToAttempt(existing.rows[0]);
  } else if (now - lastPrune > PRUNE_EVERY_MS) {
    // Opportunistic: attempts only matter for retries of the same draft.
    lastPrune = now;
    db.execute({ sql: `DELETE FROM ${TABLE} WHERE updated_at < ?`, args: [now - PRUNE_AFTER_MS] }).catch((err) =>
      console.error("[ad-copy] draft attempt prune failed:", err)
    );
  }
  return { prev, fingerprint, handle: attemptHandle(adminId, key, prev) };
}
