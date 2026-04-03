"use client";

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

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

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
        isDraft && "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
        isSent && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
        onClick && "cursor-pointer hover:opacity-80",
        !onClick && "cursor-default"
      )}
    >
      <FileText className="h-3 w-3" />
      {label}
    </button>
  );
}
