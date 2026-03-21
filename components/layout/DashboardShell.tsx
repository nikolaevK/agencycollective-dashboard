import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  return (
    <main className={cn("flex-1 overflow-y-auto bg-background", className)}>
      <div className="container mx-auto max-w-7xl p-4 pb-24 md:p-6 md:pb-6">{children}</div>
    </main>
  );
}
