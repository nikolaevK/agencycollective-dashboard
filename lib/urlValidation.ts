/**
 * URL validation and safe external fetching.
 * Prevents SSRF by rejecting private/internal IP ranges.
 */

import { resolve } from "dns/promises";

const PRIVATE_IP_RANGES = [
  /^127\./,                          // 127.0.0.0/8 (loopback)
  /^10\./,                           // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./,     // 172.16.0.0/12
  /^192\.168\./,                     // 192.168.0.0/16
  /^169\.254\./,                     // 169.254.0.0/16 (link-local / cloud metadata)
  /^0\./,                            // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 (CGN)
  /^::1$/,                           // IPv6 loopback
  /^f[cd]/i,                         // fc00::/7 (IPv6 private)
  /^fe80:/i,                         // fe80::/10 (IPv6 link-local)
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((re) => re.test(ip));
}

/**
 * Validates that a URL is safe for server-side fetching.
 * Rejects private IPs, non-HTTP(S) schemes, and resolves hostname to check IP.
 */
export async function validateExternalUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP/HTTPS URLs are supported");
  }

  // Check if hostname is already an IP
  const hostname = parsed.hostname;
  if (isPrivateIp(hostname)) {
    throw new Error("URLs pointing to private/internal networks are not allowed");
  }

  // Resolve hostname to IP and check
  try {
    const addresses = await resolve(hostname);
    for (const ip of addresses) {
      if (isPrivateIp(ip)) {
        throw new Error("URLs pointing to private/internal networks are not allowed");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("private")) throw err;
    // DNS resolution failed — hostname might not exist
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }

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

const HTML_STRIP_PATTERNS = [
  { pattern: "<script[^>]*>[\\s\\S]*?<\\/script>", replacement: "" },
  { pattern: "<style[^>]*>[\\s\\S]*?<\\/style>", replacement: "" },
  { pattern: "<(h[1-6]|p|div|section|li|br|tr)[^>]*>", replacement: "\n" },
  { pattern: "<button[^>]*>([\\s\\S]*?)<\\/button>", replacement: "\n[BUTTON: $1]\n" },
  { pattern: '<a[^>]*href="([^"]*)"[^>]*>([\\s\\S]*?)<\\/a>', replacement: "[LINK: $2 → $1]" },
  { pattern: '<input[^>]*placeholder="([^"]*)"[^>]*\\/?>', replacement: "[INPUT: $1]" },
  { pattern: '<input[^>]*type="([^"]*)"[^>]*\\/?>', replacement: "[FORM FIELD: $1]" },
  { pattern: "<form[^>]*>", replacement: "\n[FORM START]\n" },
  { pattern: "<\\/form>", replacement: "\n[FORM END]\n" },
  { pattern: '<img[^>]*alt="([^"]*)"[^>]*>', replacement: "[IMAGE: $1]" },
  { pattern: '<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>', replacement: "[META DESCRIPTION: $1]" },
  { pattern: "<title[^>]*>([\\s\\S]*?)<\\/title>", replacement: "[PAGE TITLE: $1]\n" },
  { pattern: "<[^>]+>", replacement: "" },
];

/**
 * Fetch a URL and extract structured text content from HTML.
 * Includes SSRF protection and content size limits.
 */
export async function fetchAndExtractPage(url: string): Promise<string> {
  const safeUrl = await validateExternalUrl(url);

  const res = await fetch(safeUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AgencyCollective/1.0; +https://agencycollective.com)",
      "Accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch page: HTTP ${res.status}`);
  }

  let html = await res.text();
  // Cap raw HTML to 2MB before processing to prevent regex DoS
  if (html.length > 2_000_000) {
    html = html.slice(0, 2_000_000);
  }

  let text = html;
  for (const { pattern, replacement } of HTML_STRIP_PATTERNS) {
    text = text.replace(new RegExp(pattern, "gi"), replacement);
  }
  // Final cleanup: remove the catch-all HTML tag pattern without 'i' flag
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000);

  return text;
}
