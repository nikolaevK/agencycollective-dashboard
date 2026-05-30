"use client";

import { useState, Suspense } from "react";
import { useUserOverview } from "@/hooks/useUserOverview";
import { useDateRange } from "@/hooks/useDateRange";
import { UserSidebar } from "@/components/portal/UserSidebar";
import { UserTopBar } from "@/components/portal/UserTopBar";
import { PortalBottomNav } from "@/components/portal/PortalBottomNav";
import { MaintenanceNotice } from "@/components/portal/MaintenanceNotice";

function Shell({
  children,
  maintenanceMessage,
}: {
  children: React.ReactNode;
  maintenanceMessage?: string | null;
}) {
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
        displayName={data?.displayName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <UserTopBar
          accountName={data?.accountName ?? undefined}
          currency={data?.currency}
          logoPath={data?.logoPath}
          onMenuClick={() => setSidebarOpen(true)}
        />
        {maintenanceMessage && <MaintenanceNotice message={maintenanceMessage} />}
        {children}
        <PortalBottomNav />
      </div>
    </div>
  );
}

export function PortalShell({
  children,
  maintenanceMessage,
}: {
  children: React.ReactNode;
  maintenanceMessage?: string | null;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen overflow-hidden">
          <div className="hidden md:flex md:w-64 border-r bg-card" />
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="h-16 border-b bg-card" />
          </div>
        </div>
      }
    >
      <Shell maintenanceMessage={maintenanceMessage}>{children}</Shell>
    </Suspense>
  );
}
