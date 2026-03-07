"use client";

import { Suspense } from "react";
import { ChatInterface } from "@/components/chat/ChatInterface";

function ChatContent() {
  return (
    <main className="flex flex-1 overflow-hidden">
      <ChatInterface />
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading...
        </main>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
