/** Loading shell shared by closer + setter dashboard pages and the admin
 *  "view as user" page. Matches the height of the rendered dashboard so
 *  layout doesn't jump on first paint. */
export function DashboardSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <div className="h-7 w-48 rounded bg-muted animate-pulse mb-2" />
        <div className="h-4 w-64 rounded bg-muted animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {Array.from({ length: tiles }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
    </div>
  );
}

export function DashboardError({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {message}
      </div>
    </div>
  );
}
