"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import type { CloserRole } from "@/lib/closers";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { CloserSidebar } from "@/components/closer/CloserSidebar";
import { CloserTopBar } from "@/components/closer/CloserTopBar";

interface Props {
  displayName: string;
  role: CloserRole;
  children: React.ReactNode;
}

function Shell({ displayName, role, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // The mobile drawer is modal, like the admin shell's: Escape closes it and
  // the rest of the portal is inert while it's open. Crossing md closes it —
  // it only exists on phones.
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
      {/* Mobile backdrop — over the dashboards' floating buttons (z-40) and
          any z-50 bar, under the drawer (z-[60]) */}
      {sidebarOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-[55] bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <CloserSidebar
        displayName={displayName}
        role={role}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div ref={contentRef} className="flex flex-1 flex-col overflow-hidden min-w-0">
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
        <div className="flex h-screen supports-[height:100dvh]:h-dvh overflow-hidden">
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
