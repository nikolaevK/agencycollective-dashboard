"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";

interface SetupBannerProps {
  show: boolean;
}

export function SetupBanner({ show }: SetupBannerProps) {
  if (!show) return null;

  return (
    <div className={cn("flex items-center gap-3 rounded-3xl border px-4 py-3 text-sm", badgeTone.warning)}>
      <AlertTriangle className="size-4 shrink-0" />
      <span>
        Meta access token not configured. Dashboard data is unavailable.
      </span>
      <Link
        href="/dashboard/settings"
        className="ml-auto shrink-0 rounded-sm font-medium underline underline-offset-2 outline-none hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        Go to Settings →
      </Link>
    </div>
  );
}
