// Figma embed helpers. We store the raw Figma share link an admin pastes and
// build the iframe `src` at render time.
//
// We use Embed Kit 1.0 (`https://www.figma.com/embed?embed_host=...&url=<enc>`)
// as the universal wrapper. It needs NO OAuth client-id and renders every
// standard link type — design, file, FigJam board, AND prototype — by handing
// Figma the original URL to resolve. Embed Kit 2.0 (`embed.figma.com/...`) is
// newer but, for PROTOTYPES, requires a registered OAuth app + a `client-id`
// query param (per Figma's embed docs), so making it the default would BREAK
// prototype embeds for us. A link an admin pastes that is ALREADY an embed URL
// is reused as-is (with `embed-host` ensured) so a hand-built 2.0 URL — incl.
// one carrying a `client-id` for a prototype — still works.
//
// CSP note: rendering these requires `https://www.figma.com` and
// `https://embed.figma.com` in the `frame-src` directive (see next.config.js).

const FIGMA_EMBED_HOST = "share";

/** True for any http(s) URL on figma.com (or a subdomain). */
export function isFigmaUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return host === "figma.com" || host.endsWith(".figma.com");
  } catch {
    return false;
  }
}

/**
 * Turn a raw Figma link into an embeddable iframe `src`:
 *  - an `embed.figma.com` URL is reused as-is, ensuring `embed-host` is set
 *    (Embed Kit 2.0 won't render without it) and preserving any `client-id`;
 *  - a legacy `.../embed` URL is reused verbatim;
 *  - anything else is wrapped with the OAuth-free Embed Kit 1.0 endpoint, which
 *    handles design / file / board / prototype links uniformly.
 */
export function toFigmaEmbedUrl(raw: string): string {
  const url = raw.trim();
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "embed.figma.com") {
      if (!u.searchParams.has("embed-host")) {
        u.searchParams.set("embed-host", FIGMA_EMBED_HOST);
      }
      return u.toString();
    }
    if (u.pathname.startsWith("/embed")) {
      return url; // already a 1.0 embed endpoint
    }
  } catch {
    // Malformed — fall through and wrap; the value is validated on write, so
    // this only guards against unexpected stored data.
  }
  return `https://www.figma.com/embed?embed_host=${FIGMA_EMBED_HOST}&url=${encodeURIComponent(url)}`;
}
