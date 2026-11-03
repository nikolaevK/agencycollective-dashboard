import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the Creative Studio shell: title, tab row, tool panel. */
export default function CreativeLoading() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="mx-auto w-full max-w-[120rem] shrink-0 space-y-3 px-4 pt-3 md:space-y-4 md:px-6 md:pt-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 md:h-8" />
          <Skeleton className="hidden h-4 w-96 max-w-full md:block" />
        </div>
        <Skeleton className="h-9 w-[28rem] max-w-full rounded-4xl" />
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[120rem] flex-1 flex-col px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-6 md:pt-4">
        <Skeleton className="h-full min-h-[24rem] w-full flex-1 rounded-3xl" />
      </div>
    </main>
  );
}
