"use client";

import { cn } from "@/lib/utils";
import type { DisplayTableInput } from "@/types/chat";

function formatCell(value: unknown, format?: string): string {
  if (value == null) return "—";
  const num = typeof value === "number" ? value : parseFloat(String(value));

  switch (format) {
    case "currency":
      if (isNaN(num)) return String(value);
      if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
      if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
      return `$${num.toFixed(2)}`;
    case "percent":
      if (isNaN(num)) return String(value);
      return `${num.toFixed(2)}%`;
    case "number":
      if (isNaN(num)) return String(value);
      return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    default:
      return String(value);
  }
}

export function InlineTable({ input }: { input: DisplayTableInput }) {
  const { title, columns, rows } = input;

  if (!rows || rows.length === 0) {
    return (
      <div className="my-3 p-4 bg-muted/30 rounded-xl border border-border/50 text-center text-xs text-muted-foreground">
        No data available
      </div>
    );
  }

  return (
    <div className="my-3">
      {title && (
        <p className="text-xs font-semibold text-foreground mb-2">{title}</p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border/50">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/60">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap",
                    (col.format === "currency" || col.format === "number" || col.format === "percent") && "text-right"
                  )}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map((row, i) => (
              <tr key={i} className="even:bg-muted/20 hover:bg-muted/30 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-3 py-2 text-xs text-foreground/80 whitespace-nowrap",
                      (col.format === "currency" || col.format === "number" || col.format === "percent") && "text-right tabular-nums"
                    )}
                  >
                    {formatCell(row[col.key], col.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
