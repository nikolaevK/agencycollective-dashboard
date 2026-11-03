import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  echoContentAfterFallback,
  pairToolResults,
  runToolLoop,
  WRAP_UP_NOTE,
  type ToolLoopEvent,
} from "@/lib/claude/toolLoop";

type Block = Record<string, unknown> & { type: string };

interface FakeTurn {
  content: Block[];
  stop_reason: string;
  stop_details?: { category: string | null; explanation: string | null } | null;
  model?: string;
}

/** Minimal stand-in for client.beta.messages.stream(): replays scripted turns as stream events. */
function fakeClient(turns: FakeTurn[], opts: { abortOnTurn?: number } = {}) {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    beta: {
      messages: {
        stream(params: Record<string, unknown>) {
          // Snapshot: the loop keeps appending to the same array afterwards.
          calls.push({ ...params, messages: [...(params.messages as unknown[])] });
          const turn = turns[calls.length - 1];
          if (!turn) throw new Error(`unexpected request #${calls.length}`);
          const events: Record<string, unknown>[] = [];
          turn.content.forEach((block, index) => {
            const start =
              block.type === "text" ? { ...block, text: "" } : block.type === "thinking" ? { ...block, thinking: "" } : block;
            events.push({ type: "content_block_start", index, content_block: start });
            if (block.type === "text") events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
            if (block.type === "thinking") {
              events.push({ type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: block.thinking } });
            }
            events.push({ type: "content_block_stop", index });
          });
          const aborted = opts.abortOnTurn === calls.length;
          return {
            async *[Symbol.asyncIterator]() {
              for (const e of events) {
                if (aborted) throw new Anthropic.APIUserAbortError();
                yield e;
              }
            },
            async finalMessage() {
              return {
                id: `msg_${calls.length}`,
                type: "message",
                role: "assistant",
                model: turn.model ?? "claude-opus-5-5",
                content: turn.content,
                stop_reason: turn.stop_reason,
                stop_details: turn.stop_details ?? null,
                usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50, cache_creation_input_tokens: 5 },
              };
            },
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}

const thinking = (sig: string, text = ""): Block => ({ type: "thinking", thinking: text, signature: sig });
const toolUse = (id: string, name = "display_metrics", input: unknown = {}): Block => ({ type: "tool_use", id, name, input });
const text = (t: string): Block => ({ type: "text", text: t, citations: null });

const baseOpts = {
  model: "claude-opus-5-5",
  system: [{ type: "text" as const, text: "sys", cache_control: { type: "ephemeral" as const } }],
  tools: [],
  messages: [{ role: "user" as const, content: "How are my accounts doing?" }],
  effort: "high" as const,
  maxTokens: 64_000,
  maxIterations: 5,
};

describe("runToolLoop", () => {
  it("replays each assistant turn verbatim (thinking + signatures) and keeps the transcript append-only", async () => {
    const turn1: Block[] = [thinking("sig-1"), thinking("sig-2", "Checking spend next."), text("Let me look."), toolUse("toolu_1")];
    const turn2: Block[] = [thinking("sig-3"), text("Here is the answer.")];
    const { client, calls } = fakeClient([
      { content: turn1, stop_reason: "tool_use" },
      { content: turn2, stop_reason: "end_turn" },
    ]);
    const events: ToolLoopEvent[] = [];
    const result = await runToolLoop({
      ...baseOpts,
      client,
      runTools: async (c) => c.map((call) => ({ type: "tool_result", tool_use_id: call.id, content: "ok" })),
      onEvent: (e) => events.push(e),
    });

    expect(result.stopReason).toBe("end_turn");
    expect(result.iterations).toBe(2);
    const second = calls[1].messages as Array<{ role: string; content: unknown }>;
    expect(second[0]).toEqual(baseOpts.messages[0]);
    expect(second[1]).toEqual({ role: "assistant", content: turn1 });
    expect(second[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }] });
    expect(result.messages[3]).toEqual({ role: "assistant", content: turn2 });

    // Request shape: adaptive thinking with updates, explicit effort, fallbacks, caching, betas.
    expect(calls[0].thinking).toEqual({ type: "adaptive", display: "updates" });
    expect(calls[0].output_config).toEqual({ effort: "high" });
    expect(calls[0].fallbacks).toBe("default");
    expect(calls[0].cache_control).toEqual({ type: "ephemeral" });
    expect(calls[0].betas).toEqual(["server-side-fallback-2026-07-01", "thinking-display-updates-2026-08-18"]);
    expect(calls[0]).not.toHaveProperty("temperature");
    expect(calls[0]).not.toHaveProperty("tool_choice");

    // Progress note (non-empty thinking) and text are forwarded; empty reasoning is not.
    expect(events).toContainEqual({ type: "progress_delta", key: "1:1", text: "Checking spend next." });
    expect(events.filter((e) => e.type === "progress_delta")).toHaveLength(1);
    expect(events).toContainEqual({ type: "tool_start", id: "toolu_1", name: "display_metrics" });
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 20, cacheReadTokens: 100, cacheWriteTokens: 10 });
  });

  it("stops on a refusal without running that turn's tools", async () => {
    const { client } = fakeClient([
      {
        content: [text("partial"), toolUse("toolu_x")],
        stop_reason: "refusal",
        stop_details: { category: "bio", explanation: "declined" },
      },
    ]);
    let ran = false;
    const events: ToolLoopEvent[] = [];
    const result = await runToolLoop({
      ...baseOpts,
      client,
      runTools: async () => {
        ran = true;
        return [];
      },
      onEvent: (e) => events.push(e),
    });
    expect(ran).toBe(false);
    expect(result.stopReason).toBe("refusal");
    expect(result.refusal).toEqual({ category: "bio", explanation: "declined" });
    expect(events).toContainEqual({ type: "refusal", category: "bio", explanation: "declined" });
  });

  it("never runs a tool call cut off by max_tokens", async () => {
    const { client } = fakeClient([{ content: [toolUse("toolu_1")], stop_reason: "max_tokens" }]);
    let ran = false;
    const result = await runToolLoop({
      ...baseOpts,
      client,
      runTools: async () => {
        ran = true;
        return [];
      },
    });
    expect(ran).toBe(false);
    expect(result.stopReason).toBe("max_tokens");
  });

  it("spends the last iteration on a wrap-up turn with tool_choice none and an appended note", async () => {
    const { client, calls } = fakeClient([
      { content: [toolUse("toolu_1")], stop_reason: "tool_use" },
      { content: [toolUse("toolu_2")], stop_reason: "tool_use" },
      { content: [text("Summary.")], stop_reason: "end_turn" },
    ]);
    const result = await runToolLoop({
      ...baseOpts,
      maxIterations: 3,
      client,
      runTools: async (c) => c.map((call) => ({ type: "tool_result", tool_use_id: call.id, content: "ok" })),
    });
    expect(result.stopReason).toBe("end_turn");
    expect(result.wrappedUp).toBe(true);
    expect(calls[1].tool_choice).toBeUndefined();
    expect(calls[2].tool_choice).toEqual({ type: "none" });
    const lastUser = (calls[2].messages as Array<{ content: Array<Record<string, unknown>> }>).at(-1)!;
    expect(lastUser.content.at(-1)).toEqual({ type: "text", text: WRAP_UP_NOTE });
    // Tools and system never change between requests.
    expect(calls[2].tools).toBe(calls[0].tools);
    expect(calls[2].system).toBe(calls[0].system);
  });

  it("fills in a missing tool result as an error", async () => {
    const { client, calls } = fakeClient([
      { content: [toolUse("toolu_1"), toolUse("toolu_2", "fetch_landing_page")], stop_reason: "tool_use" },
      { content: [text("done")], stop_reason: "end_turn" },
    ]);
    await runToolLoop({
      ...baseOpts,
      client,
      runTools: async () => [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }],
    });
    const results = (calls[1].messages as Array<{ content: Array<Record<string, unknown>> }>)[2].content;
    expect(results.map((r) => r.tool_use_id)).toEqual(["toolu_1", "toolu_2"]);
    expect(results[1].is_error).toBe(true);
  });

  it("resolves as aborted when the caller's signal fires mid-stream", async () => {
    const controller = new AbortController();
    controller.abort();
    const { client } = fakeClient([{ content: [text("hi")], stop_reason: "end_turn" }]);
    const result = await runToolLoop({ ...baseOpts, client, signal: controller.signal, runTools: async () => [] });
    expect(result.stopReason).toBe("aborted");
    expect(result.iterations).toBe(0);

    const { client: client2 } = fakeClient([{ content: [text("hi")], stop_reason: "end_turn" }], { abortOnTurn: 1 });
    const result2 = await runToolLoop({ ...baseOpts, client: client2, runTools: async () => [] });
    expect(result2.stopReason).toBe("aborted");
  });

  it("after a fallback, runs and echoes only the calls made after the boundary", async () => {
    const turn: Block[] = [
      text("Looking at"),
      thinking("sig-declined"),
      toolUse("toolu_old"),
      { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" }, trigger: { type: "refusal", category: "bio" } },
      thinking("sig-new"),
      toolUse("toolu_new"),
    ];
    const { client, calls } = fakeClient([
      { content: turn, stop_reason: "tool_use", model: "claude-opus-4-8" },
      { content: [text("ok")], stop_reason: "end_turn", model: "claude-opus-4-8" },
    ]);
    const seen: string[] = [];
    const events: ToolLoopEvent[] = [];
    const result = await runToolLoop({
      ...baseOpts,
      client,
      runTools: async (c) => {
        seen.push(...c.map((x) => x.id));
        return c.map((call) => ({ type: "tool_result", tool_use_id: call.id, content: "ok" }));
      },
      onEvent: (e) => events.push(e),
    });
    expect(seen).toEqual(["toolu_new"]);
    const echoed = (calls[1].messages as Array<{ content: Block[] }>)[1].content;
    expect(echoed.map((b) => b.type)).toEqual(["text", "fallback", "thinking", "tool_use"]);
    expect(result.servedBy).toBe("claude-opus-4-8");
    expect(events).toContainEqual({ type: "fallback", from: "claude-opus-5-5", to: "claude-opus-4-8", category: "bio" });
  });
});

describe("echoContentAfterFallback", () => {
  it("returns the turn unchanged without a fallback block", () => {
    const content = [thinking("a"), text("b"), toolUse("c")];
    expect(echoContentAfterFallback(content as never)).toEqual(content);
  });

  it("keeps paired server-tool calls before the boundary and drops unpaired ones", () => {
    const content: Block[] = [
      { type: "server_tool_use", id: "srv_1", name: "web_search", input: {} },
      { type: "web_search_tool_result", tool_use_id: "srv_1", content: [] },
      { type: "server_tool_use", id: "srv_2", name: "web_search", input: {} },
      { type: "connector_text", text: "narration" },
      { type: "fallback", from: { model: "a" }, to: { model: "b" }, trigger: { type: "refusal", category: null } },
      text("after"),
    ];
    const out = echoContentAfterFallback(content as never) as unknown as Block[];
    expect(out.map((b) => (b.id as string) ?? b.type)).toEqual(["srv_1", "web_search_tool_result", "fallback", "text"]);
  });
});

describe("pairToolResults", () => {
  it("orders results by call and ignores strays", () => {
    const out = pairToolResults(
      [
        { id: "a", name: "x" },
        { id: "b", name: "y" },
      ],
      [
        { type: "tool_result", tool_use_id: "b", content: "B" },
        { type: "tool_result", tool_use_id: "zzz", content: "stray" },
        { type: "tool_result", tool_use_id: "a", content: "A" },
      ]
    );
    expect(out.map((r) => r.content)).toEqual(["A", "B"]);
  });
});
