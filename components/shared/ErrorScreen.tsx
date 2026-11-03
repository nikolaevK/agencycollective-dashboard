"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Body of the route error boundaries (app/error.tsx, app/dashboard/error.tsx).
 * A failed chunk download (deploy skew, dropped connection) is the common case
 * since many panels load lazily — only a full reload fixes those, so it's the
 * primary action; "Try again" re-renders the segment for everything else.
 */
export function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunkFailed = error.name === "ChunkLoadError" || /Loading (CSS )?chunk|dynamically imported module/i.test(error.message);

  useEffect(() => {
    console.error("[error-boundary]", error.name, error.message, error.digest ?? "");
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {chunkFailed ? "This page needs a reload" : "Something went wrong"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {chunkFailed
            ? "Part of the page couldn't be downloaded — usually because a new version was just released or the connection dropped."
            : "This part of the dashboard hit an unexpected error. Your saved data is not affected."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => window.location.reload()}>
          <RefreshCw aria-hidden />
          Reload page
        </Button>
        {!chunkFailed && (
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
