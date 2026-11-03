/**
 * URL validation and safe external fetching (server-only).
 *
 * SSRF: every address a hostname resolves to is checked AT CONNECT TIME — a
 * custom `lookup` on the socket, the mechanism lib/publicImageFetch uses — so
 * DNS rebinding, an /etc/hosts entry, or a public A record next to a loopback
 * AAAA can't hand the socket a private address after a check passed.
 * IP-literal hosts skip DNS and are checked up front; every redirect hop is
 * re-validated; the body is byte-capped while it streams.
 *
 * HTML → text: one linear scanner (`scanHtml`) for every caller. The old
 * `<tag[^>]*>[\s\S]*?<\/tag>` / `<[^>]+>` regex passes were quadratic on
 * unclosed tags — 2 MB of "<script>" blocked the event loop for a minute.
 */

import http from "http";
import https from "https";
import dns from "dns";
import net from "net";
import zlib from "zlib";
import type { Readable } from "stream";
import { isPublicAddress } from "@/lib/publicImageFetch";

const BLOCKED_MESSAGE = "URLs pointing to private/internal networks are not allowed";

/** Error with a message that's safe to show (and hand to the model). */
export class LandingPageError extends Error {}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** dns.lookup that refuses to hand a non-public address to the socket (handles `all: true` from happy-eyeballs). */
function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options }, ((err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => {
    if (err) return callback(err, address, family);
    const ips = Array.isArray(address) ? address.map((a) => a.address) : [address];
    if (ips.length === 0 || !ips.every(isPublicAddress)) {
      return callback(Object.assign(new Error(BLOCKED_MESSAGE), { code: "EBLOCKED" }), address, family);
    }
    callback(null, address, family);
  }) as LookupCallback);
}

/**
 * Validates that a URL is safe to request: http(s) only, and an IP-literal
 * host must be public. Hostnames are checked when the socket connects
 * (`fetchPublicHtml`), not here — a check-then-fetch DNS lookup can be raced.
 */
export function validateExternalUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new LandingPageError("Invalid URL format");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LandingPageError("Only HTTP/HTTPS URLs are supported");
  }
  const literal = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(literal) && !isPublicAddress(literal)) throw new LandingPageError(BLOCKED_MESSAGE);
  return parsed.href;
}

/**
 * Sanitize a URL string for safe inclusion in text output.
 * Truncates and strips potentially dangerous characters.
 */
export function sanitizeUrlForDisplay(url: string): string {
  return url
    .slice(0, 200)
    .replace(/[^\w:/.?&=#%\-_~@+,;]/g, "");
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
/** Bytes read from a page (the landing-page report scores the page's size up to this). */
const MAX_HTML_BYTES = 2_000_000;
const USER_AGENT = "Mozilla/5.0 (compatible; AgencyCollective/1.0; +https://agencycollective.com)";

type HopResult = { redirect: string } | { status: number; html: string };

function getOnce(url: URL, deadline: number, signal?: AbortSignal): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      settle();
    };
    const fail = (message: string) => finish(() => reject(new LandingPageError(message)));

    const get = url.protocol === "https:" ? https.get : http.get;
    const req = get(
      url,
      {
        lookup: guardedLookup as unknown as net.LookupFunction,
        // No pooled sockets: every connection goes through the guarded lookup.
        agent: false,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
        },
        timeout: Math.max(1, deadline - Date.now()),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          const location = res.headers.location;
          res.destroy();
          if (!location) return fail(`The page redirected (HTTP ${status}) without a location.`);
          return finish(() => resolve({ redirect: location }));
        }
        if (status < 200 || status >= 300) {
          res.destroy();
          return fail(`The page answered HTTP ${status}.`);
        }
        const type = String(res.headers["content-type"] ?? "").toLowerCase();
        if (type && !/text\/html|application\/xhtml\+xml|text\/plain/.test(type)) {
          res.destroy();
          return fail(`The URL isn't a web page (${type.split(";")[0]}).`);
        }
        const encoding = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
        const body: Readable | null =
          !encoding || encoding === "identity"
            ? res
            : encoding === "gzip" || encoding === "x-gzip" || encoding === "deflate"
              ? res.pipe(zlib.createUnzip())
              : encoding === "br"
                ? res.pipe(zlib.createBrotliDecompress())
                : null;
        if (!body) {
          res.destroy();
          return fail(`The page used an unsupported encoding (${encoding}).`);
        }

        // Keep what fits; the rest of a huge page isn't needed for an audit.
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () => {
          res.destroy();
          if (body !== res) body.destroy();
          finish(() => resolve({ status, html: new TextDecoder().decode(Buffer.concat(chunks)) }));
        };
        body.on("data", (chunk: Buffer) => {
          if (settled) return;
          const room = MAX_HTML_BYTES - size;
          if (chunk.length >= room) {
            chunks.push(chunk.subarray(0, room));
            return done();
          }
          chunks.push(chunk);
          size += chunk.length;
        });
        body.on("end", done);
        body.on("error", () => fail("Couldn't read the page."));
      }
    );

    const timer = setTimeout(
      () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
      Math.max(1, deadline - Date.now())
    );
    const onAbort = () => req.destroy(Object.assign(new Error("aborted"), { code: "ABORT_ERR" }));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();

    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (err: NodeJS.ErrnoException) =>
      fail(
        err.code === "EBLOCKED"
          ? BLOCKED_MESSAGE
          : err.code === "ETIMEDOUT"
            ? "The page took too long to respond."
            : err.code === "ABORT_ERR"
              ? "The request was stopped."
              : err.code === "ENOTFOUND"
                ? `Could not resolve hostname: ${url.hostname}`
                : "Couldn't reach the page."
      )
    );
  });
}

/** GET a public HTML page, re-validating every redirect hop. Returns the final URL + HTML (≤ 2 MB). */
export async function fetchPublicHtml(rawUrl: string, signal?: AbortSignal): Promise<{ url: string; html: string; status: number }> {
  const deadline = Date.now() + TIMEOUT_MS;
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safeUrl = validateExternalUrl(current);
    if (Date.now() >= deadline) throw new LandingPageError("The page took too long to respond.");
    const result = await getOnce(new URL(safeUrl), deadline, signal);
    if ("redirect" in result) {
      current = new URL(result.redirect, safeUrl).toString();
      continue;
    }
    return { url: safeUrl, html: result.html, status: result.status };
  }
  throw new LandingPageError("The page redirected too many times.");
}

// ─── HTML → text ─────────────────────────────────────────────────────────────

/** Markup characters the scanner reads (script/style/comment bodies are skipped, not counted). */
export const MAX_HTML_CHARS = 300_000;
/** Text handed to the model (it sees up to this many characters of a page). */
export const MAX_PAGE_TEXT_CHARS = 12_000;

const RAW_TEXT_ELEMENTS = new Set(["script", "style", "noscript"]);
const TAG_NAME_RE = /\/?([a-zA-Z][a-zA-Z0-9:-]*)/y;

export interface HtmlVisitor {
  /** Text between tags (entities not decoded). */
  text?(text: string): void;
  /** An opening (or self-closing) tag, or a closing one; `attrs` is the raw text after the name. */
  tag?(name: string, attrs: string, closing: boolean): void;
  /** The body of a script / style / noscript element (never passed to `text`). */
  rawText?(name: string, text: string): void;
}

/** Start of the `</name` that closes a raw-text element, or -1. */
function findClosingTag(html: string, name: string, from: number): number {
  for (let p = html.indexOf("</", from); p !== -1; p = html.indexOf("</", p + 2)) {
    if (html.slice(p + 2, p + 2 + name.length).toLowerCase() !== name) continue;
    const after = html.charCodeAt(p + 2 + name.length);
    // ">", "/", whitespace or end of input — not "</scripts".
    if (Number.isNaN(after) || after === 62 || after === 47 || after === 32 || (after >= 9 && after <= 13)) return p;
  }
  return -1;
}

/**
 * Walk HTML once, in order, with indexOf-based scanning — linear time on any
 * input (unclosed tags, floods of "<", giant attributes). Comments and
 * <!doctype>/<?…?> are skipped; an unterminated tag ends the walk. Stops
 * after `maxChars` characters of text + tags.
 */
export function scanHtml(html: string, visit: HtmlVisitor, maxChars = MAX_HTML_CHARS): void {
  let budget = maxChars;
  let i = 0;
  while (i < html.length && budget > 0) {
    const lt = html.indexOf("<", i);
    const textEnd = lt === -1 ? html.length : lt;
    if (textEnd > i) {
      const text = html.slice(i, Math.min(textEnd, i + budget));
      budget -= text.length;
      visit.text?.(text);
      if (budget <= 0) return;
    }
    if (lt === -1) return;

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end === -1) return;
      i = end + 3;
      continue;
    }
    TAG_NAME_RE.lastIndex = lt + 1;
    const name = TAG_NAME_RE.exec(html);
    const next = html.charCodeAt(lt + 1);
    if (!name && next !== 33 /* ! */ && next !== 63 /* ? */) {
      // A bare "<" in text ("a < b").
      budget -= 1;
      visit.text?.("<");
      i = lt + 1;
      continue;
    }
    const gt = html.indexOf(">", lt + 1);
    if (gt === -1) return; // no ">" anywhere after this: nothing further can be markup
    i = gt + 1;
    budget -= gt + 1 - lt;
    if (budget < 0 || !name) continue; // over budget (loop ends), or <!doctype> / <?xml?>

    const tagName = name[1].toLowerCase();
    const closing = next === 47; /* / */
    if (!closing && RAW_TEXT_ELEMENTS.has(tagName)) {
      const end = findClosingTag(html, tagName, i);
      visit.rawText?.(tagName, html.slice(i, end === -1 ? html.length : end));
      if (end === -1) return; // an unclosed <script> swallows the rest, as in a browser
      const close = html.indexOf(">", end);
      if (close === -1) return;
      i = close + 1;
      continue;
    }
    visit.tag?.(tagName, html.slice(lt + 1 + name[0].length, gt), closing);
  }
}

const attrRes = new Map<string, RegExp>();

/** One attribute's value from a tag's raw attribute text (double-quoted, single-quoted or bare). */
export function attrOf(attrs: string, name: string): string | undefined {
  let re = attrRes.get(name);
  if (!re) {
    re = new RegExp(`(?:^|[\\s/])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
    attrRes.set(name, re);
  }
  const m = re.exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

const BLOCK_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "section", "li", "br", "tr"]);

type Capture = { name: "a" | "button" | "title"; at: number; href: string };

/**
 * Visible text + structure markers from HTML (pure): page title, meta
 * description, buttons, links, form fields, image alts; scripts and styles
 * dropped. Linear time on any input (see scanHtml).
 */
export function extractPageText(html: string, maxChars = MAX_PAGE_TEXT_CHARS): string {
  const out: string[] = [];
  // At most one open capture per kind — a nested second one is a plain tag,
  // as it was with the old non-greedy regexes — so wrapping stays linear.
  const open: Capture[] = [];

  const close = (name: Capture["name"]) => {
    const idx = open.findIndex((c) => c.name === name);
    if (idx === -1) return;
    const capture = open[idx];
    open.length = idx; // captures opened inside it and never closed stay unwrapped
    const inner = out.splice(capture.at).join("");
    out.push(
      name === "button"
        ? `\n[BUTTON: ${inner}]\n`
        : name === "a"
          ? `[LINK: ${inner} → ${capture.href}]`
          : `[PAGE TITLE: ${inner}]\n`
    );
  };

  scanHtml(html, {
    text: (t) => out.push(t),
    tag: (name, attrs, closing) => {
      if (closing) {
        if (name === "form") out.push("\n[FORM END]\n");
        else if (name === "a" || name === "button" || name === "title") close(name);
        return;
      }
      if (BLOCK_TAGS.has(name)) {
        out.push("\n");
      } else if (name === "a" || name === "button" || name === "title") {
        if (open.some((c) => c.name === name)) return;
        const href = name === "a" ? attrOf(attrs, "href") : "";
        if (href === undefined) return; // a link without an href is just its text
        open.push({ name, at: out.length, href });
      } else if (name === "input") {
        const placeholder = attrOf(attrs, "placeholder");
        const type = attrOf(attrs, "type");
        if (placeholder !== undefined) out.push(`[INPUT: ${placeholder}]`);
        else if (type !== undefined) out.push(`[FORM FIELD: ${type}]`);
      } else if (name === "form") {
        out.push("\n[FORM START]\n");
      } else if (name === "img") {
        const alt = attrOf(attrs, "alt");
        if (alt !== undefined) out.push(`[IMAGE: ${alt}]`);
      } else if (name === "meta" && attrOf(attrs, "name")?.toLowerCase() === "description") {
        const content = attrOf(attrs, "content");
        if (content !== undefined) out.push(`[META DESCRIPTION: ${content}]`);
      }
    },
  });

  return out
    .join("")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#\d+;/g, "")
    // Trailing spaces per line (a `/[ \t]+\n/` pass is quadratic on long runs of spaces).
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

/**
 * Fetch a URL and extract structured text content from HTML (client-portal
 * analyst). SSRF-guarded at connect time, every redirect hop re-validated,
 * body byte-capped; throws an Error with a displayable message.
 */
export async function fetchAndExtractPage(url: string): Promise<string> {
  const { html } = await fetchPublicHtml(url);
  return extractPageText(html);
}
