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

/** Anything that isn't the public internet: private, loopback, link-local/metadata, CGNAT, multicast, reserved. */
export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return false; // this-host / private / loopback
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 169 && b === 254) return false; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && (b === 168 || b === 0)) return false; // private / IETF + TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a >= 224) return false; // multicast + reserved
    return true;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return false;
    const mapped = v.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (/^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff")) return false; // ULA / link-local / multicast
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

export async function fetchPublicImage(rawUrl: string, maxBytes: number): Promise<PublicImageResult> {
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
