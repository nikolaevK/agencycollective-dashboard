import { cn } from "@/lib/utils";
import { formatRole } from "./types";

const ROLE_COLORS: Record<string, string> = {
  senior_closer: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  account_executive: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  inbound_specialist: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400",
  closer: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-400",
};

export function CloserRoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide",
        ROLE_COLORS[role] ?? ROLE_COLORS.closer
      )}
    >
      {formatRole(role)}
    </span>
  );
}
