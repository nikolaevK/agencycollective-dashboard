"use client";

import { format, parseISO } from "date-fns";
import { formatCents } from "@/components/closers/types";
import { cn } from "@/lib/utils";
import { DealStatusBadge } from "@/components/closers/DealStatusBadge";
import { DealInvoiceStatusBadge } from "@/components/closers/DealInvoiceStatusBadge";
import { DealContractStatusBadge } from "@/components/closers/DealContractStatusBadge";
import { SETTER_TIER_BADGE } from "@/lib/appointments";
import type { SetterRecentDeal } from "@/lib/setterStats";

interface Props {
  deals: SetterRecentDeal[];
}


function formatDate(raw: string | null): string {
  if (!raw) return "—";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split("-").map(Number);
      return format(new Date(y, m - 1, d), "MMM d, yyyy");
    }
    return format(parseISO(raw), "MMM d, yyyy");
  } catch {
    return raw;
  }
}

export function SetterRecentDeals({ deals }: Props) {
  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-card/50 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          No deals attributed yet. Claim calendar events in <span className="font-medium text-foreground">Appointments</span> — when a closer books a deal for one, you&apos;ll be credited automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">Closer</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Value</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Contract</th>
              <th className="px-4 py-3">Paid</th>
              <th className="px-4 py-3">Closing</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id} className="border-t border-border/50 dark:border-white/[0.04]">
                <td className="px-4 py-3 font-medium text-foreground truncate max-w-[12rem]">{d.clientName}</td>
                <td className="px-4 py-3 text-muted-foreground">{d.closerName ?? "—"}</td>
                <td className="px-4 py-3">
                  {d.setterTier ? (
                    <span
                      className={cn(
                        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        SETTER_TIER_BADGE[d.setterTier]
                      )}
                      title={d.noRetainer ? "No-retainer deal — capped at $500 payout per §3.8" : undefined}
                    >
                      {d.setterTier}
                      {d.noRetainer && <span className="ml-1 opacity-70">·NR</span>}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono tabular-nums">{formatCents(d.dealValue)}</td>
                <td className="px-4 py-3">
                  <DealStatusBadge status={d.status} compact />
                </td>
                <td className="px-4 py-3">
                  {d.invoiceStatus ? (
                    <DealInvoiceStatusBadge status={d.invoiceStatus} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {d.contractStatus ? (
                    <DealContractStatusBadge status={d.contractStatus} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                      d.paidStatus === "paid"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : "bg-muted/50 text-muted-foreground"
                    )}
                  >
                    {d.paidStatus}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(d.closingDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
