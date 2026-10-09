import { describe, it, expect } from "vitest";
import { readBodyCapped, readJsonCapped } from "@/lib/api/readBodyCapped";

/** A body streamed in pieces with NO Content-Length (chunked transfer). */
function streamed(pieces: number[]): Request {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < pieces.length) c.enqueue(new Uint8Array(pieces[i++]).fill(7));
      else c.close();
    },
  });
  return new Request("http://x/", { method: "PUT", body, duplex: "half" } as RequestInit);
}

describe("readBodyCapped", () => {
  it("returns the exact bytes when within the cap", async () => {
    const buf = await readBodyCapped(new Request("http://x/", { method: "PUT", body: new Uint8Array(10) }), 10);
    expect(buf?.length).toBe(10);
  });

  it("rejects an over-cap Content-Length before reading", async () => {
    const req = new Request("http://x/", { method: "PUT", body: new Uint8Array(11) });
    expect(await readBodyCapped(req, 10)).toBeNull();
  });

  it("stops a streamed body as soon as it crosses the cap", async () => {
    expect(await readBodyCapped(streamed([4, 4, 4, 4]), 10)).toBeNull();
    expect((await readBodyCapped(streamed([4, 4, 2]), 10))?.length).toBe(10);
  });

  it("treats a missing body as empty", async () => {
    expect((await readBodyCapped(new Request("http://x/", { method: "POST" }), 10))?.length).toBe(0);
  });
});

describe("readJsonCapped", () => {
  const json = (s: string) => new Request("http://x/", { method: "POST", body: s });
  it("parses JSON under the cap", async () => {
    expect(await readJsonCapped(json('{"a":1}'), 100)).toEqual({ ok: true, value: { a: 1 } });
  });
  it("distinguishes too-large from invalid", async () => {
    expect(await readJsonCapped(json('{"a":"' + "x".repeat(200) + '"}'), 100)).toEqual({ ok: false, reason: "too_large" });
    expect(await readJsonCapped(json("{nope"), 100)).toEqual({ ok: false, reason: "invalid" });
    expect(await readJsonCapped(json(""), 100)).toEqual({ ok: false, reason: "invalid" });
  });
});
