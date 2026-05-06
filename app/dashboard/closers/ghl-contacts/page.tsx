"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { GhlContactsView } from "@/components/ghl/GhlContactsView";

export default function AdminGhlContactsPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-black text-foreground">
            GHL Contacts
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only view of contacts, notes, and appointments synced from GoHighLevel.
          </p>
        </div>

        <CloserSubNav />

        <GhlContactsView />
      </div>
    </DashboardShell>
  );
}
