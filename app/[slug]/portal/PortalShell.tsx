"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useUserOverview } from "@/hooks/useUserOverview";
import { useDateRange } from "@/hooks/useDateRange";
import { useEscapeKey } from "@/hooks/useEscapeKey";
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
  const contentRef = useRef<HTMLDivElement>(null);

  // The mobile drawer is modal, like the admin shell's: Escape closes it and
  // the rest of the portal (bottom nav included) is inert while it's open.
  // Crossing md closes it — it only exists on phones.
  useEscapeKey(() => setSidebarOpen(false), sidebarOpen);
  useEffect(() => {
    const content = contentRef.current;
    if (!sidebarOpen || !content) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    content.inert = true;
    return () => {
      content.inert = false;
      opener?.focus({ preventScroll: true });
    };
  }, [sidebarOpen]);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const close = () => setSidebarOpen(false);
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  return (
    <div className="flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden">
      {/* Mobile backdrop — over the bottom nav (z-50), under the drawer (z-[60]) */}
      {sidebarOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-[55] bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <UserSidebar
        displayName={data?.displayName}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div ref={contentRef} className="flex flex-1 flex-col overflow-hidden min-w-0">
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
        <div className="flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden">
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
