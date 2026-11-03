// ---------------------------------------------------------------------------
// Meta Accounts — PURE, db-free rules shared by the server writes
// (lib/metaAccounts.ts) and the directory UI, so "use client" code can import
// them without dragging lib/db into the browser bundle.
// ---------------------------------------------------------------------------

/** Account fields the directory renders as links (<a href>). */
export const META_ACCOUNT_LINK_FIELDS = ["profileLink", "twofaLink"] as const;
export type MetaAccountLinkField = (typeof META_ACCOUNT_LINK_FIELDS)[number];

export const META_ACCOUNT_LINK_LABELS: Record<MetaAccountLinkField, string> = {
  profileLink: "Profile link",
  twofaLink: "2FA link",
};

// A bare host with an optional port/path ("facebook.com/…", "www.facebook.com",
// "2fa.live/tok/…") — sheets often leave the scheme off.
const BARE_HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]|$)/i;

/**
 * The href for a link field: an http(s) URL as entered, a bare domain with
 * https:// added, or null when the value is not a web link (javascript:,
 * data:, mailto:, plain text like "N/A", …). Only a non-null result may ever
 * be rendered into an href — the URL parser here is the same WHATWG parser the
 * browser applies to the attribute, so the scheme it sees is the one checked.
 */
export function metaAccountLinkHref(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const candidate = BARE_HOST_RE.test(value)
    ? `https://${value}`
    : /^[a-z][a-z0-9+.-]*:/i.test(value)
      ? value
      : null;
  if (!candidate) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.hostname ? candidate : null;
}
