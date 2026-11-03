"use client";

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeDot, badgeButtonClass, badgeToneHover, badgeVariants, type BadgeTone } from "@/components/ui/badge";

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

  // Without an onClick it's a status label, not a disabled control.
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        badgeVariants({ variant: "outline", tone }),
        "gap-1.5 font-medium",
        onClick ? cn("cursor-pointer", badgeToneHover[tone], badgeButtonClass) : "cursor-default"
      )}
    >
      <BadgeDot tone={tone} />
      <FileText className="opacity-70" />
      {label}
    </Comp>
  );
}
