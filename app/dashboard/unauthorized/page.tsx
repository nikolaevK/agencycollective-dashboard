import Link from "next/link";
import { Lock } from "lucide-react";

export default function UnauthorizedPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-background p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="text-xl font-bold">Access Denied</h1>
        <p className="text-sm text-muted-foreground">
          You don&apos;t have permission to view this page. Contact a super admin to request access.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
