"use client";

import { useState, Suspense } from "react";
import type { CloserRole } from "@/lib/closers";
import { CloserSidebar } from "@/components/closer/CloserSidebar";
import { CloserTopBar } from "@/components/closer/CloserTopBar";

interface Props {
  displayName: string;
  role: CloserRole;
  children: React.ReactNode;
}

function Shell({ displayName, role, children }: Props) {
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

      <CloserSidebar
        displayName={displayName}
        role={role}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <CloserTopBar
          displayName={displayName}
          role={role}
          onMenuClick={() => setSidebarOpen(true)}
        />
        {children}
      </div>
    </div>
  );
}

export function CloserPortalShell({ displayName, role, children }: Props) {
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
      <Shell displayName={displayName} role={role}>{children}</Shell>
    </Suspense>
  );
}
