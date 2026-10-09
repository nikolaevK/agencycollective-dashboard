import { randomUUID } from "crypto";
import sharp from "sharp";
import type { Row } from "@libsql/client";
import { getDb, ensureMigrated } from "./db";
import {
  ASSET_CHUNK_SIZE,
  chunkCountFor,
  expectedChunkLength,
  type AssetCategory,
  type AssetMediaType,
  type AssetSection,
  type AssetUploaderRole,
  type AssetVariant,
} from "./clientAssetRules";

// ---------------------------------------------------------------------------
// Client assets — portal "My Brand" + "Ad Creatives" (lib/db.ts:
// client_assets + client_asset_chunks). Metadata and bytes are split so a
// gallery listing is a pure index walk over small rows; bytes are only read
// one chunk per query:
//   original — the uploaded file in ASSET_CHUNK_SIZE pieces (seq 0..n-1),
//              streamed back chunk-by-chunk (bounded memory, HTTP Range)
//   thumb    — ≤480px-short-side WebP for grid tiles (seq 0)
//   preview  — ≤1600px WebP for the viewer, so phones never pull a 20 MB
//              original just to look at it (seq 0)
// Upload protocol: createUpload ('uploading' row) → putChunk × n →
// completeUpload (verify + derive variants → 'ready'). Abandoned uploads are
// swept per client on the next createUpload (before its quota check).
// ---------------------------------------------------------------------------

export interface ClientAsset {
  id: string;
  userId: string;
  section: AssetSection;
  category: AssetCategory;
  mediaType: AssetMediaType;
  title: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number;
  chunkSize: number;
  chunkCount: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasThumb: boolean;
  hasPreview: boolean;
  linkUrl: string | null;
  status: "uploading" | "ready";
  uploadedByRole: AssetUploaderRole;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

const META_COLUMNS = `id, user_id, section, category, media_type, title, file_name, mime_type,
  file_size, chunk_size, chunk_count, width, height, duration_ms, has_thumb, has_preview,
  link_url, status, uploaded_by_role, uploaded_by_id, uploaded_by_name, created_at`;

/** Abandoned 'uploading' rows older than this are swept. */
const STALE_UPLOAD_MS = 6 * 60 * 60 * 1000;
/** Other clients' abandoned uploads swept per upload start (bounded work). */
const GLOBAL_SWEEP_BATCH = 20;
/**
 * Decoded-pixel ceiling for thumbnailing: ~50 MP covers an 8K×6K camera
 * photo while bounding one decode at ~200 MB (PNG = 4 bytes/pixel) on a
 * shared function instance. Bigger images still upload — they keep their
 * dimensions and show a file tile instead of a thumbnail.
 */
const MAX_INPUT_PIXELS = 50_000_000;
/** Thumb: ≥480px on the short side (crisp 2× tiles), long side capped. */
const THUMB_SHORT_PX = 480;
const THUMB_LONG_MAX_PX = 1920;

function intOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function rowToAsset(row: Row): ClientAsset {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    section: String(row.section) as AssetSection,
    category: String(row.category) as AssetCategory,
    mediaType: String(row.media_type) as AssetMediaType,
    title: String(row.title),
    fileName: row.file_name != null ? String(row.file_name) : null,
    mimeType: row.mime_type != null ? String(row.mime_type) : null,
    fileSize: Number(row.file_size ?? 0),
    chunkSize: Number(row.chunk_size ?? 0),
    chunkCount: Number(row.chunk_count ?? 0),
    width: intOrNull(row.width),
    height: intOrNull(row.height),
    durationMs: intOrNull(row.duration_ms),
    hasThumb: Number(row.has_thumb) === 1,
    hasPreview: Number(row.has_preview) === 1,
    linkUrl: row.link_url != null ? String(row.link_url) : null,
    status: String(row.status) === "ready" ? "ready" : "uploading",
    uploadedByRole: String(row.uploaded_by_role) === "admin" ? "admin" : "client",
    uploadedById: row.uploaded_by_id != null ? String(row.uploaded_by_id) : null,
    uploadedByName: row.uploaded_by_name != null ? String(row.uploaded_by_name) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

function blobToBuffer(raw: unknown): Buffer | null {
  if (raw == null) return null;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  if (raw instanceof Uint8Array) return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  if (typeof raw === "string") return Buffer.from(raw, "base64");
  console.error("[clientAssets] Unexpected BLOB type:", typeof raw);
  return null;
}

// ── Cursor (keyset over created_at DESC, id DESC) ──────────────────────────

function encodeCursor(a: { createdAt: string; id: string }): string {
  return Buffer.from(`${a.createdAt}|${a.id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const i = raw.lastIndexOf("|");
    if (i <= 0) return null;
    return { createdAt: raw.slice(0, i), id: raw.slice(i + 1) };
  } catch {
    return null;
  }
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function listAssets(
  userId: string,
  section: AssetSection,
  opts: { mediaType?: AssetMediaType | null; cursor?: string | null; limit: number }
): Promise<{ items: ClientAsset[]; nextCursor: string | null }> {
  await ensureMigrated();
  const where = ["user_id = ?", "section = ?", "status = 'ready'"];
  const args: (string | number)[] = [userId, section];
  if (opts.mediaType) {
    where.push("media_type = ?");
    args.push(opts.mediaType);
  }
  const after = opts.cursor ? decodeCursor(opts.cursor) : null;
  if (after) {
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    args.push(after.createdAt, after.createdAt, after.id);
  }
  args.push(opts.limit + 1);
  const result = await getDb().execute({
    sql: `SELECT ${META_COLUMNS} FROM client_assets
          WHERE ${where.join(" AND ")}
          ORDER BY created_at DESC, id DESC
          LIMIT ?`,
    args,
  });
  const rows = result.rows.map(rowToAsset);
  const hasMore = rows.length > opts.limit;
  const items = hasMore ? rows.slice(0, opts.limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null };
}

/** Ready-asset counts per media type for one section (filter chips). */
export async function countAssetsByMediaType(
  userId: string,
  section: AssetSection
): Promise<Record<string, number>> {
  await ensureMigrated();
  const result = await getDb().execute({
    sql: `SELECT media_type, COUNT(*) AS n FROM client_assets
          WHERE user_id = ? AND section = ? AND status = 'ready'
          GROUP BY media_type`,
    args: [userId, section],
  });
  return Object.fromEntries(result.rows.map((r) => [String(r.media_type), Number(r.n)]));
}

/** One asset of one client (any status); null if missing or another client's. */
export async function findAsset(userId: string, id: string): Promise<ClientAsset | null> {
  await ensureMigrated();
  const result = await getDb().execute({
    sql: `SELECT ${META_COLUMNS} FROM client_assets WHERE id = ? AND user_id = ?`,
    args: [id, userId],
  });
  return result.rows[0] ? rowToAsset(result.rows[0]) : null;
}

async function readChunk(assetId: string, variant: AssetVariant, seq: number): Promise<Buffer | null> {
  const result = await getDb().execute({
    sql: "SELECT data FROM client_asset_chunks WHERE asset_id = ? AND variant = ? AND seq = ?",
    args: [assetId, variant, seq],
  });
  return result.rows[0] ? blobToBuffer(result.rows[0].data) : null;
}

/** A small single-chunk variant (thumb / preview). */
export async function readVariant(assetId: string, variant: "thumb" | "preview"): Promise<Buffer | null> {
  await ensureMigrated();
  return readChunk(assetId, variant, 0);
}

/**
 * Stream bytes [start, end] (inclusive) of an original, pulling ONE chunk row
 * per read — memory stays bounded at a single chunk whatever the file size.
 */
export function streamOriginal(asset: ClientAsset, start: number, end: number): ReadableStream<Uint8Array> {
  const size = asset.chunkSize;
  let seq = Math.floor(start / size);
  const last = Math.floor(end / size);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (seq > last) {
        controller.close();
        return;
      }
      try {
        const buf = await readChunk(asset.id, "original", seq);
        if (!buf) throw new Error(`missing chunk ${seq} of asset ${asset.id}`);
        const chunkStart = seq * size;
        const from = Math.max(0, start - chunkStart);
        const to = Math.min(buf.length, end - chunkStart + 1);
        controller.enqueue(new Uint8Array(buf.buffer, buf.byteOffset + from, to - from));
        seq++;
      } catch (err) {
        console.error("[clientAssets] stream failed:", err);
        controller.error(err);
      }
    },
  });
}

// ── Writes ─────────────────────────────────────────────────────────────────

export interface Uploader {
  role: AssetUploaderRole;
  id: string | null;
  name: string | null;
}

/**
 * Drop abandoned uploads (and their chunks). Best-effort, one transaction:
 * ALL of this client's (so they never hold quota hostage), then a bounded
 * batch of anyone else's — otherwise bytes left by a client who never
 * uploads again would sit in storage forever. Both seek the partial index
 * idx_client_assets_uploading; after the first pair runs, the batch
 * subquery is deterministic, so both of its statements hit the same rows.
 */
async function sweepStaleUploads(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
  const batch = `SELECT id FROM client_assets
                 WHERE status = 'uploading' AND created_at < ?
                 ORDER BY created_at, id LIMIT ${GLOBAL_SWEEP_BATCH}`;
  try {
    await getDb().batch(
      [
        {
          sql: `DELETE FROM client_asset_chunks WHERE asset_id IN (
                  SELECT id FROM client_assets
                  WHERE user_id = ? AND status = 'uploading' AND created_at < ?)`,
          args: [userId, cutoff],
        },
        {
          sql: `DELETE FROM client_assets
                WHERE user_id = ? AND status = 'uploading' AND created_at < ?`,
          args: [userId, cutoff],
        },
        { sql: `DELETE FROM client_asset_chunks WHERE asset_id IN (${batch})`, args: [cutoff] },
        { sql: `DELETE FROM client_assets WHERE id IN (${batch})`, args: [cutoff] },
      ],
      "write"
    );
  } catch (err) {
    console.error("[clientAssets] stale-upload sweep failed (non-fatal):", err);
  }
}

/**
 * Start an upload. `quotaBytes` (client uploads) caps the client's own
 * uploaded total — checked inside the INSERT so concurrent starts can't slip
 * past it together, and after the stale sweep so abandoned (invisible)
 * uploads never hold quota hostage. null = quota exceeded.
 */
export async function createUpload(input: {
  userId: string;
  section: AssetSection;
  category: AssetCategory;
  mediaType: Exclude<AssetMediaType, "link">;
  title: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploader: Uploader;
  quotaBytes: number | null;
}): Promise<ClientAsset | null> {
  await ensureMigrated();
  await sweepStaleUploads(input.userId);
  const id = randomUUID();
  const now = new Date().toISOString();
  const quota =
    input.quotaBytes == null
      ? { sql: "", args: [] }
      : {
          sql: `WHERE (SELECT COALESCE(SUM(file_size), 0) FROM client_assets
                       WHERE user_id = ? AND uploaded_by_role = 'client') + ? <= ?`,
          args: [input.userId, input.fileSize, input.quotaBytes],
        };
  const result = await getDb().execute({
    sql: `INSERT INTO client_assets
            (id, user_id, section, category, media_type, title, file_name, mime_type,
             file_size, chunk_size, chunk_count, status,
             uploaded_by_role, uploaded_by_id, uploaded_by_name, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?, ?, ?
          ${quota.sql}`,
    args: [
      id,
      input.userId,
      input.section,
      input.category,
      input.mediaType,
      input.title,
      input.fileName.slice(0, 300),
      input.mimeType,
      input.fileSize,
      ASSET_CHUNK_SIZE,
      chunkCountFor(input.fileSize, ASSET_CHUNK_SIZE),
      input.uploader.role,
      input.uploader.id,
      input.uploader.name,
      now,
      ...quota.args,
    ],
  });
  if (result.rowsAffected === 0) return null;
  return (await findAsset(input.userId, id))!;
}

export async function createLink(input: {
  userId: string;
  title: string;
  url: string;
  uploader: Uploader;
}): Promise<ClientAsset> {
  await ensureMigrated();
  const id = randomUUID();
  await getDb().execute({
    sql: `INSERT INTO client_assets
            (id, user_id, section, category, media_type, title, link_url, status,
             uploaded_by_role, uploaded_by_id, uploaded_by_name, created_at)
          VALUES (?, ?, 'brand', 'link', 'link', ?, ?, 'ready', ?, ?, ?, ?)`,
    args: [
      id,
      input.userId,
      input.title,
      input.url,
      input.uploader.role,
      input.uploader.id,
      input.uploader.name,
      new Date().toISOString(),
    ],
  });
  return (await findAsset(input.userId, id))!;
}

/**
 * Store one chunk of an in-progress upload. Idempotent per seq (a retried
 * PUT overwrites). The caller has already verified ownership + head bytes.
 */
export async function putChunk(
  asset: ClientAsset,
  seq: number,
  data: Buffer
): Promise<{ ok: true } | { ok: false; error: string }> {
  const expected = expectedChunkLength(asset.fileSize, asset.chunkSize, seq);
  if (expected < 0) return { ok: false, error: "Chunk index out of range" };
  if (data.length !== expected) {
    return { ok: false, error: `Chunk ${seq} must be ${expected} bytes (got ${data.length})` };
  }
  // Conditional on the upload still being in progress: a chunk racing a
  // delete (or landing after completion) must not orphan or alter bytes.
  const result = await getDb().execute({
    sql: `INSERT OR REPLACE INTO client_asset_chunks (asset_id, variant, seq, data)
          SELECT ?, 'original', ?, ?
          WHERE EXISTS (SELECT 1 FROM client_assets WHERE id = ? AND status = 'uploading')`,
    args: [asset.id, seq, data, asset.id],
  });
  if (result.rowsAffected === 0) return { ok: false, error: "Upload not found" };
  return { ok: true };
}

/** Whole original (images only — ≤25 MB), one chunk per query. */
async function readWholeOriginal(asset: ClientAsset): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (let seq = 0; seq < asset.chunkCount; seq++) {
    const buf = await readChunk(asset.id, "original", seq);
    if (!buf) throw new Error(`missing chunk ${seq} of asset ${asset.id}`);
    parts.push(buf);
  }
  return Buffer.concat(parts);
}

interface Derived {
  thumb: Buffer | null;
  preview: Buffer | null;
  width: number | null;
  height: number | null;
}

/**
 * thumb + preview WebP from an image (or a video poster frame). Each variant
 * is best-effort on its own — an image over the pixel ceiling, or one sharp
 * can't encode, still records its dimensions (metadata() never decodes).
 */
async function deriveVariants(input: Buffer, opts: { keepOriginalAsPreview: boolean }): Promise<Derived> {
  // Header-only read (no pixel decode), so it's safe without the cap — and
  // sharp's metadata() would otherwise reject an over-ceiling image too,
  // losing its real dimensions. Only the variant encodes below decode pixels.
  const meta = await sharp(input, { failOn: "none", limitInputPixels: false }).metadata();
  const base = sharp(input, { failOn: "none", limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  // metadata() reports pre-rotation dims; EXIF orientations 5–8 swap them.
  const swap = (meta.orientation ?? 1) >= 5;
  const width = (swap ? meta.height : meta.width) ?? null;
  const height = (swap ? meta.width : meta.height) ?? null;
  const out: Derived = { thumb: null, preview: null, width, height };

  if (width && height) {
    // Short side → 480px, but never let the long side run past the cap: an
    // extreme banner (30000×400) would otherwise blow past WebP's 16383px
    // limit. Tiles crop with object-cover, so a capped thumb still fills them.
    const scale = Math.min(
      1,
      THUMB_SHORT_PX / Math.min(width, height),
      THUMB_LONG_MAX_PX / Math.max(width, height)
    );
    try {
      out.thumb = await base
        .clone()
        .resize({ width: Math.max(1, Math.round(width * scale)) })
        .webp({ quality: 72 })
        .toBuffer();
    } catch (err) {
      console.error("[clientAssets] thumb failed (non-fatal):", err);
    }
  }
  if (!opts.keepOriginalAsPreview) {
    try {
      out.preview = await base
        .clone()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (err) {
      console.error("[clientAssets] preview failed (non-fatal):", err);
    }
  }
  return out;
}

/**
 * Verify every chunk landed, derive the thumb/preview variants and flip the
 * asset to 'ready'. Thumbnailing is best-effort — an image sharp can't read
 * still completes (it just shows a file tile). `poster` is an optional
 * browser-captured frame for videos; `video` carries its reported dims.
 */
export async function completeUpload(
  asset: ClientAsset,
  extras: { poster: Buffer | null; video: { width: number | null; height: number | null; durationMs: number | null } }
): Promise<{ ok: true; asset: ClientAsset } | { ok: false; error: string }> {
  if (asset.status === "ready") return { ok: true, asset };
  const db = getDb();
  const check = await db.execute({
    sql: `SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(data)), 0) AS bytes
          FROM client_asset_chunks WHERE asset_id = ? AND variant = 'original'`,
    args: [asset.id],
  });
  const n = Number(check.rows[0]?.n ?? 0);
  const bytes = Number(check.rows[0]?.bytes ?? 0);
  if (n !== asset.chunkCount || bytes !== asset.fileSize) {
    return { ok: false, error: `Upload incomplete (${n}/${asset.chunkCount} chunks)` };
  }

  let derived: Derived = { thumb: null, preview: null, width: null, height: null };
  let durationMs: number | null = null;
  try {
    if (asset.mediaType === "image") {
      // GIFs keep the original as their "preview" so the animation survives.
      derived = await deriveVariants(await readWholeOriginal(asset), {
        keepOriginalAsPreview: asset.mimeType === "image/gif",
      });
    } else if (asset.mediaType === "video") {
      if (extras.poster) derived = await deriveVariants(extras.poster, { keepOriginalAsPreview: false });
      derived.width = extras.video.width ?? derived.width;
      derived.height = extras.video.height ?? derived.height;
      durationMs = extras.video.durationMs;
    }
  } catch (err) {
    console.error(`[clientAssets] thumbnailing ${asset.id} failed (non-fatal):`, err);
    derived = { thumb: null, preview: null, width: null, height: null };
  }

  // Variants are written only while the asset row still exists — a delete
  // that raced the (slow) thumbnailing must not leave orphan chunk rows.
  const statements = [];
  const variantSql = (variant: "thumb" | "preview") =>
    `INSERT OR REPLACE INTO client_asset_chunks (asset_id, variant, seq, data)
     SELECT ?, '${variant}', 0, ? WHERE EXISTS (SELECT 1 FROM client_assets WHERE id = ?)`;
  if (derived.thumb) {
    statements.push({ sql: variantSql("thumb"), args: [asset.id, derived.thumb, asset.id] });
  }
  if (derived.preview) {
    statements.push({ sql: variantSql("preview"), args: [asset.id, derived.preview, asset.id] });
  }
  statements.push({
    sql: `UPDATE client_assets
          SET status = 'ready', width = ?, height = ?, duration_ms = ?,
              has_thumb = ?, has_preview = ?
          WHERE id = ?`,
    args: [
      derived.width,
      derived.height,
      durationMs,
      derived.thumb ? 1 : 0,
      derived.preview ? 1 : 0,
      asset.id,
    ],
  });
  await db.batch(statements, "write");
  const done = await findAsset(asset.userId, asset.id);
  return done ? { ok: true, asset: done } : { ok: false, error: "Upload not found" };
}

/** Delete an asset with all its bytes (one atomic batch). */
export async function deleteAsset(asset: ClientAsset): Promise<void> {
  await ensureMigrated();
  await getDb().batch(
    [
      { sql: "DELETE FROM client_asset_chunks WHERE asset_id = ?", args: [asset.id] },
      { sql: "DELETE FROM client_assets WHERE id = ? AND user_id = ?", args: [asset.id, asset.userId] },
    ],
    "write"
  );
}
