import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Loading shell shared by closer + setter dashboard pages and the admin
 *  "view as user" page. Matches the height of the rendered dashboard so
 *  layout doesn't jump on first paint. */
export function DashboardSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <Skeleton className="h-7 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {Array.from({ length: tiles }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 md:pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-4" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <Card>
        <CardContent className="p-6 md:p-6 text-sm text-destructive">
          {message}
        </CardContent>
      </Card>
    </div>
  );
}
