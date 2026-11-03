import { describe, expect, it } from "vitest";
import {
  buildApiHistory,
  DEFAULT_HISTORY_BUDGET,
  INTERRUPTED_REPLY_TEXT,
  repairToolPairs,
  toApiMessages,
  trimHistory,
} from "@/lib/analyst/history";
import type { ApiChatMessage, ChatMessage } from "@/types/chat";

const user = (content: string, id = content): ChatMessage => ({ id, role: "user", content });

describe("toApiMessages", () => {
  it("keeps block order: text+calls, then results, then the continuation", () => {
    const msgs: ChatMessage[] = [
      user("q1"),
      {
        id: "a1",
        role: "assistant",
        content: "",
        blocks: [
          { type: "text", text: "Looking." },
          { type: "progress", key: "1:0", text: "checking" },
          { type: "tool_use", id: "t1", name: "display_metrics", input: { metrics: [] } },
          { type: "tool_use", id: "t2", name: "display_table", input: {} },
          { type: "tool_result", tool_use_id: "t1", content: "Displayed" },
          { type: "tool_result", tool_use_id: "t2", content: "Displayed" },
          { type: "text", text: "Next, " },
          { type: "text", text: "a chart." },
          { type: "tool_use", id: "t3", name: "fetch_landing_page", input: { url: "https://x.com" } },
          { type: "tool_result", tool_use_id: "t3", content: "Read 10 characters", historyContent: "<landing_page>…" },
          { type: "text", text: "Done." },
          { type: "notice", kind: "stopped", text: "Stopped." },
        ],
      },
    ];
    expect(toApiMessages(msgs)).toEqual([
      { role: "user", content: "q1" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Looking." },
          { type: "tool_use", id: "t1", name: "display_metrics", input: { metrics: [] } },
          { type: "tool_use", id: "t2", name: "display_table", input: {} },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "Displayed" },
          { type: "tool_result", tool_use_id: "t2", content: "Displayed" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Next, a chart." },
          { type: "tool_use", id: "t3", name: "fetch_landing_page", input: { url: "https://x.com" } },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", content: "<landing_page>…" }] },
      { role: "assistant", content: [{ type: "text", text: "Done." }] },
    ]);
  });

  it("serializes report results and marks failed tools", () => {
    const out = toApiMessages([
      user("q"),
      {
        id: "a",
        role: "assistant",
        content: "",
        blocks: [
          { type: "tool_use", id: "r1", name: "generate_report", input: {} },
          { type: "tool_result", tool_use_id: "r1", content: "Account not found", isError: true },
        ],
      },
    ]);
    expect(out[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "r1", content: "Account not found", is_error: true }],
    });
  });
});

describe("repairToolPairs", () => {
  it("drops a call that never got a result (stopped reply) so the next request isn't a 400", () => {
    const history: ApiChatMessage[] = [
      { role: "user", content: "q1" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Building a report" },
          { type: "tool_use", id: "t1", name: "generate_report", input: {} },
        ],
      },
      { role: "user", content: "q2" },
    ];
    expect(repairToolPairs(history)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: [{ type: "text", text: "Building a report" }] },
      { role: "user", content: "q2" },
    ]);
  });

  it("drops orphan results, empty text and empty messages, and starts at a typed user message", () => {
    const history: ApiChatMessage[] = [
      { role: "assistant", content: "stale" },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "zz", content: "x" }] },
      { role: "user", content: "q1" },
      { role: "assistant", content: [{ type: "text", text: "   " }, { type: "tool_use", id: "t9", name: "x", input: {} }] },
      { role: "user", content: "q2" },
    ];
    expect(repairToolPairs(history)).toEqual([
      { role: "user", content: "q1" },
      { role: "user", content: "q2" },
    ]);
  });
});

describe("trimHistory / buildApiHistory", () => {
  it("cuts the oldest exchanges only at a user's own message", () => {
    const history: ApiChatMessage[] = [];
    for (let i = 0; i < 30; i++) {
      history.push({ role: "user", content: `q${i}` });
      history.push({ role: "assistant", content: [{ type: "tool_use", id: `t${i}`, name: "x", input: {} }] });
      history.push({ role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "ok" }] });
      history.push({ role: "assistant", content: `a${i}` });
    }
    const trimmed = trimHistory(history, { maxMessages: 40, maxBytes: 1_000_000 });
    expect(trimmed.length).toBeLessThanOrEqual(40);
    expect(trimmed[0]).toEqual({ role: "user", content: "q20" });
    expect(repairToolPairs(trimmed)).toEqual(trimmed);
  });

  it("respects the char budget but always keeps the newest question", () => {
    const big = "x".repeat(5_000);
    const msgs: ChatMessage[] = [user(big, "1"), { id: "2", role: "assistant", content: big }, user("latest", "3")];
    expect(buildApiHistory(msgs, { maxMessages: 40, maxBytes: 6_000 })).toEqual([{ role: "user", content: "latest" }]);
  });

  it("budgets UTF-8 bytes of the JSON, not characters (the routes cap the body in bytes)", () => {
    const euros = "€".repeat(1_000); // 1,000 characters, 3,000 bytes
    const history: ApiChatMessage[] = [
      { role: "user", content: euros },
      { role: "assistant", content: "ok" },
      { role: "user", content: "latest" },
    ];
    expect(trimHistory(history, { maxMessages: 40, maxBytes: 2_500 })).toEqual([{ role: "user", content: "latest" }]);
    expect(trimHistory(history, { maxMessages: 40, maxBytes: 3_100 })).toEqual(history);
    // Newlines and quotes are escaped in the JSON body (2 bytes each).
    const escaped: ApiChatMessage[] = [{ role: "user", content: "\n".repeat(1_000) }, { role: "user", content: "q" }];
    expect(trimHistory(escaped, { maxMessages: 40, maxBytes: 1_500 })).toEqual([{ role: "user", content: "q" }]);
  });

  it("the default budget leaves room for the rest of a 512 KB request body", () => {
    // Worst case besides the messages: 50 + 200 selection ids of 64 chars, plus JSON framing.
    const overhead = 250 * (64 + 3) + DEFAULT_HISTORY_BUDGET.maxMessages * 40 + 1_000;
    expect(DEFAULT_HISTORY_BUDGET.maxBytes + overhead).toBeLessThan(512_000);
  });
});

describe("repairToolPairs — interrupted tool rounds", () => {
  const call: ApiChatMessage = {
    role: "assistant",
    content: [
      { type: "text", text: "Fetching the page." },
      { type: "tool_use", id: "t1", name: "fetch_landing_page", input: { url: "https://a.com" } },
    ],
  };
  const result: ApiChatMessage = { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "<landing_page>…" }] };
  const closer: ApiChatMessage = { role: "assistant", content: [{ type: "text", text: INTERRUPTED_REPLY_TEXT }] };

  /** Every tool round is closed by an assistant turn before the next user text; results never share a turn with text. */
  function assertRoundsClosed(history: ApiChatMessage[]) {
    history.forEach((msg, i) => {
      if (msg.role !== "user" || typeof msg.content === "string") return;
      const hasResults = msg.content.some((b) => b.type === "tool_result");
      if (!hasResults) return;
      expect(msg.content.every((b) => b.type === "tool_result")).toBe(true);
      if (i < history.length - 1) expect(history[i + 1].role).toBe("assistant");
    });
  }

  it("closes a round stopped right after its results, keeping the results", () => {
    const history: ApiChatMessage[] = [{ role: "user", content: "q1" }, call, result, { role: "user", content: "q2" }];
    const repaired = repairToolPairs(history);
    expect(repaired).toEqual([{ role: "user", content: "q1" }, call, result, closer, { role: "user", content: "q2" }]);
    assertRoundsClosed(repaired);
    // Idempotent — the client and the server both repair.
    expect(repairToolPairs(repaired)).toEqual(repaired);
  });

  it("splits results and text that share one user turn", () => {
    const mixed: ApiChatMessage = {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "x" }, { type: "text", text: "and now?" }],
    };
    const repaired = repairToolPairs([{ role: "user", content: "q1" }, call, mixed]);
    expect(repaired).toEqual([
      { role: "user", content: "q1" },
      call,
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "x" }] },
      closer,
      { role: "user", content: [{ type: "text", text: "and now?" }] },
    ]);
    assertRoundsClosed(repaired);
  });

  it("leaves completed rounds alone", () => {
    const done: ApiChatMessage = { role: "assistant", content: [{ type: "text", text: "Here's the audit." }] };
    const history: ApiChatMessage[] = [{ role: "user", content: "q1" }, call, result, done, { role: "user", content: "q2" }];
    expect(repairToolPairs(history)).toEqual(history);
  });

  it("survives the client's convert → repair → trim → repair pipeline", () => {
    const msgs: ChatMessage[] = [
      user("q1"),
      {
        id: "a1",
        role: "assistant",
        content: "",
        blocks: [
          { type: "tool_use", id: "t1", name: "display_metrics", input: { metrics: [] } },
          { type: "tool_result", tool_use_id: "t1", content: "Displayed" },
          { type: "notice", kind: "stopped", text: "Stopped." },
        ],
      },
      user("q2"),
    ];
    const history = buildApiHistory(msgs);
    assertRoundsClosed(history);
    expect(history.at(-2)).toEqual(closer);
    expect(history.at(-1)).toEqual({ role: "user", content: "q2" });
  });
});
