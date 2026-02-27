import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartContainerProps {
  children: React.ReactNode;
  isLoading?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  title?: string;
  className?: string;
  height?: number;
}

export function ChartContainer({
  children,
  isLoading,
  error,
  isEmpty,
  title,
  className,
  height = 300,
}: ChartContainerProps) {
  if (isLoading) {
    return (
      <div className={cn("w-full", className)}>
        {title && <Skeleton className="mb-3 h-5 w-32" />}
        <Skeleton style={{ height }} className="w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-destructive",
          className
        )}
        style={{ height }}
      >
        <AlertTriangle className="h-8 w-8 opacity-60" />
        <p className="text-sm font-medium">Failed to load chart</p>
        <p className="text-xs opacity-60">{error.message}</p>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground",
          className
        )}
        style={{ height }}
      >
        <BarChart3 className="h-8 w-8 opacity-40" />
        <p className="text-sm">No data for this period</p>
      </div>
    );
  }

  return <div className={cn("w-full", className)}>{children}</div>;
}
