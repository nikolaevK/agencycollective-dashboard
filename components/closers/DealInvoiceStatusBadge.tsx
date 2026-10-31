"use client";

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeDot, badgeToneHover, badgeVariants, type BadgeTone } from "@/components/ui/badge";

interface Props {
  status: string | null;
  onClick?: () => void;
  /** admin mode shows "Review" for drafts, closer mode shows "Under Review" */
  isAdmin?: boolean;
}

export function DealInvoiceStatusBadge({ status, onClick, isAdmin }: Props) {
  if (!status) return null;

  const isDraft = status === "draft";
  const isSent = status === "sent";

  const label = isDraft
    ? isAdmin
      ? "Review"
      : "Under Review"
    : "Sent";
  const tone: BadgeTone = isDraft ? "warning" : isSent ? "success" : "neutral";

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        badgeVariants({ variant: "outline", tone }),
        "gap-1.5 font-medium",
        onClick ? cn("cursor-pointer", badgeToneHover[tone]) : "cursor-default"
      )}
    >
      <BadgeDot tone={tone} />
      <FileText className="opacity-70" />
      {label}
    </button>
  );
}
