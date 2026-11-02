import { DashboardShell } from "@/components/layout/DashboardShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PanelSkeleton,
  SectionHeadingSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/overview/Skeletons";

/** Mirrors the Overview: glance cards, Revenue & sales, Clients & team, Meta ads. */
export default function DashboardLoading() {
  return (
    <DashboardShell wide>
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="space-y-4">
          <SectionHeadingSkeleton />
          <StatCardsSkeleton count={4} className="grid-cols-1 min-[360px]:grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4" />
        </div>
        <div className="space-y-4">
          <SectionHeadingSkeleton />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <PanelSkeleton height={300} />
            <PanelSkeleton height={300} />
          </div>
        </div>
        <div className="space-y-4">
          <SectionHeadingSkeleton />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <PanelSkeleton height={200} />
            <PanelSkeleton height={200} />
            <PanelSkeleton height={200} className="md:col-span-2 xl:col-span-1" />
          </div>
        </div>
        <div className="space-y-4">
          <SectionHeadingSkeleton />
          <StatCardsSkeleton count={5} />
          <StatCardsSkeleton count={5} />
          <PanelSkeleton height={280} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PanelSkeleton height={240} />
            <PanelSkeleton height={240} />
          </div>
          <TableSkeleton />
        </div>
      </div>
    </DashboardShell>
  );
}
