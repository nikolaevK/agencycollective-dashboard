// ---------------------------------------------------------------------------
// Client assets — the PURE rules (no db / sharp imports), shared by the
// browser uploader and the server: sections + categories, the MIME allowlist,
// size caps, magic-byte sniffing, chunk math and HTTP Range parsing.
// ---------------------------------------------------------------------------

export type AssetSection = "brand" | "creative";
/** brand_book / product_photo / link live in 'brand'; creative in 'creative'. */
export type AssetCategory = "brand_book" | "product_photo" | "link" | "creative";
export type AssetMediaType = "image" | "video" | "pdf" | "link";
export type AssetVariant = "original" | "preview" | "thumb";
export type AssetUploaderRole = "client" | "admin";

/** Raw chunk size for originals: well under Vercel's 4.5 MB request cap. */
export const ASSET_CHUNK_SIZE = 3 * 1024 * 1024;

const MB = 1024 * 1024;
export const MAX_ASSET_BYTES: Record<Exclude<AssetMediaType, "link">, number> = {
  image: 25 * MB,
  pdf: 25 * MB,
  video: 100 * MB,
};

/** Total bytes a client may upload themselves (admin uploads don't count). */
export const CLIENT_UPLOAD_QUOTA_BYTES = 500 * MB;

export const MIME_MEDIA_TYPES: Record<string, Exclude<AssetMediaType, "link">> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "pdf",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
};

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export const CATEGORY_RULES: Record<
  AssetCategory,
  { section: AssetSection; media: AssetMediaType[]; label: string }
> = {
  brand_book: { section: "brand", media: ["pdf", "image"], label: "Brand book" },
  product_photo: { section: "brand", media: ["image"], label: "Product photos" },
  link: { section: "brand", media: ["link"], label: "Links" },
  creative: { section: "creative", media: ["image", "video", "pdf"], label: "Ad creatives" },
};

export function isAssetSection(v: unknown): v is AssetSection {
  return v === "brand" || v === "creative";
}

export function isAssetCategory(v: unknown): v is AssetCategory {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CATEGORY_RULES, v);
}

/** Only creatives are admin-only; clients and admins both manage 'brand'. */
export function canUploadTo(role: AssetUploaderRole, section: AssetSection): boolean {
  return role === "admin" || section === "brand";
}

/**
 * Who may delete an asset: admins anything in scope; clients only what they
 * uploaded themselves in My Brand (never agency-provided brand files or
 * creatives).
 */
export function canDeleteAsset(
  role: AssetUploaderRole,
  asset: { section: AssetSection; uploadedByRole: AssetUploaderRole }
): boolean {
  if (role === "admin") return true;
  return asset.section === "brand" && asset.uploadedByRole === "client";
}

/** The browser's File.type, else a guess from the extension; null = not allowed. */
export function resolveMimeType(fileName: string, browserType: string): string | null {
  if (MIME_MEDIA_TYPES[browserType]) return browserType;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME[ext] ?? null;
}

/** `accept` attribute for a category's file input. */
export function acceptFor(category: AssetCategory): string {
  const media = CATEGORY_RULES[category].media;
  return Object.entries(MIME_MEDIA_TYPES)
    .filter(([, m]) => media.includes(m))
    .map(([mime]) => mime)
    .join(",");
}

/**
 * Validate a declared upload. Returns the media type, or an error message
 * meant for the person uploading.
 */
export function validateUpload(input: {
  category: AssetCategory;
  mimeType: string;
  fileSize: number;
}): { ok: true; mediaType: Exclude<AssetMediaType, "link"> } | { ok: false; error: string } {
  const mediaType = MIME_MEDIA_TYPES[input.mimeType];
  if (!mediaType || !CATEGORY_RULES[input.category].media.includes(mediaType)) {
    const allowed = CATEGORY_RULES[input.category].media
      .filter((m) => m !== "link")
      .map((m) => (m === "pdf" ? "PDF" : `${m}s`))
      .join(", ");
    return { ok: false, error: `This file type isn't supported here. Allowed: ${allowed}.` };
  }
  if (!Number.isInteger(input.fileSize) || input.fileSize <= 0) {
    return { ok: false, error: "The file is empty." };
  }
  const max = MAX_ASSET_BYTES[mediaType];
  if (input.fileSize > max) {
    return { ok: false, error: `Too large — ${mediaType === "pdf" ? "PDFs" : `${mediaType}s`} can be up to ${max / MB} MB.` };
  }
  return { ok: true, mediaType };
}

function ascii(bytes: Uint8Array, start: number, len: number): string {
  let s = "";
  for (let i = start; i < start + len && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** ISO-BMFF top-level boxes an MP4 / MOV can open with. */
const BMFF_BOXES = new Set(["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"]);

/**
 * Magic-byte check of the first bytes against the declared MIME type, so a
 * renamed HTML/SVG file can never be stored and served as an "image".
 */
export function sniffMatches(mimeType: string, head: Uint8Array): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return ascii(head, 1, 3) === "PNG" && head[0] === 0x89;
    case "image/gif":
      return ascii(head, 0, 6) === "GIF87a" || ascii(head, 0, 6) === "GIF89a";
    case "image/webp":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP";
    case "application/pdf":
      return ascii(head, 0, 5) === "%PDF-";
    case "video/mp4":
    case "video/quicktime":
      return BMFF_BOXES.has(ascii(head, 4, 4));
    case "video/webm":
      return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    default:
      return false;
  }
}

export function chunkCountFor(fileSize: number, chunkSize: number): number {
  return Math.ceil(fileSize / chunkSize);
}

/** Exact byte length chunk `seq` must have (the last one is the remainder). */
export function expectedChunkLength(fileSize: number, chunkSize: number, seq: number): number {
  const count = chunkCountFor(fileSize, chunkSize);
  if (!Number.isInteger(seq) || seq < 0 || seq >= count) return -1;
  return seq === count - 1 ? fileSize - seq * chunkSize : chunkSize;
}

/**
 * Parse a single-range `Range: bytes=…` header against a file size.
 * null = absent / malformed / multi-range (serve the whole file, 200);
 * "unsatisfiable" = 416; else the inclusive byte window.
 */
export function parseRangeHeader(
  header: string | null,
  size: number
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (size <= 0) return "unsatisfiable";
  if (m[1] === "") {
    // Suffix range: the last N bytes.
    const n = Number(m[2]);
    if (n <= 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}

/** http(s) only; a bare domain gets https://. null = not a usable link. */
export function normalizeLinkUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > 2000) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Title from a file name: extension dropped, separators spaced. */
export function titleFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^./]+$/, "");
  return (stem.replace(/[_]+/g, " ").trim() || fileName).slice(0, 200);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

export function formatDuration(ms: number | null): string {
  if (!ms || ms < 0) return "";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
