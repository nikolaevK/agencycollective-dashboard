import { describe, expect, it } from "vitest";
import { finishStreamLocally, initialStreamState, reduceStreamEvent, type StreamState } from "@/lib/analyst/streamReducer";
import { parseSSEStream, toSSEEvent } from "@/lib/chatStreamParser";
import type { SSEEvent } from "@/types/chat";

function run(events: SSEEvent[]): StreamState {
  return events.reduce(reduceStreamEvent, initialStreamState("a1"));
}

describe("reduceStreamEvent", () => {
  it("appends text and progress deltas to the current block of their kind", () => {
    const s = run([
      { type: "status", message: "Loading Meta data…" },
      { type: "turn_start", iteration: 1 },
      { type: "text_delta", text: "Hel" },
      { type: "text_delta", text: "lo" },
      { type: "progress_delta", key: "1:2", text: "Checking " },
      { type: "progress_delta", key: "1:2", text: "spend." },
      { type: "progress_delta", key: "1:4", text: "Next." },
      { type: "text_delta", text: "Done" },
    ]);
    expect(s.message.blocks).toEqual([
      { type: "text", text: "Hello" },
      { type: "progress", key: "1:2", text: "Checking spend." },
      { type: "progress", key: "1:4", text: "Next." },
      { type: "text", text: "Done" },
    ]);
    expect(s.message.content).toBe("HelloDone");
    expect(s.status).toBeNull();
  });

  it("tracks pending tool calls until their tool_use arrives", () => {
    let s = run([
      { type: "turn_start", iteration: 1 },
      { type: "tool_start", id: "t1", name: "display_chart" },
      { type: "tool_start", id: "t2", name: "display_table" },
    ]);
    expect(s.pendingTools.map((t) => t.id)).toEqual(["t1", "t2"]);
    s = reduceStreamEvent(s, { type: "tool_use", id: "t1", name: "display_chart", input: { type: "bar" } });
    expect(s.pendingTools.map((t) => t.id)).toEqual(["t2"]);
    s = reduceStreamEvent(s, { type: "turn_start", iteration: 2 });
    expect(s.pendingTools).toEqual([]);
  });

  it("keeps the model-facing tool result text separate from what is rendered", () => {
    const s = run([
      { type: "tool_use", id: "t1", name: "fetch_landing_page", input: { url: "https://a.com" } },
      { type: "tool_result", tool_use_id: "t1", result: "Read 1,200 characters from a.com", content: "<landing_page>…" },
    ]);
    expect(s.message.blocks?.[1]).toEqual({
      type: "tool_result",
      tool_use_id: "t1",
      content: "Read 1,200 characters from a.com",
      historyContent: "<landing_page>…",
    });
  });

  it("a refusal discards the declined turn's partial output and adds a notice", () => {
    const s = run([
      { type: "turn_start", iteration: 1 },
      { type: "text_delta", text: "Kept from turn 1." },
      { type: "tool_use", id: "t1", name: "display_metrics", input: {} },
      { type: "tool_result", tool_use_id: "t1", result: "Displayed" },
      { type: "turn_start", iteration: 2 },
      { type: "text_delta", text: "Partial that was declined" },
      { type: "refusal", category: "bio", message: "declined" },
      { type: "done", stopReason: "refusal" },
    ]);
    expect(s.message.blocks?.map((b) => b.type)).toEqual(["text", "tool_use", "tool_result", "notice"]);
    expect(s.message.content).toBe("Kept from turn 1.");
    const notice = s.message.blocks?.at(-1);
    expect(notice?.type === "notice" && notice.kind).toBe("refusal");
    expect(s.finished).toBe(true);
  });

  it("maps how a reply ended to notices", () => {
    const truncated = run([{ type: "text_delta", text: "x" }, { type: "done", stopReason: "max_tokens", servedBy: "claude-opus-4-8" }]);
    expect(truncated.message.blocks?.at(-1)).toMatchObject({ type: "notice", kind: "truncated", action: "continue" });

    const ok = run([{ type: "text_delta", text: "x" }, { type: "done", stopReason: "end_turn" }]);
    expect(ok.message.blocks).toEqual([{ type: "text", text: "x" }]);

    const failed = run([{ type: "error", message: "Overloaded", retryable: true }]);
    expect(failed.message.blocks?.at(-1)).toMatchObject({ kind: "error", action: "retry" });
    const fatal = run([{ type: "error", message: "Token expired", retryable: false }]);
    expect(fatal.message.blocks?.at(-1)).not.toHaveProperty("action");
  });

  it("only a fallback event marks the reply as served by another model", () => {
    // done.servedBy is the last request's model — a dated id, or the requested
    // model again after an earlier fallback turn, must not decide the note.
    const plain = run([{ type: "text_delta", text: "x" }, { type: "done", stopReason: "end_turn", servedBy: "claude-opus-5-5-20261001" }]);
    expect(plain.message.servedBy).toBeUndefined();

    const fellBack = run([
      { type: "turn_start", iteration: 1 },
      { type: "fallback", from: "claude-opus-5-5", to: "claude-sonnet-4-6", category: "cyber" },
      { type: "text_delta", text: "x" },
      { type: "turn_start", iteration: 2 },
      { type: "done", stopReason: "end_turn", servedBy: "claude-opus-5-5" },
    ]);
    expect(fellBack.message.servedBy).toBe("claude-sonnet-4-6");
  });

  it("a mid-stream fallback drops the declined model's pending call (it is never sent or run)", () => {
    const s = run([
      { type: "turn_start", iteration: 1 },
      { type: "tool_start", id: "t_declined", name: "generate_document" },
      { type: "fallback", from: "claude-opus-5-5", to: "claude-opus-5", category: "bio" },
    ]);
    expect(s.pendingTools).toEqual([]);
    // The fallback model's own call still shows its placeholder until its tool_use lands.
    const next = reduceStreamEvent(s, { type: "tool_start", id: "t_new", name: "generate_document" });
    expect(next.pendingTools).toEqual([{ id: "t_new", name: "generate_document" }]);
    expect(reduceStreamEvent(next, { type: "tool_use", id: "t_new", name: "generate_document", input: {} }).pendingTools).toEqual([]);
  });

  it("a local stop is ignored once the stream already finished", () => {
    const done = run([{ type: "done", stopReason: "end_turn" }]);
    expect(finishStreamLocally(done, "stopped", "Stopped.")).toBe(done);
    const live = run([{ type: "text_delta", text: "x" }]);
    expect(finishStreamLocally(live, "stopped", "Stopped.").message.blocks?.at(-1)).toMatchObject({ kind: "stopped" });
  });
});

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c));
      controller.close();
    },
  });
}

describe("parseSSEStream", () => {
  it("parses frames split across chunks, including split multi-byte characters", async () => {
    const raw = new TextEncoder().encode(
      'event: text_delta\ndata: {"text":"Café ✓"}\n\nevent: tool_use\ndata: {"id":"t1","name":"display_chart","input":{"a":1}}\n\nevent: done\ndata: {}'
    );
    // Split inside "é" (2 bytes) and inside the second frame.
    const chunks = [raw.slice(0, 33), raw.slice(33, 60), raw.slice(60)];
    const events: SSEEvent[] = [];
    for await (const e of parseSSEStream(streamOf(chunks))) events.push(e);
    expect(events).toEqual([
      { type: "text_delta", text: "Café ✓" },
      { type: "tool_use", id: "t1", name: "display_chart", input: { a: 1 } },
      { type: "done" },
    ]);
  });

  it("skips unknown events and malformed JSON", async () => {
    const raw = new TextEncoder().encode('event: mystery\ndata: {"x":1}\n\nevent: text_delta\ndata: {broken\n\nevent: text_delta\ndata: {"text":"ok"}\n\n');
    const events: SSEEvent[] = [];
    for await (const e of parseSSEStream(streamOf([raw]))) events.push(e);
    expect(events).toEqual([{ type: "text_delta", text: "ok" }]);
  });

  it("keeps the original event shapes and parses the analyst-only fields", () => {
    expect(toSSEEvent("tool_result", { tool_use_id: "t", result: { a: 1 } })).toEqual({ type: "tool_result", tool_use_id: "t", result: { a: 1 } });
    expect(toSSEEvent("error", {})).toEqual({ type: "error", message: "Unknown error" });
    expect(toSSEEvent("done", { stopReason: "max_tokens", servedBy: "m" })).toEqual({ type: "done", stopReason: "max_tokens", servedBy: "m" });
    expect(toSSEEvent("refusal", { category: null, message: "no" })).toEqual({ type: "refusal", category: null, message: "no" });
    expect(toSSEEvent("progress_delta", { key: "1:0", text: "hi" })).toEqual({ type: "progress_delta", key: "1:0", text: "hi" });
  });

  it("cancels the response body when the consumer stops early", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: text_delta\ndata: {"text":"a"}\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const e of parseSSEStream(body)) {
      expect(e.type).toBe("text_delta");
      break;
    }
    expect(cancelled).toBe(true);
  });
});
