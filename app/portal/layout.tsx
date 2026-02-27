"use client";

import { Suspense } from "react";
import { useUserOverview } from "@/hooks/useUserOverview";
import { useDateRange } from "@/hooks/useDateRange";
import { UserSidebar } from "@/components/portal/UserSidebar";
import { UserTopBar } from "@/components/portal/UserTopBar";

function PortalShell({ children }: { children: React.ReactNode }) {
  const { dateRange } = useDateRange();
  const { data } = useUserOverview(dateRange);

  return (
    <div className="flex h-screen overflow-hidden">
      <UserSidebar displayName={data?.accountName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <UserTopBar accountName={data?.accountName} currency={data?.currency} />
        {children}
      </div>
    </div>
  );
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={
      <div className="flex h-screen overflow-hidden">
        <div className="w-64 border-r bg-card" />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="h-16 border-b bg-card" />
          {children}
        </div>
      </div>
    }>
      <PortalShell>{children}</PortalShell>
    </Suspense>
  );
}
