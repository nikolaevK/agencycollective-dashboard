"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Suspense } from "react";
import { BottomNav } from "@/components/layout/BottomNav";
import { MobileHeader } from "@/components/layout/MobileHeader";

interface DashboardClientShellProps {
  children: React.ReactNode;
  isSuperAdmin?: boolean;
}

export function DashboardClientShell({ children, isSuperAdmin = false }: DashboardClientShellProps) {
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

      <Suspense fallback={<div className="hidden md:flex md:w-64 border-r bg-card" />}>
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isSuperAdmin={isSuperAdmin}
        />
      </Suspense>

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <MobileHeader onMenuClick={() => setSidebarOpen(true)} />
        <div className="hidden md:block">
          <Suspense fallback={<div className="h-16 border-b bg-card" />}>
            <TopBar onMenuClick={() => setSidebarOpen(true)} />
          </Suspense>
        </div>
        {children}
        <BottomNav onMenuClick={() => setSidebarOpen(true)} />
      </div>
    </div>
  );
}
