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
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE, SIDEBAR_COLLAPSED } from "@/components/layout/sidebarCookie";

interface DashboardClientShellProps {
  children: React.ReactNode;
  adminData: AdminContextValue;
  needsSessionRefresh?: boolean;
  initialSidebarCollapsed?: boolean;
}

export function DashboardClientShell({ children, adminData, needsSessionRefresh, initialSidebarCollapsed = false }: DashboardClientShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const refreshed = useRef(false);
  const mainRef = useRef<HTMLDivElement>(null);

  // The drawer only exists below md: crossing the breakpoint (resize, rotate)
  // closes it, so its Escape layer, inert background and "open" state never
  // linger on the desktop rail (or re-show it when the window narrows again).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const close = () => setSidebarOpen(false);
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? SIDEBAR_COLLAPSED : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  useEffect(() => {
    if (needsSessionRefresh && !refreshed.current) {
      refreshed.current = true;
      refreshAdminSession().catch(() => {});
    }
  }, [needsSessionRefresh]);

  return (
    <AdminProvider value={adminData}>
      <AdminPresenceHeartbeat />
      <div className="flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden">
        {/* Mobile backdrop — over the bottom nav (z-50), under the drawer (z-[60]) */}
        {sidebarOpen && (
          <div
            aria-hidden
            className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-sm duration-100 animate-in fade-in-0 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Suspense
          fallback={
            <div className={cn("hidden shrink-0 border-r border-sidebar-border bg-sidebar md:block", sidebarCollapsed ? "md:w-12" : "md:w-64")} />
          }
        >
          <Sidebar
            isOpen={sidebarOpen}
            collapsed={sidebarCollapsed}
            onClose={() => setSidebarOpen(false)}
            backgroundRef={mainRef}
          />
        </Suspense>

        <div ref={mainRef} className="flex flex-1 flex-col overflow-hidden min-w-0">
          <MobileHeader onMenuClick={() => setSidebarOpen(true)} menuOpen={sidebarOpen} />
          <div className="hidden md:block">
            <Suspense fallback={<div className="h-16 border-b bg-background" />}>
              <TopBar
                sidebarCollapsed={sidebarCollapsed}
                onToggleSidebar={toggleSidebar}
              />
            </Suspense>
          </div>
          {children}
          <BottomNav onMenuClick={() => setSidebarOpen(true)} menuOpen={sidebarOpen} />
        </div>
      </div>
    </AdminProvider>
  );
}
