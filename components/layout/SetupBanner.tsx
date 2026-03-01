"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface SetupBannerProps {
  show: boolean;
}

export function SetupBanner({ show }: SetupBannerProps) {
  if (!show) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
      <span>
        Meta access token not configured. Dashboard data is unavailable.
      </span>
      <Link
        href="/dashboard/settings"
        className="ml-auto shrink-0 font-medium underline underline-offset-2 hover:opacity-80"
      >
        Go to Settings →
      </Link>
    </div>
  );
}
