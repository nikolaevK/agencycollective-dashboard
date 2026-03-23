"use client";

import { Lightbulb, Target } from "lucide-react";
import { formatCents } from "@/components/closers/types";

interface Props {
  quota: number; // cents
  totalRevenue: number; // cents
  recentDeals: Array<{
    id: string;
    clientName: string;
    dealValue: number;
    status: string;
    createdAt: string;
  }>;
}

export function DealSidebar({ quota, totalRevenue, recentDeals }: Props) {
  const progress = quota > 0 ? Math.min((totalRevenue / quota) * 100, 100) : 0;
  const last3 = recentDeals.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Tip card */}
      <div className="rounded-xl ac-gradient p-5 text-white">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-5 w-5" />
          <span className="text-sm font-semibold">Closer Tip</span>
        </div>
        <p className="text-xs leading-relaxed opacity-90">
          Always confirm deal value and service scope before marking a deal as closed.
          Link existing clients when possible for better tracking.
        </p>
      </div>

      {/* Deal Summary / Quota progress */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Monthly Target</span>
        </div>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-2xl font-bold text-foreground">{formatCents(totalRevenue)}</span>
          <span className="text-xs text-muted-foreground">of {formatCents(quota)}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full ac-gradient transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {progress.toFixed(0)}% of monthly quota reached
        </p>
      </div>

      {/* Recent closures */}
      {last3.length > 0 && (
        <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5">
          <h4 className="text-sm font-semibold text-foreground mb-3">Recent Closures</h4>
          <div className="space-y-3">
            {last3.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between">
                <span className="text-sm text-foreground truncate mr-2">{deal.clientName}</span>
                <span className="text-sm font-semibold text-foreground shrink-0">
                  {formatCents(deal.dealValue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
