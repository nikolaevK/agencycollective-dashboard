import { describe, expect, it } from "vitest";
import { isTableSeparator, parseInline, parseListLine, pdfSafe, splitTableCells } from "@/lib/mediaChat/pdfText";

describe("pdfSafe", () => {
  it("maps symbols the standard PDF fonts can't print to readable ASCII", () => {
    expect(pdfSafe("CPA → $31 ≥ target ✓")).toBe("CPA -> $31 >= target [x]");
    expect(pdfSafe("Spend ≈ $2k, ROAS ≤ 3 − 1")).toBe("Spend ~ $2k, ROAS <= 3 - 1");
  });

  it("keeps Windows-1252 typography and Latin-1 letters", () => {
    expect(pdfSafe("“Quoted” — en–dash … • café €5 ×2 ²")).toBe("“Quoted” — en–dash … • café €5 ×2 ²");
  });

  it("drops emoji and invisible characters, folds accents it can't print", () => {
    expect(pdfSafe("Launch 🚀 now​! ✅ Done")).toBe("Launch  now! [x] Done");
    // ó is Latin-1 (kept); Ł has no base-letter decomposition (dropped).
    expect(pdfSafe("Čapek Łódź ő")).toBe("Capek ódz o");
    expect(pdfSafe("ﬁnal")).toBe("final");
  });
});

describe("parseInline", () => {
  const text = (s: string) => parseInline(s).map((r) => r.text).join("");

  it("parses bold, italic, bold-italic, code and nested emphasis", () => {
    expect(parseInline("a **b** *c* ***d*** `e`")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " " },
      { text: "c", italic: true },
      { text: " " },
      { text: "d", bold: true, italic: true },
      { text: " " },
      { text: "e", code: true },
    ]);
    expect(parseInline("**Owner: _Head of Paid_**")).toEqual([
      { text: "Owner: ", bold: true },
      { text: "Head of Paid", bold: true, italic: true },
    ]);
  });

  it("leaves snake_case names, arithmetic and escaped markers alone", () => {
    expect(text("Track last_30d_roas and ACME_PROSPECT_BROAD_V1")).toBe("Track last_30d_roas and ACME_PROSPECT_BROAD_V1");
    expect(text("Budget 2*3*4 = 24, price $5 * 3")).toBe("Budget 2*3*4 = 24, price $5 * 3");
    expect(text("\\*not italic\\* and a \\| pipe")).toBe("*not italic* and a | pipe");
    expect(parseInline("Use `last_30d_roas` here").find((r) => r.code)?.text).toBe("last_30d_roas");
  });

  it("keeps link URLs, drops image URLs, flattens <br>", () => {
    expect(text("See [the guide](https://example.com/g) or <https://a.io>")).toBe("See the guide (https://example.com/g) or https://a.io");
    expect(text("[https://x.io](https://x.io)")).toBe("https://x.io");
    expect(text("Logo: ![ACME logo](https://cdn.io/l.png)")).toBe("Logo: ACME logo");
    expect(text("line one<br>line two")).toBe("line one line two");
    expect(text("~~old~~ new")).toBe("old new");
  });

  it("keeps angle-bracket placeholders (naming conventions)", () => {
    expect(text("<ClientCode>_<CampaignType>_<Date>")).toBe("<ClientCode>_<CampaignType>_<Date>");
  });
});

describe("table + list helpers", () => {
  it("splits cells, honoring escaped pipes and optional outer pipes", () => {
    expect(splitTableCells("| a | b \\| c | d |")).toEqual(["a", "b \\| c", "d"]);
    expect(splitTableCells("a | b")).toEqual(["a", "b"]);
    expect(parseInline(splitTableCells("| x \\| y |")[0]).map((r) => r.text).join("")).toBe("x | y");
  });

  it("recognizes separator rows", () => {
    expect(isTableSeparator("|---|:---:|--:|")).toBe(true);
    expect(isTableSeparator("--- | ---")).toBe(true);
    expect(isTableSeparator("| a | b |")).toBe(false);
  });

  it("parses bullets, numbers, tasks and nesting depth", () => {
    expect(parseListLine("- item")).toEqual({ depth: 0, ordered: false, n: 0, task: null, text: "item" });
    expect(parseListLine("    3. third")).toEqual({ depth: 2, ordered: true, n: 3, task: null, text: "third" });
    expect(parseListLine("  * [x] done")).toEqual({ depth: 1, ordered: false, n: 0, task: "x", text: "done" });
    expect(parseListLine("1.5x ROAS")).toBeNull();
    expect(parseListLine("plain text")).toBeNull();
  });
});
