import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Content } from "@google/genai";

// POST /api/generate end to end with Gemini + the admin record mocked:
// auth, validation, the NDJSON stream, and multi-turn bookkeeping.

const generateContent = vi.fn();
let admin: { id: string; isSuper: boolean; permissions: Record<string, boolean> } | null = null;

vi.mock("@/lib/api/requireAdmin", () => ({ requireAdminRecord: async () => admin }));
vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = { generateContent };
    },
  };
});

let POST: (req: Request) => Promise<Response>;
let maxDuration: number;
let adminCounter = 0;

beforeAll(async () => {
  process.env.GEMINI_API_KEY = "test-key";
  ({ POST, maxDuration } = await import("@/app/api/generate/route"));
});

beforeEach(() => {
  generateContent.mockReset();
  // A fresh admin per test keeps the per-admin rate limit out of the way.
  admin = { id: `admin-${++adminCounter}`, isSuper: false, permissions: { studio: true } };
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4]);

function request(fields: Record<string, string | Blob>, extra?: { image?: Blob[] }): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const img of extra?.image ?? []) form.append("image", img, "ref.png");
  return new Request("http://localhost/api/generate", { method: "POST", body: form });
}

async function events(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function imageResponse(data = "QUJD") {
  return {
    candidates: [
      {
        finishReason: "STOP",
        content: { role: "model", parts: [{ inlineData: { mimeType: "image/png", data }, thoughtSignature: "sig" }] },
      },
    ],
  };
}

describe("POST /api/generate", () => {
  it("rejects missing session and missing studio permission", async () => {
    admin = null;
    expect((await POST(request({ prompt: "x" }))).status).toBe(401);
    admin = { id: "a", isSuper: false, permissions: {} };
    expect((await POST(request({ prompt: "x" }))).status).toBe(403);
  });

  it("validates the prompt and sniffs uploads", async () => {
    expect((await POST(request({ prompt: "  " }))).status).toBe(400);
    const gif = new Blob([new TextEncoder().encode("GIF89a.........")], { type: "image/png" });
    const res = await POST(request({ prompt: "edit" }, { image: [gif] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/isn't a PNG, JPEG or WebP/);
    const many = Array.from({ length: 5 }, () => new Blob([PNG], { type: "image/png" }));
    expect((await POST(request({ prompt: "edit" }, { image: many }))).status).toBe(400);
  });

  it("refuses bodies over 4.5 MB before parsing", async () => {
    const big = new Blob([new Uint8Array(5 * 1024 * 1024)], { type: "image/png" });
    // Pre-serialized like a network body (a live FormData pump would keep
    // writing after the route stops reading — an in-process artifact).
    const multipart = new Response(
      (() => {
        const form = new FormData();
        form.append("prompt", "x");
        form.append("image", big, "big.png");
        return form;
      })()
    );
    const res = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: await multipart.arrayBuffer(),
        headers: { "content-type": multipart.headers.get("content-type") ?? "" },
      })
    );
    expect(res.status).toBe(413);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("streams the result and sends a model-valid config", async () => {
    generateContent.mockResolvedValueOnce(imageResponse());
    const res = await POST(
      request(
        {
          prompt: "a cat",
          model: "gemini-3.1-flash-image-preview", // retired → mapped
          mode: "single-turn",
          resolution: "4K",
          aspectRatio: "1:8",
          search: "0",
        },
        { image: [new Blob([PNG], { type: "application/octet-stream" })] }
      )
    );
    expect(res.headers.get("content-type")).toContain("ndjson");
    const lines = await events(res);
    expect(lines[0]).toMatchObject({ type: "status", stage: "generating" });
    const result = lines.at(-1) as { type: string; result: Record<string, unknown> };
    expect(result.type).toBe("result");
    expect(result.result).toMatchObject({
      images: [{ mimeType: "image/png", data: "QUJD" }],
      conversationId: null,
      model: "gemini-nano-banana-2.1",
      imageSize: "4K",
      aspectRatio: "1:8",
    });

    const call = generateContent.mock.calls[0][0];
    expect(call.model).toBe("gemini-nano-banana-2.1");
    expect(call.config.imageConfig).toEqual({ aspectRatio: "1:8", imageSize: "4K" });
    expect(call.config.tools).toBeUndefined(); // search off
    expect(call.config.responseModalities).toEqual(["TEXT", "IMAGE"]);
    // The upload is sent with its sniffed type, not the declared one.
    expect(call.contents[0].parts[0].inlineData.mimeType).toBe("image/png");
  });

  it("clamps Lite to 1K and never sends Search to it", async () => {
    generateContent.mockResolvedValueOnce(imageResponse());
    await events(
      await POST(request({ prompt: "x", model: "gemini-3.1-flash-lite-image", resolution: "4K", mode: "single-turn" }))
    );
    const call = generateContent.mock.calls[0][0];
    expect(call.config.imageConfig).toEqual({ imageSize: "1K" });
    expect(call.config.tools).toBeUndefined();
  });

  it("continues a multi-turn conversation with its full history", async () => {
    generateContent.mockResolvedValueOnce(imageResponse("FIRST"));
    const first = (await events(await POST(request({ prompt: "a cat", mode: "multi-turn" })))).at(-1) as {
      result: { conversationId: string };
    };
    const conversationId = first.result.conversationId;
    expect(conversationId).toBeTruthy();

    generateContent.mockResolvedValueOnce(imageResponse("SECOND"));
    await events(await POST(request({ prompt: "make it blue", mode: "multi-turn", conversationId })));
    const contents = generateContent.mock.calls[1][0].contents as Content[];
    expect(contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    // The model turn goes back unchanged (thought signature included).
    expect(contents[1].parts?.[0]).toMatchObject({ thoughtSignature: "sig", inlineData: { data: "FIRST" } });

    // Another admin can't use it; a different model can't either.
    admin = { id: "intruder", isSuper: true, permissions: {} };
    const foreign = await POST(request({ prompt: "x", mode: "multi-turn", conversationId }));
    expect(foreign.status).toBe(409);
    expect((await foreign.json()).code).toBe("conversation_expired");
  });

  it("starts a new conversation from a base image instead of the old one", async () => {
    generateContent.mockResolvedValueOnce(imageResponse());
    await events(
      await POST(
        request({
          prompt: "keep going",
          mode: "multi-turn",
          conversationId: "stale-id",
          baseImage: new Blob([PNG], { type: "image/png" }),
        })
      )
    );
    const contents = generateContent.mock.calls[0][0].contents as Content[];
    expect(contents).toHaveLength(1);
    expect(contents[0].parts?.[0].inlineData?.mimeType).toBe("image/png");
    expect(contents[0].parts?.at(-1)?.text).toMatch(/current result of our image-editing session[\s\S]*keep going/);
  });

  it("doesn't keep a turn too large to resend — the client restarts from the image", async () => {
    generateContent.mockResolvedValueOnce(imageResponse("A".repeat(14 * 1024 * 1024)));
    const last = (await events(await POST(request({ prompt: "4K poster", mode: "multi-turn" })))).at(-1) as {
      result: { conversationId: string | null; images: unknown[] };
    };
    expect(last.result.images).toHaveLength(1);
    expect(last.result.conversationId).toBeNull();
  });

  it("answers 409 for an unknown conversation without calling Gemini", async () => {
    const res = await POST(request({ prompt: "x", mode: "multi-turn", conversationId: "nope" }));
    expect(res.status).toBe(409);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("explains a blocked prompt in the stream", async () => {
    generateContent.mockResolvedValueOnce({ promptFeedback: { blockReason: "SAFETY" } });
    const last = (await events(await POST(request({ prompt: "x", mode: "single-turn" })))).at(-1);
    expect(last).toMatchObject({ type: "error", code: "blocked", status: 422 });
  });

  it("retries once when Gemini is overloaded, then reports it", async () => {
    const { ApiError } = await import("@google/genai");
    const overloaded = new ApiError({ status: 503, message: '{"error":{"message":"overloaded"}}' });
    generateContent.mockRejectedValueOnce(overloaded).mockRejectedValueOnce(overloaded);
    const lines = await events(await POST(request({ prompt: "x", mode: "single-turn" })));
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(lines.some((l) => l.type === "status" && l.stage === "retrying")).toBe(true);
    expect(lines.at(-1)).toMatchObject({ type: "error", code: "upstream_unavailable", status: 503 });
  }, 10_000);

  it("doesn't retry a download cut short — the render may already be billed", async () => {
    generateContent.mockRejectedValueOnce(new TypeError("terminated", { cause: { code: "UND_ERR_SOCKET" } }));
    const lines = await events(await POST(request({ prompt: "x", mode: "single-turn" })));
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(lines.at(-1)).toMatchObject({ type: "error", code: "upstream_unavailable" });
  });

  it("gives Gemini a deadline inside maxDuration and reports its timeout", async () => {
    generateContent.mockRejectedValueOnce(new DOMException("This operation was aborted", "AbortError"));
    const lines = await events(await POST(request({ prompt: "x", mode: "single-turn" })));
    const timeout = generateContent.mock.calls[0][0].config.httpOptions.timeout as number;
    expect(timeout).toBeGreaterThan(200_000);
    expect(timeout).toBeLessThan(maxDuration * 1000);
    expect(lines.at(-1)).toMatchObject({ type: "error", code: "upstream_unavailable", status: 504 });
  });

  it("counts only requests that reach Gemini against the rate limit", async () => {
    for (let i = 0; i < 12; i++) {
      expect((await POST(request({ prompt: " " }))).status).toBe(400);
      expect((await POST(request({ prompt: "x", mode: "multi-turn", conversationId: "gone" }))).status).toBe(409);
    }
    generateContent.mockResolvedValueOnce(imageResponse());
    const res = await POST(request({ prompt: "x", mode: "single-turn" }));
    expect(res.status).toBe(200);
    await events(res);
  });

  it("rate-limits per admin", async () => {
    generateContent.mockResolvedValue(imageResponse());
    for (let i = 0; i < 10; i++) await events(await POST(request({ prompt: "x", mode: "single-turn" })));
    const limited = await POST(request({ prompt: "x", mode: "single-turn" }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});
