import https from "https";
import dns from "dns";
import net from "net";

/**
 * Download an image from a caller-supplied https:// URL (the API's
 * `imageUrl` upload alternative — agents know a brand's logo URL but can't
 * produce its bytes). SSRF-guarded: every address a hostname resolves to is
 * checked AT CONNECT TIME (a custom `lookup`, so DNS rebinding can't swap in
 * a private IP after a check), IP-literal hosts are checked up front, each
 * redirect hop is re-validated (≤3), https only, 10 s, byte-capped. The
 * caller still sniffs the bytes — a non-image body is rejected, never stored
 * or echoed.
 */

function isPublicIPv4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // this-host / private / loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && (b === 168 || b === 0)) return false; // private / IETF + TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a >= 224) return false; // multicast + reserved
  return true;
}

/**
 * The 16 bytes of a valid IPv6 literal (zone id dropped, dotted IPv4 tail
 * folded in). Textual checks miss equivalent spellings: URL parsing turns
 * `[::ffff:127.0.0.1]` into `[::ffff:7f00:1]`.
 */
function ipv6Bytes(ip: string): number[] | null {
  let v = ip.toLowerCase().replace(/%.*$/, "");
  const tail = v.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const [a, b, c, d] = tail[2].split(".").map(Number);
    v = `${tail[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = v.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  return bytes;
}

/** Anything that isn't the public internet: private, loopback, link-local/metadata, CGNAT, multicast, reserved. */
export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return isPublicIPv4(a, b);
  }
  if (net.isIPv6(ip)) {
    const x = ipv6Bytes(ip);
    if (!x) return false;
    const zeros = (from: number, to: number) => x.slice(from, to).every((n) => n === 0);
    // Embedded IPv4 is judged by the IPv4 rules: IPv4-compatible ::/96 (also
    // covers :: and ::1), IPv4-mapped ::ffff:0:0/96, NAT64 64:ff9b::/96, 6to4 2002::/16.
    if (zeros(0, 12)) return isPublicIPv4(x[12], x[13]);
    if (zeros(0, 10) && x[10] === 0xff && x[11] === 0xff) return isPublicIPv4(x[12], x[13]);
    if (x[0] === 0x00 && x[1] === 0x64 && x[2] === 0xff && x[3] === 0x9b && zeros(4, 12)) return isPublicIPv4(x[12], x[13]);
    if (x[0] === 0x20 && x[1] === 0x02) return isPublicIPv4(x[2], x[3]);
    if ((x[0] & 0xfe) === 0xfc) return false; // ULA fc00::/7
    if (x[0] === 0xfe && (x[1] & 0x80) !== 0) return false; // link-local fe80::/10 + site-local fec0::/10
    if (x[0] === 0xff) return false; // multicast
    return true;
  }
  return false;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** dns.lookup that refuses to hand a non-public address to the socket (handles `all: true` from happy-eyeballs). */
function guardedLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options }, ((err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => {
    if (err) return callback(err, address, family);
    const ips = Array.isArray(address) ? address.map((a) => a.address) : [address];
    if (ips.length === 0 || !ips.every(isPublicAddress)) {
      return callback(Object.assign(new Error("Blocked a non-public address"), { code: "EBLOCKED" }), address, family);
    }
    callback(null, address, family);
  }) as LookupCallback);
}

const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export type PublicImageResult = { ok: true; data: Buffer } | { ok: false; error: string; tooLarge?: boolean };

function getOnce(url: URL, maxBytes: number, deadline: number): Promise<PublicImageResult | { redirect: string }> {
  return new Promise((settle) => {
    // A hard deadline on top of the socket idle timeout (a slow drip can't hold the request open).
    const timer = setTimeout(
      () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
      Math.max(1, deadline - Date.now())
    );
    const resolve = (r: PublicImageResult | { redirect: string }) => {
      clearTimeout(timer);
      settle(r);
    };
    const req = https.get(
      url,
      {
        lookup: guardedLookup as unknown as net.LookupFunction,
        headers: { accept: "image/png,image/jpeg,image/webp,image/*;q=0.8", "user-agent": "AgencyCollectiveDashboard/1.0 (image import)" },
        timeout: Math.max(1, deadline - Date.now()),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return resolve({ ok: false, error: `imageUrl answered HTTP ${status}` });
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > maxBytes) {
          res.destroy();
          return resolve({ ok: false, error: `Image too large (max ${maxBytes / (1024 * 1024)} MB)`, tooLarge: true });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            resolve({ ok: false, error: `Image too large (max ${maxBytes / (1024 * 1024)} MB)`, tooLarge: true });
          } else chunks.push(chunk);
        });
        res.on("end", () => resolve(size > 0 ? { ok: true, data: Buffer.concat(chunks) } : { ok: false, error: "imageUrl returned an empty body" }));
        res.on("error", () => resolve({ ok: false, error: "Couldn't download imageUrl" }));
      }
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (err: NodeJS.ErrnoException) =>
      resolve({
        ok: false,
        error:
          err.code === "EBLOCKED"
            ? "imageUrl must point to a public internet host"
            : err.code === "ETIMEDOUT"
              ? "imageUrl took too long to download"
              : "Couldn't download imageUrl",
      })
    );
  });
}

/**
 * `allowHost` (optional) is checked on EVERY hop, redirects included — an
 * allowlist on the first URL alone is bypassed by any open redirector on an
 * allowed host. Without it, any public https host is accepted (as before).
 */
export async function fetchPublicImage(
  rawUrl: string,
  maxBytes: number,
  opts: { allowHost?: (url: URL) => boolean } = {}
): Promise<PublicImageResult> {
  const deadline = Date.now() + TIMEOUT_MS;
  let current = rawUrl.trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let url: URL;
    try {
      url = new URL(current);
    } catch {
      return { ok: false, error: "imageUrl isn't a valid URL" };
    }
    if (url.protocol !== "https:") return { ok: false, error: "imageUrl must be an https:// URL" };
    if (opts.allowHost && !opts.allowHost(url)) return { ok: false, error: "imageUrl points to a host that isn't allowed" };
    // IP-literal hosts skip DNS (and so the lookup guard) — check them here.
    const literal = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(literal) && !isPublicAddress(literal)) {
      return { ok: false, error: "imageUrl must point to a public internet host" };
    }
    if (Date.now() >= deadline) return { ok: false, error: "imageUrl took too long to download" };
    const result = await getOnce(url, maxBytes, deadline);
    if (!("redirect" in result)) return result;
    current = new URL(result.redirect, url).toString();
  }
  return { ok: false, error: "imageUrl redirected too many times" };
}
