import { cn } from "@/lib/utils";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface AvatarInitialsProps {
  name: string;
  className?: string;
}

/** Neutral initials tile (kit Avatar fallback look) for clients without a logo. */
export function AvatarInitials({ name, className }: AvatarInitialsProps) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-1 ring-border",
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}
