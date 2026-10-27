"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, ClipboardCheck, BookOpen, LogOut, X, MessageSquare, Sparkles, Frame, Palette, Clapperboard, FlaskConical, Gem } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgencyLogo } from "@/components/layout/AgencyLogo";

interface UserSidebarProps {
  displayName?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function UserSidebar({ displayName, isOpen = false, onClose }: UserSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();

  // Extract slug from URL: "/{slug}/portal/..."
  const slug = pathname.split("/")[1] ?? "";

  // Unread support-message count for the sidebar badge. Polled every 60s,
  // pauses while tab is hidden. Cleared as soon as the user opens the
  // support page (which POSTs /read on mount + on each new poll).
  const { data: unreadSupport = 0 } = useQuery<number>({
    queryKey: ["portal-support-unread"],
    queryFn: async () => {
      const res = await fetch("/api/portal/support/unread");
      if (!res.ok) return 0;
      const json = await res.json();
      return Number(json.data?.count ?? 0);
    },
    staleTime: 45_000,
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
  });

  // Per-client portal nav visibility (AI Analyst, Design Board, Peptide AI,
  // More from Agency Collective). Lightweight
  // (one DB row, no Meta API) so it polls far more often than the metrics
  // overview — an admin enabling a feature surfaces here within ~60s / on focus
  // instead of being stuck behind the overview's 5-min stale window.
  const { data: navConfig } = useQuery<{
    analystEnabled: boolean;
    designBoardVisible: boolean;
    peptideAiVisible: boolean;
    moreVisible: boolean;
    moreNew: boolean;
    moreLabel: string;
  }>({
    queryKey: ["portal-nav-config"],
    queryFn: async () => {
      const res = await fetch("/api/portal/nav-config");
      if (!res.ok)
        return {
          analystEnabled: true,
          designBoardVisible: false,
          peptideAiVisible: false,
          moreVisible: false,
          moreNew: false,
          moreLabel: "",
        };
      const json = await res.json();
      return {
        analystEnabled: Boolean(json.data?.analystEnabled ?? true),
        designBoardVisible: Boolean(json.data?.designBoardVisible ?? false),
        peptideAiVisible: Boolean(json.data?.peptideAiVisible ?? false),
        moreVisible: Boolean(json.data?.moreVisible ?? false),
        moreNew: Boolean(json.data?.moreNew ?? false),
        moreLabel: String(json.data?.moreLabel ?? ""),
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const analystEnabled = navConfig?.analystEnabled ?? true;
  const designBoardVisible = navConfig?.designBoardVisible ?? false;
  const peptideAiVisible = navConfig?.peptideAiVisible ?? false;
  const onMore = pathname.includes("/portal/more");
  // Opening the catalog itself clears "New" server-side (a single service's
  // page doesn't); clear the cached flag too so it doesn't come back on the
  // next page until the next poll.
  const onCatalog = /\/portal\/more\/?$/.test(pathname);
  useEffect(() => {
    if (onCatalog) qc.setQueryData<typeof navConfig>(["portal-nav-config"], (old) => (old ? { ...old, moreNew: false } : old));
  }, [onCatalog, qc]);
  const moreNew = (navConfig?.moreNew ?? false) && !onCatalog;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/?portal=client");
    // The QueryClient lives in the root layout and survives the soft
    // navigation into the next login — drop this client's cached data
    // (e.g. the questionnaire, cached with staleTime: Infinity) so the next
    // client on this browser never sees or autosaves it.
    qc.clear();
  }

  return (
    <aside
      className={cn(
        "ac-sidebar flex h-full w-64 shrink-0 flex-col border-r",
        "fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out",
        "md:relative md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      {/* Logo row — AC logo always visible, close button on mobile */}
      <div
        className="flex h-16 items-center justify-between border-b px-5"
        style={{ borderColor: "hsl(var(--sidebar-border))" }}
      >
        <AgencyLogo />
        <button
          onClick={onClose}
          className="md:hidden rounded-lg p-1.5 text-current opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Account badge — name only */}
      {displayName && (
        <div className="px-5 py-3 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest opacity-40 mb-0.5">
            Account
          </p>
          <p className="text-sm font-medium truncate" style={{ color: "hsl(var(--sidebar-hover-fg))" }}>
            {displayName}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest opacity-40">
          Portal
        </p>
        <Link
          href={`/${slug}/portal/welcome-kit`}
          onClick={onClose}
          className={cn(
            "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            pathname.includes("/portal/welcome-kit") && "active"
          )}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          <span>Welcome Kit</span>
        </Link>
        <Link
          href={`/${slug}/portal/onboarding`}
          onClick={onClose}
          className={cn(
            "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            pathname.includes("/portal/onboarding") && "active"
          )}
        >
          <ClipboardCheck className="h-4 w-4 shrink-0" />
          <span>Onboarding</span>
        </Link>
        <Link
          href={`/${slug}/portal/brand`}
          onClick={onClose}
          className={cn(
            "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            pathname.includes("/portal/brand") && "active"
          )}
        >
          <Palette className="h-4 w-4 shrink-0" />
          <span>My Brand</span>
        </Link>
        <Link
          href={`/${slug}/portal/creatives`}
          onClick={onClose}
          className={cn(
            "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            pathname.includes("/portal/creatives") && "active"
          )}
        >
          <Clapperboard className="h-4 w-4 shrink-0" />
          <span>Ad Creatives</span>
        </Link>
        <Link
          href={`/${slug}/portal/overview`}
          onClick={onClose}
          className={cn(
            "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            pathname.endsWith("/portal/overview") && "active"
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          <span>Overview</span>
        </Link>
        {analystEnabled && (
          <Link
            href={`/${slug}/portal/analyst`}
            onClick={onClose}
            className={cn(
              "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
              pathname.includes("/portal/analyst") && "active"
            )}
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>AI Analyst</span>
          </Link>
        )}
        {designBoardVisible && (
          <Link
            href={`/${slug}/portal/design-board`}
            onClick={onClose}
            className={cn(
              "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
              pathname.includes("/portal/design-board") && "active"
            )}
          >
            <Frame className="h-4 w-4 shrink-0" />
            <span>Design Board</span>
          </Link>
        )}
        {peptideAiVisible && (
          <Link
            href={`/${slug}/portal/peptide-ai`}
            onClick={onClose}
            className={cn(
              "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
              pathname.includes("/portal/peptide-ai") && "active"
            )}
          >
            <FlaskConical className="h-4 w-4 shrink-0" />
            <span>Peptide AI</span>
          </Link>
        )}
        {navConfig?.moreVisible && (
          <Link
            href={`/${slug}/portal/more`}
            onClick={onClose}
            className={cn(
              "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
              onMore && "active"
            )}
          >
            <Gem className="h-4 w-4 shrink-0" />
            <span className="flex-1 leading-snug">{navConfig.moreLabel || "More from Agency Collective"}</span>
            {moreNew && (
              <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none text-white">
                New
              </span>
            )}
          </Link>
        )}
        <Link
          href={`/${slug}/portal/support`}
          onClick={onClose}
          className={cn(
            "ac-sidebar-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
            pathname.includes("/portal/support") && "active"
          )}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          <span className="flex-1">Support</span>
          {unreadSupport > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold"
              aria-label={`${unreadSupport} unread message${unreadSupport === 1 ? "" : "s"}`}
            >
              {unreadSupport > 99 ? "99+" : unreadSupport}
            </span>
          )}
        </Link>
      </nav>

      {/* Logout */}
      <div className="border-t p-3" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        <button
          onClick={handleLogout}
          className="ac-sidebar-link flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
