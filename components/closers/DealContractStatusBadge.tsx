"use client";

import { FileSignature } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeDot, badgeButtonClass, badgeToneHover, badgeVariants, type BadgeTone } from "@/components/ui/badge";

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

  // Without an onClick it's a status label, not a disabled control.
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        badgeVariants({ variant: "outline", tone: config.tone }),
        "gap-1.5 font-medium",
        onClick ? cn("cursor-pointer", badgeToneHover[config.tone], badgeButtonClass) : "cursor-default"
      )}
    >
      <BadgeDot tone={config.tone} />
      <FileSignature className="opacity-70" />
      {config.label}
    </Comp>
  );
}
