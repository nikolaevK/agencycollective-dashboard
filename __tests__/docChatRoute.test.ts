import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BetaToolResultBlockParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { parseSSEStream } from "@/lib/chatStreamParser";
import type { SSEEvent } from "@/types/chat";

// POST /api/media-chat and /api/sop-chat (lib/docChat/route) with the session,
// the admin record and the Claude loop mocked: the DB permission re-check, the
// body cap, history truncation, tool-input validation, refusals, the SSE
// keep-alive and the hard deadline.

type Admin = { id: string; isSuper: boolean; permissions: Record<string, boolean> };
let session: { adminId: string } | null = null;
let admin: Admin | null = null;
let adminCounter = 0;

const runToolLoop = vi.fn();

vi.mock("@/lib/adminSession", () => ({ getAdminSession: () => session }));
vi.mock("@/lib/api/requireAdmin", () => ({ requireAdminRecord: async () => admin }));
vi.mock("@/lib/claude/toolLoop", () => ({ runToolLoop: (...a: unknown[]) => runToolLoop(...a) }));

let mediaPOST: (req: Request) => Promise<Response>;
let sopPOST: (req: Request) => Promise<Response>;

const ENDED = { stopReason: "end_turn", iterations: 1, servedBy: "claude-opus-5-5", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };

beforeAll(async () => {
  ({ POST: mediaPOST } = await import("@/app/api/media-chat/route"));
  ({ POST: sopPOST } = await import("@/app/api/sop-chat/route"));
});

beforeEach(() => {
  // A fresh admin per test keeps the per-admin rate limit out of the way.
  const id = `admin-${++adminCounter}`;
  session = { adminId: id };
  admin = { id, isSuper: false, permissions: { media: true } };
  runToolLoop.mockReset().mockResolvedValue(ENDED);
});

afterEach(() => vi.useRealTimers());

function post(body: unknown, path = "/api/media-chat"): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const hi = { messages: [{ role: "user", content: "Write a brief" }] };

async function events(res: Response): Promise<SSEEvent[]> {
  const out: SSEEvent[] = [];
  for await (const e of parseSSEStream(res.body!)) out.push(e);
  return out;
}

type LoopOpts = {
  runTools: (calls: BetaToolUseBlock[]) => Promise<BetaToolResultBlockParam[]>;
  onEvent: (e: Record<string, unknown>) => void;
  messages: Array<{ role: string; content: unknown }>;
  display: string;
  effort: string;
  signal: AbortSignal;
};

describe("permissions (fresh DB record)", () => {
  it("media chat: 401 without a session, 403 without media / media_manage", async () => {
    session = null;
    expect((await mediaPOST(post(hi))).status).toBe(401);
    session = { adminId: "x" };
    admin = null;
    expect((await mediaPOST(post(hi))).status).toBe(403);
    admin = { id: "x", isSuper: false, permissions: { media: false, dashboard: true } };
    expect((await mediaPOST(post(hi))).status).toBe(403);
    admin = { id: "x", isSuper: false, permissions: { media_manage: true } };
    expect((await mediaPOST(post(hi))).status).toBe(200);
  });

  it("SOP chat: any admin still in the DB", async () => {
    admin = { id: session!.adminId, isSuper: false, permissions: {} };
    expect((await sopPOST(post(hi, "/api/sop-chat"))).status).toBe(200);
    admin = null;
    expect((await sopPOST(post(hi, "/api/sop-chat"))).status).toBe(403);
  });
});

describe("request handling", () => {
  it("413 for a body over the cap, 400 for bad JSON / a reply ending the history", async () => {
    expect((await mediaPOST(post({ messages: [{ role: "user", content: "x".repeat(1_100_000) }] }))).status).toBe(413);
    expect((await mediaPOST(post("{nope"))).status).toBe(400);
    const res = await mediaPOST(post({ messages: [{ role: "user", content: "q" }, { role: "assistant", content: "a" }] }));
    expect(res.status).toBe(400);
    expect(runToolLoop).not.toHaveBeenCalled();
  });

  it("cuts an over-long history block instead of rejecting the conversation", async () => {
    const res = await mediaPOST(
      post({
        messages: [
          { role: "user", content: "q1" },
          { role: "assistant", content: [{ type: "text", text: "y".repeat(150_000) }] },
          { role: "user", content: "q2" },
        ],
      })
    );
    expect(res.status).toBe(200);
    await events(res);
    const opts = runToolLoop.mock.calls[0][0] as LoopOpts;
    expect(JSON.stringify(opts.messages[1].content)).toContain("[truncated]");
    expect(opts.display).toBe("updates");
    expect(opts.effort).toBe("medium");
  });
});

describe("tool calls", () => {
  it("validates every call: invalid input goes back to the model only, valid input reaches the UI normalized", async () => {
    let results: BetaToolResultBlockParam[] = [];
    runToolLoop.mockImplementation(async (opts: LoopOpts) => {
      const call = (id: string, input: unknown) => ({ type: "tool_use", id, name: "generate_document", input }) as BetaToolUseBlock;
      results = await opts.runTools([
        call("t1", { title: "No body" }),
        call("t2", { title: "Brief", docType: "nonsense", markdown: "Body ![x](https://evil.tld/p)" }),
      ]);
      return ENDED;
    });
    const evs = await events(await mediaPOST(post(hi)));

    expect(results[0]).toMatchObject({ tool_use_id: "t1", is_error: true });
    expect(String(results[0].content)).toContain('"markdown" is required');
    expect(results[1].is_error).toBeUndefined();

    const uses = evs.filter((e) => e.type === "tool_use");
    expect(uses).toEqual([{ type: "tool_use", id: "t2", name: "generate_document", input: { title: "Brief", docType: "other", markdown: "Body x" } }]);
    expect(evs.filter((e) => e.type === "tool_result").map((e) => (e as { tool_use_id: string }).tool_use_id)).toEqual(["t2"]);
    expect(evs.at(-1)).toMatchObject({ type: "done", stopReason: "end_turn" });
  });

  it("validates SOP calls with the SOP rules", async () => {
    let results: BetaToolResultBlockParam[] = [];
    runToolLoop.mockImplementation(async (opts: LoopOpts) => {
      results = await opts.runTools([{ type: "tool_use", id: "s1", name: "generate_sop", input: { title: "T", sections: [] } } as unknown as BetaToolUseBlock]);
      return ENDED;
    });
    await events(await sopPOST(post(hi, "/api/sop-chat")));
    expect(results[0]).toMatchObject({ tool_use_id: "s1", is_error: true });
  });
});

describe("stream events", () => {
  it("forwards a refusal as its own event (not an error) and still ends with done", async () => {
    runToolLoop.mockImplementation(async (opts: LoopOpts) => {
      opts.onEvent({ type: "turn_start", iteration: 1 });
      opts.onEvent({ type: "text_delta", text: "Partial" });
      opts.onEvent({ type: "refusal", category: "bio", explanation: null });
      return { ...ENDED, stopReason: "refusal" };
    });
    const types = (await events(await mediaPOST(post(hi)))).map((e) => e.type);
    expect(types).toEqual(["turn_start", "text_delta", "refusal", "done"]);
  });

  it("maps a Claude failure to a safe, retryable message", async () => {
    runToolLoop.mockRejectedValue(new Error("socket hang up: secret internals"));
    const err = (await events(await mediaPOST(post(hi)))).at(-1);
    expect(err).toMatchObject({ type: "error", retryable: true });
    expect((err as { message: string }).message).not.toContain("secret");
  });

  it("sends `: ping` keep-alives while a long document is written", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    let release!: () => void;
    runToolLoop.mockImplementation(async () => {
      await new Promise<void>((r) => (release = r));
      return ENDED;
    });
    const res = await mediaPOST(post(hi));
    const [raw, parsed] = res.body!.tee();
    const text = new Response(raw).text();
    const parsedEvents = events(new Response(parsed));

    await vi.advanceTimersByTimeAsync(46_000);
    release();
    await vi.advanceTimersByTimeAsync(0);

    expect((await text).match(/^: ping$/gm)).toHaveLength(3);
    expect((await parsedEvents).map((e) => e.type)).toEqual(["done"]);
  });

  it("ends with a clean timeout before the platform limit", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    runToolLoop.mockImplementation(
      (opts: LoopOpts) =>
        new Promise((resolve) => opts.signal.addEventListener("abort", () => resolve({ ...ENDED, stopReason: "aborted" })))
    );
    const res = await mediaPOST(post(hi));
    const done = events(res);
    await vi.advanceTimersByTimeAsync(290_000);
    expect((await done).at(-1)).toMatchObject({ type: "done", stopReason: "timeout" });
  });
});
