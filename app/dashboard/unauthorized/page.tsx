import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-background p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-foreground">
          <Lock className="size-5" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight">Access Denied</h1>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to view this page. Contact a super admin to request access.
          </p>
        </div>
        <Link href="/dashboard" className={buttonVariants()}>
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
