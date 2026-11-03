"use client";

import { memo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatValue } from "@/lib/analyst/format";
import { clipboardCell } from "@/components/chat/tool-renderers/tableClipboard";
import type { DisplayTableInput } from "@/types/chat";

const COLLAPSED_ROWS = 12;

function isNumeric(format?: string) {
  return format === "currency" || format === "number" || format === "percent";
}

/** Memoized: a finished table doesn't re-render while the rest of the reply streams. */
export const InlineTable = memo(function InlineTable({ input }: { input: DisplayTableInput }) {
  const { title, columns = [], rows = [], currency } = input;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (rows.length === 0 || columns.length === 0) {
    return <Card className="p-4 text-center text-xs text-muted-foreground shadow-none">No data available.</Card>;
  }


  async function copyTsv() {
    // Tab-separated so it pastes straight into Sheets / Excel (formulas neutralized — the table shows the raw text).
    const lines = [
      columns.map((c) => clipboardCell(c.label, c.label)).join("\t"),
      ...rows.map((r) => columns.map((c) => clipboardCell(r[c.key], formatValue(r[c.key], c.format, currency))).join("\t")),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (permissions / insecure context) — nothing to do.
    }
  }

  return (
    <Card className="min-w-0 shadow-none">
      <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
        <p className="min-w-0 truncate text-sm font-medium tracking-tight">{title || "Table"}</p>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-2 shrink-0 text-muted-foreground"
          onClick={copyTsv}
          aria-label={copied ? "Copied" : "Copy table for a spreadsheet"}
          title={copied ? "Copied" : "Copy table (paste into Sheets / Excel)"}
          data-pdf-ignore=""
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn("h-9 px-4 text-xs text-muted-foreground", isNumeric(col.format) && "text-right")}
              >
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Collapsed rows stay in the DOM, hidden + marked, so the PDF export
              (messagePdf) prints every row while "Show all" is left out. */}
          {rows.map((row, i) => {
            const collapsed = !expanded && i >= COLLAPSED_ROWS;
            return (
              <TableRow key={i} hidden={collapsed} data-collapsed={collapsed ? "" : undefined}>
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      "px-4 py-2",
                      isNumeric(col.format) ? "text-right tabular-nums" : "min-w-[8rem] max-w-[22rem] whitespace-normal"
                    )}
                  >
                    {formatValue(row[col.key], col.format ?? "text", currency)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {rows.length > COLLAPSED_ROWS && (
        // Collapsed, the last shown row keeps its bottom border (it isn't :last-child).
        <div className={cn("px-4 py-2", expanded && "border-t")} data-pdf-ignore="">
          <Button variant="ghost" size="xs" onClick={() => setExpanded((v) => !v)} className="text-muted-foreground">
            {expanded ? "Show fewer rows" : `Show all ${rows.length} rows`}
          </Button>
        </div>
      )}
    </Card>
  );
});
