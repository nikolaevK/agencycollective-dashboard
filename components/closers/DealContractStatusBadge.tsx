"use client";

import { FileSignature } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  status: string | null;
  onClick?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Contract Pending",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  sent: {
    label: "Awaiting Signature",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  viewed: {
    label: "Contract Viewed",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
  },
  signed: {
    label: "Signed",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  expired: {
    label: "Expired",
    className: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
  declined: {
    label: "Declined",
    className: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
};

export function DealContractStatusBadge({ status, onClick }: Props) {
  if (!status) return null;

  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors",
        config.className,
        onClick && "cursor-pointer hover:opacity-80",
        !onClick && "cursor-default"
      )}
    >
      <FileSignature className="h-3 w-3" />
      {config.label}
    </button>
  );
}
