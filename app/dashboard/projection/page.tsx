"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { RevenueProjection } from "@/components/projection/RevenueProjection";

export default function ProjectionPageRoute() {
  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-black text-foreground">
            Revenue Projection
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Company-wide growth &amp; revenue model — project the active book and revenue from
            retention and new-account levers, seeded from live Client Directory MRR.
          </p>
        </div>
        <RevenueProjection />
      </div>
    </DashboardShell>
  );
}
