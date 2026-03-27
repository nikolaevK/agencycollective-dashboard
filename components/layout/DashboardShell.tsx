import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}

export function DashboardShell({ children, className, wide }: DashboardShellProps) {
  return (
    <main className={cn("flex-1 overflow-y-auto bg-background", className)}>
      <div className={cn("container mx-auto p-4 pb-24 md:p-6 md:pb-6", wide ? "max-w-[120rem]" : "max-w-7xl")}>{children}</div>
    </main>
  );
}
