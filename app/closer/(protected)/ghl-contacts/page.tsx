"use client";

import { GhlContactsView } from "@/components/ghl/GhlContactsView";

export default function CloserGhlContactsPage() {
  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">GHL Contacts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse contacts, notes, and appointments from GoHighLevel.
          </p>
        </div>
        <GhlContactsView />
      </div>
    </main>
  );
}
