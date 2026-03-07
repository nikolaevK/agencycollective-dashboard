"use client";

import { Suspense } from "react";
import { ImageGenerator } from "@/components/generate/ImageGenerator";

function GenerateContent() {
  return (
    <main className="flex flex-1 overflow-hidden">
      <ImageGenerator />
    </main>
  );
}

export default function GeneratePage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading...
        </main>
      }
    >
      <GenerateContent />
    </Suspense>
  );
}
