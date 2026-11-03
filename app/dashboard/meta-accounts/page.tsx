"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { MetaAccountsDirectory } from "@/components/meta-accounts/MetaAccountsDirectory";

export default function MetaAccountsPage() {
  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">Meta Accounts Directory</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Aged FB account inventory — track setup, warm-up stage, and status through to trusted.
          </p>
        </div>
        <MetaAccountsDirectory />
      </div>
    </DashboardShell>
  );
}
