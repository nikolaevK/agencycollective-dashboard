import { cn } from "@/lib/utils";

/**
 * Centered single-card layout for the OAuth consent flow (shadcn login-block
 * style). Server-safe and dependency-free — used by the server page's
 * error/sign-in cards and by the client consent form alike.
 */
export function OAuthShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4 md:p-6">
      <div className={cn("flex w-full max-w-md flex-col gap-4", className)}>
        <p className="text-center text-sm font-semibold tracking-tight text-muted-foreground">
          Agency Collective
        </p>
        {children}
      </div>
    </main>
  );
}
