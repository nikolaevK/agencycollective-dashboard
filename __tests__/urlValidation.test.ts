import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import http from "http";
import dns from "dns";
import zlib from "zlib";
import type { AddressInfo } from "net";

// 127.0.0.1 stands in for a public web server (only the fetch tests use it);
// every other address keeps the real isPublicAddress verdict — so "localhost"
// (which also resolves to ::1 / other 127.x) and private literals stay blocked.
vi.mock("@/lib/publicImageFetch", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/publicImageFetch")>();
  return { ...real, isPublicAddress: (ip: string) => ip === "127.0.0.1" || real.isPublicAddress(ip) };
});

import {
  extractPageText,
  fetchAndExtractPage,
  fetchPublicHtml,
  scanHtml,
  validateExternalUrl,
} from "@/lib/urlValidation";

const MB2 = 2_000_000;

function timed(fn: () => void): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

describe("HTML extraction is linear (ReDoS)", () => {
  // Each of these took seconds to a minute with the old regex passes.
  const units = [
    "<script>", // unclosed raw-text element
    "<style>",
    '<a href="x">', // unclosed captures
    "<button>",
    "<title>",
    "<", // `<[^>]+>` with no ">"
    "<p",
    "<input ",
    '<img alt="',
    '<meta name="description" ',
    "<!--",
    "</",
    "<a href=x>a</a ",
    "  \t", // trailing-whitespace pass
  ];

  it.each(units)("2 MB of %j extracts in well under a second", (unit) => {
    const html = unit.repeat(Math.ceil(MB2 / unit.length));
    const ms = timed(() => extractPageText(html));
    expect(ms).toBeLessThan(500);
  });

  it("the scanner itself is linear without the size cap", () => {
    for (const unit of ['<a href="x"><button>', "<", "<script>" + "</".repeat(10)]) {
      const html = unit.repeat(Math.ceil(MB2 / unit.length));
      const ms = timed(() => scanHtml(html, { text() {}, tag() {}, rawText() {} }, Infinity));
      expect(ms).toBeLessThan(500);
    }
  });

  it("stops after the markup budget", () => {
    let seen = 0;
    scanHtml("x".repeat(1_000_000), { text: (t) => (seen += t.length) }, 300_000);
    expect(seen).toBe(300_000);
  });
});

describe("extractPageText", () => {
  it("keeps the structure markers", () => {
    const html =
      '<!doctype html><html><head><title>Offer &amp; more</title><meta content="Best deal" name="description">' +
      '<style>.x{}</style></head><body><!-- <button>hidden</button> --><noscript>Enable JS</noscript>' +
      "<h1>Save 10 hours</h1><p>Price < $50</p>" +
      '<a href="/buy"><img alt="Logo"> Buy now</a><a>plain</a>' +
      "<button><span>Get</span> my quote</button>" +
      "<form><input type='email' placeholder='Email'><input type=\"hidden\"></form>" +
      "<script>steal()</script></body></html>";
    const text = extractPageText(html);
    expect(text).toContain("[PAGE TITLE: Offer & more]");
    expect(text).toContain("[META DESCRIPTION: Best deal]");
    expect(text).toContain("Save 10 hours");
    expect(text).toContain("Price < $50");
    expect(text).toContain("[LINK: [IMAGE: Logo] Buy now → /buy]");
    expect(text).toContain("plain");
    expect(text).toContain("[BUTTON: Get my quote]");
    expect(text).toContain("[FORM START]");
    expect(text).toContain("[INPUT: Email]");
    expect(text).toContain("[FORM FIELD: hidden]");
    expect(text).toContain("[FORM END]");
    for (const gone of ["steal", "Enable JS", "hidden</", ".x{}", "doctype"]) expect(text).not.toContain(gone);
  });

  it("leaves unclosed captures as plain text, an unclosed script swallows the rest", () => {
    expect(extractPageText('<a href="x">dangling')).toBe("dangling");
    expect(extractPageText("<button>one<button>two</button>")).toBe("[BUTTON: onetwo]");
    expect(extractPageText("before<script>var a = '</scripts>'; after")).toBe("before");
  });

  it("caps the output", () => {
    expect(extractPageText("<p>" + "word ".repeat(10_000), 100)).toHaveLength(100);
  });
});

describe("validateExternalUrl", () => {
  it.each([
    "http://127.0.0.2/",
    "http://0x7f.0.0.2/", // URL() normalizes hex/octal forms to dotted decimal
    "http://10.1.2.3/",
    "http://169.254.169.254/latest/meta-data",
    "http://192.0.0.8/",
    "http://198.18.0.1/",
    "http://224.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:10.0.0.1]/", // IPv4-mapped (URL writes it as ::ffff:a00:1)
    "http://[fd00::1]/",
  ])("rejects the private literal %s", (url) => {
    expect(() => validateExternalUrl(url)).toThrow(/private/);
  });

  it("rejects other schemes and accepts public hosts without resolving them", () => {
    expect(() => validateExternalUrl("file:///etc/passwd")).toThrow(/HTTP/);
    expect(() => validateExternalUrl("not a url")).toThrow(/Invalid/);
    expect(validateExternalUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
  });
});

describe("fetchPublicHtml — connect-time SSRF guard", () => {
  let server: http.Server;
  let base: string;
  let port: number;
  const hits: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.push(req.url ?? "");
      const url = req.url ?? "/";
      if (url === "/page") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<title>Hi</title><h1>Welcome</h1>");
      } else if (url === "/gzip") {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        res.end(zlib.gzipSync("<h1>Compressed</h1>"));
      } else if (url === "/big") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("x".repeat(3_000_000));
      } else if (url === "/pdf") {
        res.writeHead(200, { "content-type": "application/pdf" });
        res.end("%PDF-");
      } else if (url === "/to-internal") {
        res.writeHead(302, { location: `http://internal.example.test:${port}/page` });
        res.end();
      } else if (url === "/to-private") {
        res.writeHead(301, { location: "http://10.0.0.1/admin" });
        res.end();
      } else if (url === "/slow") {
        // never answers
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  afterEach(() => vi.restoreAllMocks());

  it("fetches, decodes and caps a public page", async () => {
    expect((await fetchPublicHtml(`${base}/page`)).html).toContain("Welcome");
    expect((await fetchPublicHtml(`${base}/gzip`)).html).toBe("<h1>Compressed</h1>");
    expect((await fetchPublicHtml(`${base}/big`)).html).toHaveLength(2_000_000);
    await expect(fetchPublicHtml(`${base}/pdf`)).rejects.toThrow(/isn't a web page/);
    await expect(fetchPublicHtml(`${base}/nope`)).rejects.toThrow(/HTTP 404/);
  });

  /** Stub DNS: every hostname resolves to `addrs` (no network). */
  function stubDns(addrs: Array<{ address: string; family: number }>) {
    return vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      opts: unknown,
      cb: (err: Error | null, addr: unknown, family?: number) => void
    ) => {
      const all = typeof opts === "object" && opts !== null && (opts as { all?: boolean }).all;
      if (all) cb(null, addrs);
      else cb(null, addrs[0].address, addrs[0].family);
    }) as unknown as typeof dns.lookup);
  }

  it("re-checks every redirect hop — a hostname is checked when the socket connects", async () => {
    hits.length = 0;
    const lookup = stubDns([{ address: "127.0.0.2", family: 4 }]);
    await expect(fetchPublicHtml(`${base}/to-internal`)).rejects.toThrow(/private/);
    expect(lookup).toHaveBeenCalled();
    await expect(fetchPublicHtml(`${base}/to-private`)).rejects.toThrow(/private/);
    // Only the redirecting hops reached a server.
    expect(hits).toEqual(["/to-internal", "/to-private"]);
  });

  it("blocks a hostname if ANY of its addresses is private (rebinding / public A + loopback AAAA)", async () => {
    const lookup = stubDns([
      { address: "::1", family: 6 },
      { address: "93.184.216.34", family: 4 },
    ]);
    await expect(fetchPublicHtml("http://rebind.example.test/")).rejects.toThrow(/private/);
    expect(lookup).toHaveBeenCalled();
    lookup.mockRestore();
    // Mapped-IPv6 spelling of a private IPv4 address, from DNS.
    stubDns([{ address: "::ffff:169.254.169.254", family: 6 }]);
    await expect(fetchPublicHtml("http://metadata.example.test/")).rejects.toThrow(/private/);
  });

  it("can be stopped", async () => {
    const abort = new AbortController();
    const pending = fetchPublicHtml(`${base}/slow`, abort.signal);
    setTimeout(() => abort.abort(), 20);
    await expect(pending).rejects.toThrow(/stopped/);
  });

  it("fetchAndExtractPage keeps the portal's contract (text, or an Error with a message)", async () => {
    await expect(fetchAndExtractPage(`${base}/page`)).resolves.toBe("[PAGE TITLE: Hi]\n\nWelcome");
    await expect(fetchAndExtractPage("http://169.254.169.254/")).rejects.toThrow(/private/);
  });
});
