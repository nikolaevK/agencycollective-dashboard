"use client";

import { Suspense } from "react";
import { JsonImageEditor } from "@/components/json-editor/JsonImageEditor";

function JsonEditorContent() {
  return (
    <main className="flex flex-1 overflow-hidden">
      <JsonImageEditor />
    </main>
  );
}

export default function JsonEditorPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading...
        </main>
      }
    >
      <JsonEditorContent />
    </Suspense>
  );
}
