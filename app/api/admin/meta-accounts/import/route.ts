export const dynamic = "force-dynamic";
// Parsing + the bulk insert are CPU/IO heavy for big sheets — don't let the
// platform default cut a legitimate import short.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import { mapSpreadsheetToAccounts } from "@/lib/metaAccountImport";
import { bulkCreateMetaAccounts, listMetaAccountEmails } from "@/lib/metaAccounts";
import { listMetaAccountOptions } from "@/lib/metaAccountOptions";
import { logAuditEvent } from "@/lib/auditLog";

// Vercel serverless rejects request bodies over ~4.5 MB BEFORE the handler
// runs — keep our cap under it so users see this route's error, not a raw
// platform 413. (The import modal pre-checks file.size against the same cap.)
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
// Base64 is ~4/3 the byte size; reject the string BEFORE decoding so an
// oversized body never allocates the decoded Buffer.
const MAX_BASE64_CHARS = Math.ceil((MAX_BYTES * 4) / 3) + 4;

async function requireAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Read the uploaded file as a Buffer + batch label, from multipart or JSON. */
async function readUpload(
  request: Request
): Promise<{ buffer: Buffer; batch: string } | { error: string }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "No file provided" };
    if (file.size > MAX_BYTES) return { error: "File is too large (max 4 MB)" };
    const buffer = Buffer.from(await file.arrayBuffer());
    const batch = String(form.get("batch") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
    return { buffer, batch };
  }

  // JSON: { fileBase64, fileName?, batch? }
  try {
    const body = (await request.json()) as {
      fileBase64?: unknown;
      fileName?: unknown;
      batch?: unknown;
    };
    if (typeof body.fileBase64 !== "string" || !body.fileBase64)
      return { error: "fileBase64 is required" };
    if (body.fileBase64.length > MAX_BASE64_CHARS)
      return { error: "File is too large (max 4 MB)" };
    const buffer = Buffer.from(body.fileBase64, "base64");
    if (buffer.length > MAX_BYTES) return { error: "File is too large (max 4 MB)" };
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const batch =
      (typeof body.batch === "string" && body.batch.trim()) ||
      fileName.replace(/\.[^.]+$/, "") ||
      "Imported";
    return { buffer, batch };
  } catch {
    return { error: "Invalid request body" };
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();
  await ensureMigrated();

  const upload = await readUpload(request);
  if ("error" in upload) return NextResponse.json({ error: upload.error }, { status: 400 });

  let matrix: string[][];
  try {
    matrix = parseSpreadsheet(upload.buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not read the file";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Pass the stage vocabulary so sheet stage text resolves to the actual
  // option slugs (labels don't always slugify to the stored value).
  const stageOptions = await listMetaAccountOptions("stage");
  const mapped = mapSpreadsheetToAccounts(matrix, { batch: upload.batch, stageOptions });
  if (mapped.accounts.length === 0) {
    return NextResponse.json(
      {
        error:
          "No importable rows found. Make sure the first row is a header with at least an email column.",
        meta: { totalRows: mapped.totalRows, unmatchedHeaders: mapped.unmatchedHeaders },
      },
      { status: 400 }
    );
  }

  // De-dupe by FB email — against existing rows AND within this file — so
  // re-uploading an overlapping sheet doesn't create duplicate accounts.
  // (The unique fb_email index + INSERT OR IGNORE backstop the racy case.)
  const seen = await listMetaAccountEmails();
  const toInsert = [];
  let skippedDuplicate = 0;
  for (const account of mapped.accounts) {
    const email = (account.fbEmail ?? "").trim().toLowerCase();
    if (email && seen.has(email)) {
      skippedDuplicate++;
      continue;
    }
    if (email) seen.add(email);
    toInsert.push(account);
  }

  const imported = await bulkCreateMetaAccounts(toInsert);

  logAuditEvent({
    adminId: admin.id,
    adminUsername: admin.username,
    action: "meta_account.import",
    targetType: "meta_account",
    targetId: upload.batch,
    details: JSON.stringify({ batch: upload.batch, imported, skippedDuplicate, skippedEmpty: mapped.skipped }),
  }).catch(() => {});

  return NextResponse.json({
    data: {
      imported,
      skippedDuplicate,
      skippedEmpty: mapped.skipped,
      totalRows: mapped.totalRows,
      unmatchedHeaders: mapped.unmatchedHeaders,
      batch: upload.batch,
    },
  });
}
