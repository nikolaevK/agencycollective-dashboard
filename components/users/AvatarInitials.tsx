import { cn } from "@/lib/utils";

const COLORS = [
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % COLORS.length;
}

interface AvatarInitialsProps {
  name: string;
  className?: string;
}

export function AvatarInitials({ name, className }: AvatarInitialsProps) {
  const initials = getInitials(name);
  const colorCls = COLORS[hashIndex(name)];

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg font-bold text-sm shrink-0",
        "w-10 h-10",
        colorCls,
        className
      )}
    >
      {initials}
    </div>
  );
}
