"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { ErrorScreen } from "@/components/shared/ErrorScreen";

/** Dashboard pages: renders inside the admin shell, so the nav (and Log out) stay usable. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <DashboardShell>
      <ErrorScreen error={error} reset={reset} />
    </DashboardShell>
  );
}
