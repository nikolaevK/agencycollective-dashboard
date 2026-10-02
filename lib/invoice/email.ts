/**
 * Email + CC-list rules shared by every invoice/deal send surface (deal
 * invoice drawer, client re-bill drawer, ad-account drawer, deal form). The
 * surfaces had drifted: some trimmed, some didn't, some reported errors in a
 * banner far from the field, one silently dropped a pending CC. Pure — safe
 * on client and server.
 */

// No whitespace or address-syntax characters (`<>()[]\,;:"`): a pasted
// "Jane <jane@x.com>" must not commit "<jane@x.com>" as an address.
const ADDR_CHARS = '[^\\s@<>()[\\]\\\\,;:"]+';
/** One shared address rule (untrimmed input fails — trim first where wanted). */
export const EMAIL_RE = new RegExp(`^${ADDR_CHARS}@${ADDR_CHARS}\\.${ADDR_CHARS}$`);
const EMAIL_IN_TEXT_RE = new RegExp(`${ADDR_CHARS}@${ADDR_CHARS}\\.${ADDR_CHARS}`, "g");

export const DEFAULT_MAX_CC = 10;

export function isValidEmail(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && v.length <= 254 && EMAIL_RE.test(v);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Every address inside pasted text — "Jane Doe <jane@x.com>, bob@y.com",
 * a newline list, an Outlook "To:" line. Empty when the text holds none.
 */
export function extractEmails(text: string): string[] {
  return text.match(EMAIL_IN_TEXT_RE) ?? [];
}

/** Normalize a stored/seeded CC list: lowercase, valid, de-duplicated. */
export function normalizeCcList(list: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const v = normalizeEmail(raw);
    if (isValidEmail(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

export type CcCommitResult =
  | { ok: true; list: string[] }
  | { ok: false; error: string; code: "invalid" | "recipient" | "duplicate" | "max" };

/**
 * Add one address to a CC list. `exclude` holds addresses that must not be
 * CC'd (the primary recipient — the server drops those anyway, so we say so
 * instead of silently swallowing it).
 */
export function addCc(
  list: string[],
  raw: string,
  opts: { max?: number; exclude?: (string | null | undefined)[] } = {}
): CcCommitResult {
  const v = normalizeEmail(raw.replace(/[,;]+$/, ""));
  if (!v) return { ok: true, list };
  if (!isValidEmail(v)) return { ok: false, code: "invalid", error: `"${v}" is not a valid email` };
  const excluded = (opts.exclude ?? [])
    .filter((e): e is string => !!e)
    .map(normalizeEmail);
  if (excluded.includes(v)) return { ok: false, code: "recipient", error: "That's already the recipient" };
  if (list.includes(v)) return { ok: false, code: "duplicate", error: "Already added" };
  const max = opts.max ?? DEFAULT_MAX_CC;
  if (list.length >= max) return { ok: false, code: "max", error: `Maximum ${max} CCs` };
  return { ok: true, list: [...list, v] };
}

/**
 * Resolve the final CC list at send time: commits a typed-but-uncommitted
 * address so it isn't silently dropped, and fails (instead of dropping it)
 * when that pending text is invalid or over the cap.
 */
export function finalizeCcList(
  list: string[],
  pending: string,
  opts: { max?: number; exclude?: (string | null | undefined)[] } = {}
): CcCommitResult {
  if (!pending.trim()) return { ok: true, list };
  const res = addCc(list, pending, opts);
  if (res.ok) return res;
  // A pending duplicate / the recipient themself is harmless — that address
  // is already getting the email.
  if (res.code === "duplicate" || res.code === "recipient") return { ok: true, list };
  return { ...res, error: `Pending CC: ${res.error}. Fix or clear it before sending.` };
}
