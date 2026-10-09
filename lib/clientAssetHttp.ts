import { NextResponse } from "next/server";
import { logAuditEvent } from "./auditLog";
import { readBodyCapped, readJsonCapped } from "./api/readBodyCapped";
import {
  CATEGORY_RULES,
  CLIENT_UPLOAD_QUOTA_BYTES,
  canDeleteAsset,
  canUploadTo,
  expectedChunkLength,
  formatBytes,
  isAssetCategory,
  isAssetSection,
  normalizeLinkUrl,
  parseRangeHeader,
  resolveMimeType,
  sniffMatches,
  titleFromFileName,
  validateUpload,
  type AssetMediaType,
  type AssetUploaderRole,
} from "./clientAssetRules";
import {
  completeUpload,
  countAssetsByMediaType,
  createLink,
  createUpload,
  deleteAsset,
  findAsset,
  listAssets,
  putChunk,
  readVariant,
  streamOriginal,
  type ClientAsset,
} from "./clientAssets";

// ---------------------------------------------------------------------------
// Request handlers shared by the two route trees over client assets:
//   /api/portal/assets/**                 (client session — acts on itself)
//   /api/admin/clients/[userId]/assets/** (admin, workspace-scoped per client)
// Routes authenticate, then delegate here with the resolved userId + actor,
// so both surfaces enforce identical rules (lib/clientAssetRules.ts):
// creatives are admin-only uploads; clients manage only their own My Brand
// uploads; bytes are sniffed against the declared type; downloads stream.
// ---------------------------------------------------------------------------

export interface AssetActor {
  role: AssetUploaderRole;
  id: string | null;
  /** Display name stamped on uploads. */
  name: string | null;
  /** Admin login name for the audit trail (admins only). */
  username?: string;
}

/** Run a handler; an unexpected throw becomes a logged 500. */
export async function handled(label: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[${label}]`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const LIST_DEFAULT = 48;
const LIST_MAX = 100;
/** A base64 video poster frame from the browser (decoded) — generous cap. */
const MAX_POSTER_BYTES = 2 * 1024 * 1024;
/** Body caps for the JSON endpoints (chunk PUTs are capped at their exact size). */
const CREATE_BODY_MAX = 16 * 1024;
const COMPLETE_BODY_MAX = Math.ceil((MAX_POSTER_BYTES * 4) / 3) + 16 * 1024;
const MEDIA_TYPES: AssetMediaType[] = ["image", "video", "pdf", "link"];
/** Asset bytes never change (a replacement is a new asset) → cache for good. */
const IMMUTABLE = "private, max-age=31536000, immutable";

/** JSON shape. Portal viewers see agency uploads as "Agency Collective". */
export function toAssetDto(asset: ClientAsset, viewer: AssetUploaderRole) {
  return {
    id: asset.id,
    section: asset.section,
    category: asset.category,
    mediaType: asset.mediaType,
    title: asset.title,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    hasThumb: asset.hasThumb,
    hasPreview: asset.hasPreview,
    linkUrl: asset.linkUrl,
    createdAt: asset.createdAt,
    uploadedByRole: asset.uploadedByRole,
    uploadedByName:
      viewer === "client" && asset.uploadedByRole === "admin"
        ? "Agency Collective"
        : asset.uploadedByName,
    canDelete: canDeleteAsset(viewer, asset),
  };
}

export type AssetDto = ReturnType<typeof toAssetDto>;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function audit(actor: AssetActor, action: string, userId: string, details: Record<string, unknown>) {
  if (actor.role !== "admin" || !actor.id) return;
  logAuditEvent({
    adminId: actor.id,
    adminUsername: actor.username ?? actor.name ?? actor.id,
    action,
    targetType: "client",
    targetId: userId,
    details: JSON.stringify(details),
  }).catch(() => {});
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** In-progress upload owned by this actor's side (client vs admin). */
async function findOwnUpload(userId: string, assetId: string, actor: AssetActor) {
  const asset = await findAsset(userId, assetId);
  if (!asset || asset.uploadedByRole !== actor.role) return null;
  return asset;
}

// ── GET list ───────────────────────────────────────────────────────────────

export async function listAssetsResponse(userId: string, request: Request, viewer: AssetUploaderRole) {
  const url = new URL(request.url);
  const section = url.searchParams.get("section");
  if (!isAssetSection(section)) return error("section must be 'brand' or 'creative'", 400);
  const typeParam = url.searchParams.get("type");
  const mediaType = MEDIA_TYPES.includes(typeParam as AssetMediaType) ? (typeParam as AssetMediaType) : null;
  const cursor = url.searchParams.get("cursor");
  const limitRaw = Number(url.searchParams.get("limit") ?? LIST_DEFAULT);
  const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), LIST_MAX) : LIST_DEFAULT;

  const [page, counts] = await Promise.all([
    listAssets(userId, section, { mediaType, cursor, limit }),
    cursor ? Promise.resolve(null) : countAssetsByMediaType(userId, section),
  ]);
  return NextResponse.json(
    {
      data: {
        items: page.items.map((a) => toAssetDto(a, viewer)),
        nextCursor: page.nextCursor,
        counts,
      },
    },
    { headers: { "Cache-Control": "private, no-cache" } }
  );
}

// ── POST create (start an upload, or add a link) ──────────────────────────

export async function createAssetResponse(userId: string, request: Request, actor: AssetActor) {
  const parsed = await readJsonCapped(request, CREATE_BODY_MAX);
  if (!parsed.ok) {
    return parsed.reason === "too_large" ? error("Request body too large", 413) : error("Invalid JSON body", 400);
  }
  if (!parsed.value || typeof parsed.value !== "object") return error("Invalid JSON body", 400);
  const body = parsed.value as Record<string, unknown>;
  const category = body.category;
  if (!isAssetCategory(category)) return error("Unknown category", 400);
  const section = CATEGORY_RULES[category].section;
  if (!canUploadTo(actor.role, section)) return error("Forbidden", 403);
  const uploader = { role: actor.role, id: actor.id, name: actor.name };

  if (category === "link") {
    const url = normalizeLinkUrl(body.url);
    if (!url) return error("Enter a valid http(s) link", 400);
    const title = text(body.title, 200) || new URL(url).hostname;
    const asset = await createLink({ userId, title, url, uploader });
    audit(actor, "client.asset_link_add", userId, { assetId: asset.id, title });
    return NextResponse.json({ data: { asset: toAssetDto(asset, actor.role) } }, { status: 201 });
  }

  const fileName = text(body.fileName, 300);
  if (!fileName) return error("fileName is required", 400);
  const mimeType = resolveMimeType(fileName, typeof body.mimeType === "string" ? body.mimeType : "");
  const fileSize = typeof body.fileSize === "number" ? body.fileSize : NaN;
  const check = validateUpload({ category, mimeType: mimeType ?? "", fileSize });
  if (!check.ok) return error(check.error, 400);

  const asset = await createUpload({
    userId,
    section,
    category,
    mediaType: check.mediaType,
    title: text(body.title, 200) || titleFromFileName(fileName),
    fileName,
    mimeType: mimeType!,
    fileSize,
    uploader,
    // Only the client's own uploads count against their storage quota.
    quotaBytes: actor.role === "client" ? CLIENT_UPLOAD_QUOTA_BYTES : null,
  });
  if (!asset) {
    return error(
      `Storage limit reached (${formatBytes(CLIENT_UPLOAD_QUOTA_BYTES)}). Remove older files or share a Google Drive link instead.`,
      413
    );
  }
  return NextResponse.json(
    {
      data: {
        asset: toAssetDto(asset, actor.role),
        chunkSize: asset.chunkSize,
        chunkCount: asset.chunkCount,
      },
    },
    { status: 201 }
  );
}

// ── PUT chunk ──────────────────────────────────────────────────────────────

export async function putChunkResponse(
  userId: string,
  assetId: string,
  seqParam: string,
  request: Request,
  actor: AssetActor
) {
  const asset = await findOwnUpload(userId, assetId, actor);
  if (!asset) return error("Upload not found", 404);
  if (asset.status !== "uploading") return error("Upload already completed", 409);
  const seq = Number(seqParam);
  if (!Number.isInteger(seq)) return error("Invalid chunk index", 400);

  const expected = expectedChunkLength(asset.fileSize, asset.chunkSize, seq);
  if (expected < 0) return error("Chunk index out of range", 400);
  // Never buffer more than this chunk can legitimately be.
  const data = await readBodyCapped(request, expected);
  if (!data) return error(`Chunk ${seq} must be ${expected} bytes`, 413);
  if (seq === 0 && !sniffMatches(asset.mimeType ?? "", data.subarray(0, 16))) {
    await deleteAsset(asset);
    return error("The file's contents don't match its type.", 400);
  }
  const result = await putChunk(asset, seq, data);
  if (!result.ok) return error(result.error, 400);
  return NextResponse.json({ data: { ok: true } });
}

// ── POST complete ──────────────────────────────────────────────────────────

function optionalInt(v: unknown, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= max ? v : null;
}

export async function completeAssetResponse(
  userId: string,
  assetId: string,
  request: Request,
  actor: AssetActor
) {
  const asset = await findOwnUpload(userId, assetId, actor);
  if (!asset) return error("Upload not found", 404);

  const parsed = await readJsonCapped(request, COMPLETE_BODY_MAX);
  if (!parsed.ok && parsed.reason === "too_large") return error("Request body too large", 413);
  // No body is fine — only video uploads send a poster.
  const body: Record<string, unknown> =
    parsed.ok && parsed.value && typeof parsed.value === "object"
      ? (parsed.value as Record<string, unknown>)
      : {};
  let poster: Buffer | null = null;
  if (asset.mediaType === "video" && typeof body.posterBase64 === "string") {
    const buf = Buffer.from(body.posterBase64, "base64");
    if (buf.length > 0 && buf.length <= MAX_POSTER_BYTES) poster = buf;
  }

  const result = await completeUpload(asset, {
    poster,
    video: {
      width: optionalInt(body.width, 20_000),
      height: optionalInt(body.height, 20_000),
      durationMs: optionalInt(body.durationMs, 24 * 60 * 60 * 1000),
    },
  });
  if (!result.ok) return error(result.error, 400);
  if (asset.status !== "ready") {
    audit(actor, "client.asset_upload", userId, {
      assetId: asset.id,
      section: asset.section,
      category: asset.category,
      title: asset.title,
      fileSize: asset.fileSize,
    });
  }
  return NextResponse.json({ data: { asset: toAssetDto(result.asset, actor.role) } });
}

// ── GET file bytes ─────────────────────────────────────────────────────────

function contentDisposition(kind: "inline" | "attachment", fileName: string): string {
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_");
  return `${kind}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function assetFileResponse(userId: string, assetId: string, request: Request) {
  const asset = await findAsset(userId, assetId);
  if (!asset || asset.status !== "ready" || asset.mediaType === "link") {
    return error("File not found", 404);
  }
  const url = new URL(request.url);
  const variantParam = url.searchParams.get("variant");
  const variant = variantParam === "thumb" || variantParam === "preview" ? variantParam : "original";
  const etag = `"${asset.id}-${variant}"`;
  // Images/videos are rendered, never executed — lock the response down.
  // (Not for PDFs: Chrome's viewer refuses to run in a sandboxed document.)
  const lockdown: Record<string, string> =
    asset.mediaType === "pdf" && variant === "original"
      ? {}
      : { "Content-Security-Policy": "default-src 'none'; sandbox" };

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": IMMUTABLE } });
  }

  if (variant !== "original") {
    const data = await readVariant(asset.id, variant);
    if (!data) return error("File not found", 404);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(data.length),
        "Cache-Control": IMMUTABLE,
        ETag: etag,
        ...lockdown,
      },
    });
  }

  const size = asset.fileSize;
  const disposition = contentDisposition(
    url.searchParams.get("download") === "1" ? "attachment" : "inline",
    asset.fileName ?? asset.title
  );
  const common = {
    "Content-Type": asset.mimeType ?? "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": IMMUTABLE,
    "Content-Disposition": disposition,
    ETag: etag,
    ...lockdown,
  };
  const range = parseRangeHeader(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  if (range) {
    return new NextResponse(streamOriginal(asset, range.start, range.end), {
      status: 206,
      headers: {
        ...common,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }
  return new NextResponse(streamOriginal(asset, 0, size - 1), {
    headers: { ...common, "Content-Length": String(size) },
  });
}

// ── DELETE ─────────────────────────────────────────────────────────────────

export async function deleteAssetResponse(userId: string, assetId: string, actor: AssetActor) {
  const asset = await findAsset(userId, assetId);
  if (!asset) return error("File not found", 404);
  if (!canDeleteAsset(actor.role, asset)) return error("Forbidden", 403);
  await deleteAsset(asset);
  if (asset.status === "ready") {
    audit(actor, "client.asset_delete", userId, {
      assetId: asset.id,
      section: asset.section,
      title: asset.title,
    });
  }
  return NextResponse.json({ data: { ok: true } });
}
