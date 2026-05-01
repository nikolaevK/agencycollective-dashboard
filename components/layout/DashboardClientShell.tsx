"use client";

import { useState, useEffect, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Suspense } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { AdminProvider, type AdminContextValue } from "@/components/providers/AdminProvider";
import { AdminPresenceHeartbeat } from "@/components/layout/AdminPresenceHeartbeat";
import { refreshAdminSession } from "@/app/actions/refreshSession";

interface DashboardClientShellProps {
  children: React.ReactNode;
  adminData: AdminContextValue;
  needsSessionRefresh?: boolean;
}

export function DashboardClientShell({ children, adminData, needsSessionRefresh }: DashboardClientShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const refreshed = useRef(false);

  useEffect(() => {
    if (needsSessionRefresh && !refreshed.current) {
      refreshed.current = true;
      refreshAdminSession().catch(() => {});
    }
  }, [needsSessionRefresh]);

  return (
    <AdminProvider value={adminData}>
      <AdminPresenceHeartbeat />
      <div className="flex h-screen overflow-hidden">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Suspense fallback={<div className="hidden md:flex md:w-64 border-r bg-card" />}>
          <Sidebar
            isOpen={sidebarOpen}
            collapsed={sidebarCollapsed}
            onClose={() => setSidebarOpen(false)}
          />
        </Suspense>

        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <MobileHeader onMenuClick={() => setSidebarOpen(true)} />
          <div className="hidden md:block">
            <Suspense fallback={<div className="h-16 border-b bg-card" />}>
              <TopBar
                onMenuClick={() => setSidebarOpen(true)}
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
              />
            </Suspense>
          </div>
          {children}
          <BottomNav onMenuClick={() => setSidebarOpen(true)} />
        </div>
      </div>
    </AdminProvider>
  );
}
