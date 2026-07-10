"use client";

import { DashboardShell } from "@/components/layout/DashboardShell";
import { MetaAccountsDirectory } from "@/components/meta-accounts/MetaAccountsDirectory";

export default function MetaAccountsPage() {
  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-foreground">Meta Accounts Directory</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Aged FB account inventory — track setup, warm-up stage, and status through to trusted.
            </p>
          </div>
        </div>
        <MetaAccountsDirectory />
      </div>
    </DashboardShell>
  );
}
