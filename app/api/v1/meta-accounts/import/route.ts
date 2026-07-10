export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Parsing + the bulk insert are CPU/IO heavy for big sheets.
export const maxDuration = 60;

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { readUpload } from "@/lib/api/files";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import { mapSpreadsheetToAccounts } from "@/lib/metaAccountImport";
import { bulkCreateMetaAccounts, listMetaAccountEmails } from "@/lib/metaAccounts";
import { listMetaAccountOptions } from "@/lib/metaAccountOptions";
import { logAuditEvent } from "@/lib/auditLog";

// Same cap as the admin route. Vercel rejects request bodies over ~4.5 MB
// before the handler runs, and base64 adds ~33% — so 4 MB is the honest
// ceiling a JSON fileBase64 upload can actually reach.
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

export function OPTIONS() {
  return corsPreflight();
}

/**
 * Bulk import from a spreadsheet (xlsx/csv). Same pipeline as the admin
 * import: header-matched columns, fb_email de-dupe against existing rows and
 * within the file. multipart/form-data (file, batch?) or application/json
 * with fileBase64 (+ fileName?, batch?).
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "metaaccounts:write");
  if (!auth.ok) return auth.response;

  try {
    const upload = await readUpload(request);
    if (!upload || !upload.file) return fail("invalid_request", "No file provided", 400);
    if (upload.file.buffer.length > MAX_BYTES) {
      return fail("payload_too_large", "File is too large (max 4 MB)", 413);
    }
    const batch =
      (upload.get("batch") ?? "").trim() ||
      upload.file.name.replace(/\.[^.]+$/, "") ||
      "Imported";

    let matrix: string[][];
    try {
      matrix = parseSpreadsheet(upload.file.buffer);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not read the file";
      return fail("invalid_request", msg, 400);
    }

    // Pass the stage vocabulary so sheet stage text resolves to actual slugs.
    const stageOptions = await listMetaAccountOptions("stage");
    const mapped = mapSpreadsheetToAccounts(matrix, { batch, stageOptions });
    if (mapped.accounts.length === 0) {
      return fail(
        "invalid_request",
        "No importable rows found. Make sure the first row is a header with at least an email column.",
        400,
        { data: { totalRows: mapped.totalRows, unmatchedHeaders: mapped.unmatchedHeaders } }
      );
    }

    // Emails only (not SELECT *) — the unique fb_email index + INSERT OR
    // IGNORE backstop the racy case.
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
      ...tokenAuditActor(auth.token),
      action: "meta_account.import",
      targetType: "meta_account",
      targetId: batch,
      details: JSON.stringify({ batch, imported, skippedDuplicate, skippedEmpty: mapped.skipped }),
    }).catch(() => {});

    return ok({
      imported,
      skippedDuplicate,
      skippedEmpty: mapped.skipped,
      totalRows: mapped.totalRows,
      unmatchedHeaders: mapped.unmatchedHeaders,
      batch,
    });
  } catch (err) {
    console.error("POST /api/v1/meta-accounts/import error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
