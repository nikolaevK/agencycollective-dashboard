import { NextResponse } from "next/server";
import { ok, fail, withCors } from "./respond";

/**
 * Shared file transfer for `/api/v1/*` — one place for the BLOB response
 * headers and the base64 JSON alternative that machine callers (MCP tools,
 * agents) use instead of raw bytes / multipart.
 *
 * Download: `respondBlob` serves raw bytes by default; `?format=base64`
 * returns the v1 envelope with { fileName, contentType, size, dataBase64 }.
 * Upload: `readUpload` accepts EITHER multipart/form-data (file field) OR
 * application/json with { fileBase64, fileName?, contentType?, ...fields }.
 */

export interface BlobFile {
  fileName: string;
  contentType: string;
  data: Buffer | Uint8Array;
  /** Force inline disposition (e.g. logos); default honors `?view=1`. */
  inline?: boolean;
}

/**
 * Serve stored file bytes. `?format=base64` returns JSON instead of a
 * stream; with it, optional `?maxBytes=N` fails 413 (metadata included)
 * rather than returning a payload larger than the caller can handle.
 */
export function respondBlob(request: Request, file: BlobFile): NextResponse {
  const url = new URL(request.url);
  const size = file.data.length;

  if (url.searchParams.get("format") === "base64") {
    const rawMax = Number(url.searchParams.get("maxBytes"));
    if (Number.isFinite(rawMax) && rawMax > 0 && size > rawMax) {
      return fail(
        "payload_too_large",
        `File is ${size} bytes, larger than maxBytes=${Math.floor(rawMax)}. Raise maxBytes or fetch the raw bytes without format=base64.`,
        413,
        { data: { fileName: file.fileName, contentType: file.contentType, size } }
      );
    }
    return ok({
      fileName: file.fileName,
      contentType: file.contentType,
      size,
      dataBase64: Buffer.from(file.data).toString("base64"),
    });
  }

  const inline = file.inline ?? url.searchParams.get("view") === "1";
  const encodedName = encodeURIComponent(file.fileName).replace(/['()]/g, escape);
  return withCors(
    new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(size),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  );
}

export interface UploadedFile {
  buffer: Buffer;
  name: string;
  /** Declared content type ("" when the caller sent none). */
  type: string;
}

export interface UploadPayload {
  /** The uploaded file, or null when none was provided. */
  file: UploadedFile | null;
  /** Non-file field accessor covering both form fields and JSON props. */
  get(name: string): string | null;
}

/** Bound the base64 string before decode (10 MB file ≈ 13.4 MB base64). */
const MAX_BASE64_CHARS = 20 * 1024 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Read an upload request body. Multipart callers send the file under
 * `fileField` (default "file"); JSON callers always send `fileBase64` (+
 * optional `fileName`, `contentType`) alongside the same non-file fields.
 * Returns null on an unreadable body; { file: null } when no file was sent.
 * Size caps and content validation stay in the route.
 */
export async function readUpload(
  request: Request,
  opts?: { fileField?: string }
): Promise<UploadPayload | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      body = parsed as Record<string, unknown>;
    } catch {
      return null;
    }

    let file: UploadedFile | null = null;
    if (typeof body.fileBase64 === "string" && body.fileBase64) {
      const b64 = body.fileBase64.replace(/^data:[^;,]*;base64,/, "").replace(/\s/g, "");
      if (b64.length > MAX_BASE64_CHARS || !BASE64_RE.test(b64)) return null;
      const buffer = Buffer.from(b64, "base64");
      if (buffer.length === 0) return null;
      file = {
        buffer,
        name:
          typeof body.fileName === "string" && body.fileName.trim()
            ? body.fileName.trim()
            : "upload",
        type: typeof body.contentType === "string" ? body.contentType : "",
      };
    }

    return {
      file,
      get: (name) => {
        const value = body[name];
        if (value === undefined || value === null) return null;
        // Match FormData semantics (strings), but keep JSON-native values
        // usable by routes that Number()/JSON.parse() their fields.
        return typeof value === "string" ? value : JSON.stringify(value);
      },
    };
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return null;
  const raw = formData.get(opts?.fileField ?? "file");
  const file =
    raw instanceof File && raw.size > 0
      ? { buffer: Buffer.from(await raw.arrayBuffer()), name: raw.name, type: raw.type }
      : null;
  return {
    file,
    get: (name) => {
      const value = formData.get(name);
      return value == null ? null : String(value);
    },
  };
}
