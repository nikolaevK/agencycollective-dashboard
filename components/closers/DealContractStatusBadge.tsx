"use client";

import { FileSignature } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeDot, badgeToneHover, badgeVariants, type BadgeTone } from "@/components/ui/badge";

interface Props {
  status: string | null;
  onClick?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Contract Pending", tone: "warning" },
  sent: { label: "Awaiting Signature", tone: "info" },
  viewed: { label: "Contract Viewed", tone: "info" },
  signed: { label: "Signed", tone: "success" },
  expired: { label: "Expired", tone: "danger" },
  declined: { label: "Declined", tone: "danger" },
};

export function DealContractStatusBadge({ status, onClick }: Props) {
  if (!status) return null;

  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        badgeVariants({ variant: "outline", tone: config.tone }),
        "gap-1.5 font-medium",
        onClick ? cn("cursor-pointer", badgeToneHover[config.tone]) : "cursor-default"
      )}
    >
      <BadgeDot tone={config.tone} />
      <FileSignature className="opacity-70" />
      {config.label}
    </button>
  );
}
