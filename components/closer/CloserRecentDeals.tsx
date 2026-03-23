"use client";

import { cn } from "@/lib/utils";
import { Link2 } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import type { DealPublic } from "@/components/closers/types";
import { format } from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  closed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  not_closed: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  pending_signature: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  in_progress: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
};

const STATUS_LABELS: Record<string, string> = {
  closed: "Closed",
  not_closed: "Not Closed",
  pending_signature: "Pending",
  in_progress: "In Progress",
};

function DealStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
        STATUS_STYLES[status] ?? STATUS_STYLES.in_progress
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

interface Props {
  deals: DealPublic[];
}

export function CloserRecentDeals({ deals }: Props) {
  const recent = deals.slice(0, 10);

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card">
      <div className="p-5 border-b border-border/50 dark:border-white/[0.06]">
        <h3 className="text-sm font-semibold text-foreground">Recent Closings</h3>
      </div>

      {recent.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No deals yet. Create your first deal!</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 dark:border-white/[0.06]">
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Client</th>
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Amount</th>
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Status</th>
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((deal) => (
                  <tr
                    key={deal.id}
                    className="border-b border-border/50 dark:border-white/[0.06] last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {deal.clientName}
                        {deal.clientUserId && <Link2 className="h-3 w-3 text-primary shrink-0" />}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-semibold text-foreground">{formatCents(deal.dealValue)}</td>
                    <td className="px-5 py-3"><DealStatusBadge status={deal.status} /></td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(deal.closingDate || deal.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border/50 dark:divide-white/[0.06]">
            {recent.map((deal) => (
              <div key={deal.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{deal.clientName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDate(deal.closingDate || deal.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <DealStatusBadge status={deal.status} />
                  <span className="text-sm font-semibold text-foreground">
                    {formatCents(deal.dealValue)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
