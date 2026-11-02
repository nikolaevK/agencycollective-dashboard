import { DashboardShell } from "@/components/layout/DashboardShell";
import {
  DrilldownHeaderSkeleton,
  PanelSkeleton,
  StatCardsSkeleton,
  TableSkeleton,
} from "@/components/overview/Skeletons";

export default function AccountLoading() {
  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <DrilldownHeaderSkeleton />
        <StatCardsSkeleton count={5} />
        <StatCardsSkeleton count={5} />
        <PanelSkeleton height={280} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PanelSkeleton height={200} />
          <PanelSkeleton height={200} />
        </div>
        <TableSkeleton />
      </div>
    </DashboardShell>
  );
}
