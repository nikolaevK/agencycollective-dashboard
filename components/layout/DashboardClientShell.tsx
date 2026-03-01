"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Suspense } from "react";

export function DashboardClientShell({ children }: { children: React.ReactNode }) {
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
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </Suspense>

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Suspense fallback={<div className="h-16 border-b bg-card" />}>
          <TopBar onMenuClick={() => setSidebarOpen(true)} />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
