"use client";

import { useState, Suspense } from "react";
import { useUserOverview } from "@/hooks/useUserOverview";
import { useDateRange } from "@/hooks/useDateRange";
import { UserSidebar } from "@/components/portal/UserSidebar";
import { UserTopBar } from "@/components/portal/UserTopBar";

function PortalShell({ children }: { children: React.ReactNode }) {
  const { dateRange } = useDateRange();
  const { data } = useUserOverview(dateRange);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <UserSidebar
        displayName={data?.accountName}
        logoPath={data?.logoPath}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <UserTopBar
          accountName={data?.accountName}
          currency={data?.currency}
          onMenuClick={() => setSidebarOpen(true)}
        />
        {children}
      </div>
    </div>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen overflow-hidden">
          <div className="hidden md:flex md:w-64 border-r bg-card" />
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="h-16 border-b bg-card" />
            {children}
          </div>
        </div>
      }
    >
      <PortalShell>{children}</PortalShell>
    </Suspense>
  );
}
