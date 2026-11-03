import { Readable } from "stream";
import { describe, it, expect, vi, beforeEach } from "vitest";

// https.get is faked: these tests never touch the network.
const getMock = vi.hoisted(() => vi.fn());
vi.mock("https", () => ({ default: { get: getMock } }));

import { fetchPublicImage, isPublicAddress } from "@/lib/publicImageFetch";

type Reply = { status: number; location?: string; body?: Buffer };

/** Answer successive https.get calls with these replies (redirects, then a body). */
function serve(...replies: Reply[]) {
  getMock.mockImplementation((_url: URL, _opts: unknown, onResponse: (res: unknown) => void) => {
    const reply = replies.shift() ?? { status: 500 };
    const res = Object.assign(Readable.from(reply.body ? [reply.body] : []), {
      statusCode: reply.status,
      headers: reply.location ? { location: reply.location } : {},
    });
    queueMicrotask(() => onResponse(res));
    const req = { on: () => req, destroy: () => {} };
    return req;
  });
}

const fbcdnOnly = (u: URL) => u.hostname.endsWith(".fbcdn.net");

describe("isPublicAddress", () => {
  it("judges IPv4 embedded in IPv6 by the IPv4 rules, however it's spelled", () => {
    for (const ip of [
      "::ffff:7f00:1", // ::ffff:127.0.0.1 after URL parsing
      "::ffff:a9fe:a9fe", // 169.254.169.254 (cloud metadata)
      "::ffff:0a00:0001", // 10.0.0.1
      "::7f00:1", // IPv4-compatible ::127.0.0.1
      "::127.0.0.1",
      "64:ff9b::7f00:1", // NAT64 127.0.0.1
      "64:ff9b::10.0.0.1",
      "2002:7f00:1::", // 6to4 127.0.0.1
      "0:0:0:0:0:ffff:c0a8:101", // 192.168.1.1, uncompressed
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    expect(isPublicAddress("::ffff:808:808")).toBe(true); // 8.8.8.8
    expect(isPublicAddress("64:ff9b::808:808")).toBe(true);
  });

  it("blocks loopback, unspecified, ULA, link/site-local and multicast IPv6", () => {
    for (const ip of ["::", "::1", "0:0:0:0:0:0:0:1", "fd12:3456::1", "fc00::1", "fe80::1", "fe80::1%eth0", "febf::1", "fec0::1", "ff02::1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("allows public addresses", () => {
    for (const ip of ["93.184.216.34", "2606:4700::6810:84e5", "2a03:2880:f12f:83:face:b00c:0:25de", "::ffff:8.8.8.8"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("rejects anything that isn't an IP", () => {
    expect(isPublicAddress("localhost")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
  });
});

describe("fetchPublicImage", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("refuses an IPv4-mapped IPv6 literal in hex form", async () => {
    const res = await fetchPublicImage("https://[::ffff:127.0.0.1]/a.png", 1024);
    expect(res).toEqual({ ok: false, error: "imageUrl must point to a public internet host" });
    expect(getMock).not.toHaveBeenCalled();
  });

  it("holds every redirect hop to allowHost", async () => {
    serve({ status: 302, location: "https://evil.example/x.jpg" });
    const res = await fetchPublicImage("https://scontent.xx.fbcdn.net/a.jpg", 1024, { allowHost: fbcdnOnly });
    expect(res.ok).toBe(false);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("checks allowHost before the first request", async () => {
    const res = await fetchPublicImage("https://l.facebook.com/l.php?u=x", 1024, { allowHost: fbcdnOnly });
    expect(res.ok).toBe(false);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("follows allowed redirects to the image", async () => {
    serve({ status: 301, location: "https://scontent-2.xx.fbcdn.net/b.jpg" }, { status: 200, body: Buffer.from([1, 2, 3]) });
    const res = await fetchPublicImage("https://scontent.xx.fbcdn.net/a.jpg", 1024, { allowHost: fbcdnOnly });
    expect(res).toEqual({ ok: true, data: Buffer.from([1, 2, 3]) });
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(String(getMock.mock.calls[1][0])).toBe("https://scontent-2.xx.fbcdn.net/b.jpg");
  });

  it("without allowHost, follows a redirect to any public https host (API imageUrl callers)", async () => {
    serve({ status: 302, location: "https://cdn.example.com/logo.png" }, { status: 200, body: Buffer.from([9]) });
    const res = await fetchPublicImage("https://brand.example.com/logo", 1024);
    expect(res).toEqual({ ok: true, data: Buffer.from([9]) });
  });
});
