import { StatusBadge as KitStatusBadge, type BadgeTone } from "@/components/ui/badge";
import type { UserStatus } from "@/lib/users";

const STATUS_CONFIG: Record<UserStatus, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  onboarding: { label: "Onboarding", tone: "info" },
  inactive: { label: "Inactive", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
};

export function StatusBadge({ status, className }: { status: UserStatus; className?: string }) {
  const config = STATUS_CONFIG[status];
  return (
    <KitStatusBadge tone={config.tone} className={className}>
      {config.label}
    </KitStatusBadge>
  );
}
