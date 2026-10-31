import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import type { CloserStatus } from "@/lib/closers";

const STATUS_CONFIG: Record<CloserStatus, { label: string; tone: BadgeTone }> = {
  active: {
    label: "Active",
    tone: "success",
  },
  inactive: {
    label: "Inactive",
    tone: "neutral",
  },
};

export function CloserStatusBadge({ status }: { status: CloserStatus }) {
  const config = STATUS_CONFIG[status];
  return <StatusBadge tone={config.tone}>{config.label}</StatusBadge>;
}
