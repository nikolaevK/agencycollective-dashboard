"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface SetupBannerProps {
  show: boolean;
}

export function SetupBanner({ show }: SetupBannerProps) {
  if (!show) return null;

  return (
    <div className="flex items-center gap-3 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
      <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
      <span>
        Meta access token not configured. Dashboard data is unavailable.
      </span>
      <Link
        href="/dashboard/settings"
        className="ml-auto shrink-0 font-medium underline underline-offset-2 hover:text-yellow-900"
      >
        Go to Settings →
      </Link>
    </div>
  );
}
