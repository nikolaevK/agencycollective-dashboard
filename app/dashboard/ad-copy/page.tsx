"use client";

import { Suspense } from "react";
import { AdCopyGenerator } from "@/components/ad-copy/AdCopyGenerator";

function AdCopyContent() {
  return (
    <main className="flex flex-1 overflow-hidden">
      <AdCopyGenerator />
    </main>
  );
}

export default function AdCopyPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading...
        </main>
      }
    >
      <AdCopyContent />
    </Suspense>
  );
}
