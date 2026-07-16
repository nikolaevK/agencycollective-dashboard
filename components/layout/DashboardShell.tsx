import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: React.ReactNode;
  className?: string;
  wide?: boolean;
}

export function DashboardShell({ children, className, wide }: DashboardShellProps) {
  return (
    // overflow-x-hidden: the page body must NEVER scroll horizontally — wide
    // content (tables, code, charts) scrolls inside its own overflow-x-auto
    // wrapper. Without this, overflow-y-auto computes overflow-x to `auto`,
    // and any too-wide child turns the whole page into a sideways scroller.
    <main className={cn("flex-1 overflow-y-auto overflow-x-hidden bg-background", className)}>
      <div className={cn("container mx-auto p-4 pb-24 md:p-6 md:pb-6", wide ? "max-w-[120rem]" : "max-w-7xl")}>{children}</div>
    </main>
  );
}
