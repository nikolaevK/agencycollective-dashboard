import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Route-loading placeholders shaped like the Overview / drill-down cards. */
/** `trend: false` for cards without a trend line (campaign / ad set KPIs). */
export function StatCardsSkeleton({
  count,
  trend = true,
  className,
}: {
  count: number;
  trend?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-4" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-32" />
            {trend && <Skeleton className="!mt-4 h-16 w-full" />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PanelSkeleton({ height = 260, className }: { height?: number; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton style={{ height }} className="w-full rounded-2xl" />
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

/** A section heading row (Overview sections). */
export function SectionHeadingSkeleton() {
  return <Skeleton className="h-4 w-28" />;
}

/** Breadcrumb + page title. */
export function DrilldownHeaderSkeleton() {
  return (
    <>
      <Skeleton className="h-4 w-56" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
    </>
  );
}
