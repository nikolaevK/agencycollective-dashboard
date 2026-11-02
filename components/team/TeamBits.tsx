import Image from "next/image";
import { Flag, Zap } from "lucide-react";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TASK_PRIORITY_META, TASK_STATUS_META } from "./presentation";
import type { TaskPriority, TaskStatus, TeamTaskRecord } from "./types";

// ---------------------------------------------------------------------------
// Small shared pieces of the Team hub in the shadcn kit look — used by the
// overview, the member hub, the task list / board, the tagged list and the
// roster dialog, so every surface draws a member, a status or a due date the
// same way.
// ---------------------------------------------------------------------------

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_SIZE = {
  sm: { px: 28, cls: "size-7 text-[10px]" },
  md: { px: 40, cls: "size-10 text-sm" },
  lg: { px: 56, cls: "size-14 text-lg" },
} as const;

/** A team member's photo, or neutral initials (kit Avatar look). */
export function MemberAvatar({
  name,
  avatarPath,
  size = "md",
  className,
}: {
  name: string;
  avatarPath: string | null;
  size?: keyof typeof AVATAR_SIZE;
  className?: string;
}) {
  const { px, cls } = AVATAR_SIZE[size];
  if (avatarPath) {
    return (
      <span className={cn("relative shrink-0 overflow-hidden rounded-full ring-1 ring-border", cls, className)}>
        <Image src={avatarPath} alt="" width={px} height={px} className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-1 ring-border",
        cls,
        className
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** The task's status as a small toned dot (with the label for screen readers). */
export function TaskStatusDot({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0", className)} title={TASK_STATUS_META[status].label}>
      <BadgeDot tone={TASK_STATUS_META[status].tone} />
      <span className="sr-only">{TASK_STATUS_META[status].label}</span>
    </span>
  );
}

/** Priority flag — colored only for urgent / high. */
export function PriorityFlag({ priority, className }: { priority: TaskPriority; className?: string }) {
  const meta = TASK_PRIORITY_META[priority];
  return (
    <Flag
      aria-label={`${meta.label} priority`}
      className={cn("size-3.5 shrink-0", meta.flag, className)}
    />
  );
}

/** The task's client as a neutral outline badge (hidden when unknown). */
export function ClientChip({
  hub,
  clientId,
  className,
}: {
  hub: { clients: Array<{ id: string; displayName: string }> };
  clientId: string;
  className?: string;
}) {
  const client = hub.clients.find((c) => c.id === clientId);
  if (!client) return null;
  return (
    <Badge
      variant="outline"
      className={cn("block max-w-[160px] truncate font-normal text-muted-foreground", className)}
      title={client.displayName}
    >
      {client.displayName}
    </Badge>
  );
}

/** Due date: red when overdue, amber when due today, muted otherwise. */
export function DueLabel({ task: t, today }: { task: TeamTaskRecord; today: string }) {
  if (!t.dueDate) return null;
  const overdue = t.status !== "complete" && t.dueDate < today;
  const isToday = t.dueDate === today && t.status !== "complete";
  const label = isToday
    ? "Today"
    : new Date(`${t.dueDate}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
  return (
    <span
      className={cn(
        "shrink-0 text-xs tabular-nums",
        overdue
          ? "font-medium text-red-700 dark:text-red-400"
          : isToday
            ? "font-medium text-amber-700 dark:text-amber-400"
            : "text-muted-foreground"
      )}
    >
      {overdue ? `Overdue · ${label}` : label}
    </span>
  );
}

/** Unsolved action-item count (renders nothing at 0). */
export function UnsolvedBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge variant="outline" tone="warning" className="tabular-nums">
      <Zap />
      {count}
    </Badge>
  );
}
