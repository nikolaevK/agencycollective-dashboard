"use client";

import "./globals.css";
import { ErrorScreen } from "@/components/shared/ErrorScreen";

/** Last resort: the root layout itself failed, so this renders its own document. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background text-foreground antialiased">
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
