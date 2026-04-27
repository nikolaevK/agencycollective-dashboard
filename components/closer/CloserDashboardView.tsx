"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { CloserBentoGrid } from "@/components/closer/CloserBentoGrid";
import { CloserRecentDeals } from "@/components/closer/CloserRecentDeals";
import { PaginatedFollowUpList } from "@/components/closer/PaginatedFollowUpList";
import { TimeFrameSelector } from "@/components/shared/TimeFrameSelector";
import type { NoShowFollowUp } from "@/lib/eventAttendance";
import type { CloserDealStats } from "@/lib/deals";
import { TIME_FRAME_LABELS, type TimeFrame, type TimeFrameKey } from "@/lib/timeFrame";

export interface CloserDashboardData {
  closer: {
    id: string;
    displayName: string;
    role: string;
    quota: number;
    commissionRate: number;
  };
  stats: CloserDealStats;
  timeFrame: { since: string | null; until: string | null };
  recentDeals: Array<{
    id: string;
    closerId: string;
    clientName: string;
    clientUserId: string | null;
    dealValue: number;
    serviceCategory: string | null;
    closingDate: string | null;
    status: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  noShowFollowUps: NoShowFollowUp[];
  showedFollowUps: NoShowFollowUp[];
}

interface Props {
  data: CloserDashboardData;
  /** Selected time frame, owned by the page so it survives polling. */
  timeFrame: TimeFrame;
  onTimeFrameChange: (next: TimeFrame) => void;
  /** When true, hide mutation-only UI (mobile new-deal FAB). */
  readOnly?: boolean;
}

function windowLabel(tf: TimeFrame): string {
  if (tf.key === "custom" && tf.since && tf.until) return `${tf.since} → ${tf.until}`;
  return TIME_FRAME_LABELS[tf.key as TimeFrameKey] ?? "Selected window";
}

export function CloserDashboardView({ data, timeFrame, onTimeFrameChange, readOnly }: Props) {
  const isLifetimeWindow = timeFrame.key === "all";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {data.closer.displayName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here&apos;s your sales performance overview
        </p>
      </div>

      {/* Time-frame selector */}
      <div className="mb-6">
        <TimeFrameSelector value={timeFrame} onChange={onTimeFrameChange} />
      </div>

      {/* Metrics — lifetime + selected window */}
      <CloserBentoGrid
        lifetime={data.stats.lifetime}
        window={data.stats.window}
        windowLabel={windowLabel(timeFrame)}
        isLifetimeWindow={isLifetimeWindow}
        quota={data.closer.quota}
      />

      {/* Recent deals */}
      <CloserRecentDeals deals={data.recentDeals as never[]} />

      {/* No-show follow-ups (scoped to this closer's own marks) */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground mb-3">No-show follow-ups</h2>
        <PaginatedFollowUpList items={data.noShowFollowUps} variant="closer" />
      </section>

      {/* Showed leads */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-foreground mb-3">Showed leads</h2>
        <PaginatedFollowUpList
          items={data.showedFollowUps}
          variant="closer"
          tone="showed"
          emptyText="No showed leads marked yet."
        />
      </section>

      {!readOnly && (
        <Link
          href="/closer/new-deal"
          className="md:hidden fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full ac-gradient text-white shadow-lg shadow-primary/25 active:scale-95 transition-transform"
          aria-label="New deal"
        >
          <Plus className="h-6 w-6" />
        </Link>
      )}
    </div>
  );
}
