"use client";

import { AlertCircle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Full-surface error state for failed directory/list queries. Without it a
 * failed fetch renders as an empty list — indistinguishable from "no data".
 */
export function QueryErrorState({
  title = "Couldn't load data",
  message = "Something went wrong while loading. Your session may have expired.",
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/50 bg-card px-6 py-16 text-center",
        className
      )}
    >
      <AlertCircle className="h-8 w-8 text-red-500/70" />
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}
