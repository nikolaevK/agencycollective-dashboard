"use client";

import { Lightbulb, Target } from "lucide-react";
import { formatCents } from "@/components/closers/types";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  quota: number | null; // cents; null while loading
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
  const hasQuota = quota !== null && quota > 0;
  const progress = hasQuota ? Math.min((totalRevenue / quota) * 100, 100) : 0;
  const last3 = recentDeals.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Tip card */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Closer Tip</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Always confirm deal value and service scope before marking a deal as closed.
          Link existing clients when possible for better tracking.
        </p>
      </Card>

      {/* Deal Summary / Quota progress */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Monthly Target</span>
        </div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatCents(totalRevenue)}</span>
          {quota !== null && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {hasQuota ? `of ${formatCents(quota)}` : "No quota set"}
            </span>
          )}
        </div>
        <Progress value={progress} className="h-2 [&>div]:bg-chart-1 [&>div]:duration-500" />
        {hasQuota && (
          <p className="text-xs text-muted-foreground mt-2">
            {progress.toFixed(0)}% of monthly quota reached
          </p>
        )}
      </Card>

      {/* Recent closures */}
      {last3.length > 0 && (
        <Card className="p-5">
          <h4 className="text-sm font-medium mb-3">Recent Closures</h4>
          <div className="space-y-3">
            {last3.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between">
                <span className="min-w-0 text-sm text-foreground truncate mr-2">{deal.clientName}</span>
                <span className="text-sm font-medium tabular-nums text-foreground shrink-0">
                  {formatCents(deal.dealValue)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
