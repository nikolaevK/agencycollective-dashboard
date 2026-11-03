"use client";

import { ErrorScreen } from "@/components/shared/ErrorScreen";

/** Every route below the root layout (portals, login, and errors thrown by the dashboard layout/shell itself). */
export default function RootSegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <ErrorScreen error={error} reset={reset} />
    </main>
  );
}
