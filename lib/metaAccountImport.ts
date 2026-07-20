import type { MetaAccountInput } from "./metaAccounts";

// ---------------------------------------------------------------------------
// Import mapper — turns a spreadsheet matrix (lib/spreadsheet.ts) into
// MetaAccountInput rows. Columns are matched by HEADER NAME (normalized,
// keyword-based) rather than fixed positions, so it handles BOTH the sheets we
// have today ("50 Pcs Old FB 2017" and "2nd Round - Harvested Accounts") and
// future rounds regardless of column order. A row with no FB email is skipped.
// ---------------------------------------------------------------------------

/** Where a spreadsheet column maps: a MetaAccountInput field or a special case. */
type Target =
  | "fbEmail"
  | "fbPassword"
  | "twofaSecret"
  | "twofaLink"
  | "mailPassword"
  | "recoveryEmail"
  | "profileName"
  | "profileLink"
  | "bmId"
  | "bmMade"
  | "pageMade"
  | "adAccountMade"
  | "cardAdded"
  | "login" // free-text "Log In Successful?" → boolean (+ note / not-found status)
  | "attempted"
  | "assignee"
  | "stageRaw"
  | null;

function norm(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** First matching rule wins — specific headers must precede generic ones. */
function resolveTarget(header: string): Target {
  const h = norm(header);
  if (!h) return null;
  if (h.includes("2fa") && (h.includes("link") || h.includes("generate"))) return "twofaLink";
  if (h.includes("2fa")) return "twofaSecret";
  if (h.includes("mail password")) return "mailPassword";
  if (h.includes("recov")) return "recoveryEmail"; // recovary / recovery
  if (h.includes("profile") && h.includes("name")) return "profileName"; // before generic "profile"
  if (h.includes("profile")) return "profileLink";
  if (h.includes("bm id")) return "bmId";
  if (h.includes("bm") && h.includes("made")) return "bmMade";
  if (h.includes("page")) return "pageMade";
  if (h.includes("ad acc") || (h.includes("ad") && h.includes("account"))) return "adAccountMade";
  if (h.includes("card")) return "cardAdded";
  // Before "login": credential sheets often head the account-email column
  // "Login Email" (or just "Login") — an email-ish header is the email.
  if (h.includes("email")) return "fbEmail"; // after "recov"/"2fa"
  // Before "login": "Attempted login?" is about the attempt, not success.
  if (h.includes("attempt")) return "attempted";
  if (h.includes("log in") || h.includes("login") || h.includes("logged")) return "login";
  if (h.includes("access")) return "assignee";
  if (h.includes("stage")) return "stageRaw";
  if (h.includes("password")) return "fbPassword"; // after "mail password"
  return null;
}

function isYes(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  // "1" also covers real XLSX boolean/numeric cells, which parseSpreadsheet
  // returns as their raw "1"/"0" string form.
  return (
    v.startsWith("yes") || v === "y" || v === "true" || v === "1" ||
    v === "x" || v === "✓" || v === "✔" || v === "done"
  );
}

/**
 * Match sheet stage text against the option vocabulary — by label or slug —
 * so free-text like "Engagement Warm-Up" lands on the seeded slug
 * ("engagement-warmup") even when blind slugification wouldn't reproduce it.
 * Unknown stages fall back to the slugified text.
 */
function resolveStageSlug(
  raw: string,
  options?: ReadonlyArray<{ value: string; label: string }>
): string {
  const n = norm(raw);
  if (!n) return "";
  const slug = n.replace(/ /g, "-");
  for (const o of options ?? []) {
    if (norm(o.label) === n || o.value === slug) return o.value;
  }
  return slug;
}

export interface ImportResult {
  accounts: MetaAccountInput[];
  totalRows: number; // data rows seen (excluding header)
  imported: number;
  skipped: number; // rows with no FB email
  unmatchedHeaders: string[];
}

/**
 * Map a parsed spreadsheet matrix (row 0 = headers) to account inputs.
 * `batch` labels the import (e.g. the file name) so rows keep their provenance.
 */
export function mapSpreadsheetToAccounts(
  matrix: string[][],
  opts: { batch?: string; stageOptions?: ReadonlyArray<{ value: string; label: string }> } = {}
): ImportResult {
  const batch = opts.batch?.trim() || null;
  if (matrix.length < 2) {
    return { accounts: [], totalRows: 0, imported: 0, skipped: 0, unmatchedHeaders: [] };
  }

  const header = matrix[0];
  const targets = header.map(resolveTarget);
  const unmatchedHeaders = header
    .filter((h, i) => h.trim() !== "" && targets[i] === null)
    .map((h) => h.trim());

  const accounts: MetaAccountInput[] = [];
  let skipped = 0;
  let totalRows = 0;

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row.some((c) => c.trim() !== "")) continue; // wholly blank row
    totalRows++;

    const input: MetaAccountInput = { batch: batch ?? undefined };
    const noteParts: string[] = [];

    for (let c = 0; c < targets.length; c++) {
      const target = targets[c];
      if (!target) continue;
      const raw = (row[c] ?? "").trim();
      if (!raw) continue;

      switch (target) {
        case "fbEmail":
          input.fbEmail = raw;
          break;
        case "fbPassword":
          input.fbPassword = raw;
          break;
        case "twofaSecret":
          input.twofaSecret = raw;
          break;
        case "twofaLink":
          input.twofaLink = raw;
          break;
        case "mailPassword":
          input.mailPassword = raw;
          break;
        case "recoveryEmail":
          input.recoveryEmail = raw;
          break;
        case "profileName":
          input.profileName = raw;
          break;
        case "profileLink":
          input.profileLink = raw;
          break;
        case "bmId":
          input.bmId = raw;
          break;
        case "bmMade":
          input.bmMade = isYes(raw);
          break;
        case "pageMade":
          input.pageMade = isYes(raw);
          break;
        case "adAccountMade":
          input.adAccountMade = isYes(raw);
          break;
        case "cardAdded":
          input.cardAdded = isYes(raw);
          break;
        case "assignee":
          input.assignee = raw;
          break;
        case "stageRaw": {
          const slug = resolveStageSlug(raw, opts.stageOptions);
          if (slug) input.stage = slug;
          break;
        }
        case "login": {
          if (/not\s*found/i.test(raw)) {
            input.status = "account-not-found";
            noteParts.push(`Login: ${raw}`);
          } else if (isYes(raw)) {
            input.loginOk = true;
            // Keep any extra context (e.g. "Yes, Day 1 6/20") that a plain flag drops.
            if (raw.length > 4 || /\d/.test(raw)) noteParts.push(`Login: ${raw}`);
          } else {
            noteParts.push(`Login: ${raw}`);
          }
          break;
        }
        case "attempted":
          // Attempted ≠ succeeded, so it never sets loginOk — but the value
          // (including "Yes") is context worth keeping.
          noteParts.push(`Attempted: ${raw}`);
          break;
      }
    }

    // An account row must have an email-shaped value. This drops trailing
    // notes/instruction blocks some sheets append (e.g. "Login Instructions:"
    // lines that land in the email column but aren't accounts).
    const email = (input.fbEmail ?? "").trim();
    if (!email || !email.includes("@")) {
      skipped++;
      continue;
    }

    // Derive a starting stage when the sheet didn't specify one, from how far
    // setup has progressed (matches the seeded stage slugs).
    if (!input.stage) {
      if (input.cardAdded) input.stage = "card-added";
      else if (input.bmMade || input.adAccountMade || input.pageMade || input.loginOk) input.stage = "setup";
      else input.stage = "harvested";
    }

    if (noteParts.length) input.notes = noteParts.join(" · ");
    accounts.push(input);
  }

  return {
    accounts,
    totalRows,
    imported: accounts.length,
    skipped,
    unmatchedHeaders,
  };
}
