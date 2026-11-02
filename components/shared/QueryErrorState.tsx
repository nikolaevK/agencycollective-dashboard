"use client";

import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <Card
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className
      )}
    >
      <AlertCircle className="size-6 text-muted-foreground" />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RotateCw />
          Retry
        </Button>
      )}
    </Card>
  );
}
