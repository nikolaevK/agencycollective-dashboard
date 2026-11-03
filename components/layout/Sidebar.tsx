"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Bell, BookOpen, Users, UserCog, X, Sparkles, FileText, Handshake, TrendingUp, Megaphone, ClipboardList, KeyRound, Code2, Boxes, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlerts } from "@/hooks/useAlerts";
import { useDateRange } from "@/hooks/useDateRange";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { AgencyLogo } from "@/components/layout/AgencyLogo";
import { NavUserButton, NavUserFallback } from "@/components/layout/NavUserButton";
import { useAdmin } from "@/components/providers/AdminProvider";
import { Button } from "@/components/ui/button";
import { badgeTone, type BadgeTone } from "@/components/ui/badge";
import {
  Sidebar as SidebarRoot,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { PermissionKey } from "@/lib/permissions";
import { CREATIVE_PATH, CREATIVE_PERMS } from "@/components/creative/creativeTabs";

// The account menu (a Radix dropdown) is its own chunk, fetched after
// hydration; the static button stands in until then and on the server. If the
// chunk can't load (deploy skew, flaky network, an ad-blocker) a plain
// fallback keeps Log out — a rejected import must not take the app down.
const NavUser = dynamic(
  () =>
    import("@/components/layout/NavUser")
      .then((m) => m.NavUser)
      .catch(() => NavUserFallback),
  {
    ssr: false,
    loading: () => <NavUserButton />,
  }
);

interface SidebarProps {
  isOpen?: boolean;
  collapsed?: boolean;
  onClose?: () => void;
  /** The rest of the app — inert while the mobile drawer is open (it's modal). */
  backgroundRef?: React.RefObject<HTMLElement>;
}

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; perm: PermissionKey; anyPerm?: PermissionKey[]; superOnly?: boolean; alwaysShow?: boolean };

// A group only renders when the admin can see at least one of its items.
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Dashboard",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true, perm: "dashboard" },
      { href: "/dashboard/alerts", label: "Alerts", icon: Bell, perm: "dashboard" },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/dashboard/closers", label: "Closers", icon: Handshake, perm: "closers" },
      { href: "/dashboard/invoice", label: "Invoice", icon: FileText, perm: "invoice" },
      { href: "/dashboard/projection", label: "Revenue Projection", icon: TrendingUp, perm: "dashboard" },
    ],
  },
  {
    label: "Clients",
    items: [
      { href: "/dashboard/users", label: "Clients", icon: Users, perm: "users" },
      // Team hub is visible to EVERY admin (overview + own hub); full access is
      // enforced in-route by the `admin` permission — same pattern as SOPs.
      { href: "/dashboard/team", label: "Team", icon: UsersRound, perm: "dashboard", alwaysShow: true },
    ],
  },
  {
    label: "Media",
    items: [
      // AI Analyst, Image Generator, JSON Editor + Ad Copy — tabs of one page.
      { href: CREATIVE_PATH, label: "Creative Studio", icon: Sparkles, perm: "analyst", anyPerm: CREATIVE_PERMS },
      { href: "/dashboard/media-buyers", label: "Media Buyers", icon: Megaphone, perm: "media" },
      { href: "/dashboard/meta-accounts", label: "Meta Accounts", icon: Boxes, perm: "meta_accounts" },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/dashboard/sops", label: "SOPs", icon: ClipboardList, perm: "dashboard", alwaysShow: true },
      { href: "/dashboard/settings", label: "Documentation", icon: BookOpen, perm: "dashboard" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/dashboard/admins", label: "Admins", icon: UserCog, perm: "admin" },
      { href: "/dashboard/api-tokens", label: "API Tokens", icon: KeyRound, perm: "apitokens" },
      { href: "/dashboard/api-docs", label: "API Docs", icon: Code2, perm: "apitokens" },
    ],
  },
];

type NavBadge = { text: string; tone: BadgeTone; label: string };

export function Sidebar({ isOpen = false, collapsed = false, onClose, backgroundRef }: SidebarProps) {
  const pathname = usePathname();
  const admin = useAdmin();
  // /api/alerts needs `dashboard` (middleware API_PERMISSIONS): only then does
  // the Alerts row mount the alerts query — everyone else would just get 403s.
  const alertsEnabled = admin.isSuper || admin.permissions.dashboard;

  // Unread support-message count across all client conversations. Drives the
  // red badge on the Clients nav item (Support is folded into that page as
  // a tab). Only fetches if the admin has the `users` perm; gating here
  // matches both the API-route gate and what the user can actually act on.
  const supportEnabled = admin.isSuper || admin.permissions.users;
  const { data: unreadSupport = 0 } = useQuery<number>({
    queryKey: ["admin-support-unread"],
    queryFn: async () => {
      const res = await fetch("/api/admin/support/unread");
      if (!res.ok) return 0;
      const json = await res.json();
      return Number(json.data?.count ?? 0);
    },
    enabled: supportEnabled,
    staleTime: 45_000,
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
  });

  // Mobile drawer (modal): Escape closes it; focus moves in on open and back
  // to the button that opened it on close; the rest of the app is inert
  // meanwhile (the kit keeps Tab inside the drawer). One effect, so the order
  // holds: the opener is read before it turns inert, and un-inerted before it
  // gets focus back.
  const closeRef = useRef<HTMLButtonElement>(null);
  useEscapeKey(() => onClose?.(), isOpen);
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = backgroundRef?.current ?? null;
    closeRef.current?.focus();
    if (background) background.inert = true;
    return () => {
      if (background) background.inert = false;
      opener?.focus({ preventScroll: true });
    };
  }, [isOpen, backgroundRef]);

  // Filter nav items by permissions (superOnly items only visible to super admins).
  // External partner admins (workspace scope without the main book) also lose
  // the internal-only alwaysShow entries (SOPs) — Team stays (scoped in-route).
  const canSee = (item: NavItem) => {
    if (admin.isExternal && item.href === "/dashboard/sops") return false;
    return item.alwaysShow
      ? true
      : item.superOnly
        ? admin.isSuper
        : (admin.isSuper || admin.permissions[item.perm] || (item.perm === "media" && admin.permissions.media_manage) || (item.anyPerm?.some((p) => admin.permissions[p]) ?? false));
  };
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter(canSee) }))
    .filter((group) => group.items.length > 0);

  const supportBadge: NavBadge | null =
    unreadSupport > 0
      ? {
          text: unreadSupport > 99 ? "99+" : String(unreadSupport),
          tone: "danger",
          label: `${unreadSupport} unread support message${unreadSupport === 1 ? "" : "s"}`,
        }
      : null;

  return (
    <SidebarRoot collapsed={collapsed} open={isOpen}>
      {/* Logo row — full logo (mark on the collapsed rail); close button on mobile */}
      <SidebarHeader className="h-16 shrink-0 flex-row items-center justify-between px-4 md:group-data-[collapsible=icon]/sidebar:justify-center md:group-data-[collapsible=icon]/sidebar:px-2">
        <AgencyLogo className="md:group-data-[collapsible=icon]/sidebar:hidden" />
        <AgencyLogo variant="mark" className="hidden md:group-data-[collapsible=icon]/sidebar:block" />
        {/* transition-colors, not the kit's transition-all: that would also
            animate the visibility it inherits from the drawer, leaving it
            unfocusable at the moment the drawer opens. */}
        <Button ref={closeRef} variant="ghost" size="icon-sm" onClick={onClose} className="transition-colors md:hidden" aria-label="Close menu">
          <X />
        </Button>
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label="Main" className="gap-0">
        {/* py-1 (not the kit's 8px): the full nav fits a 900px-tall viewport
            (the page area, not the screen — browser chrome takes ~100px of a
            900px display). The icon rail has room, so it keeps the wider gaps
            between groups. */}
        {visibleGroups.map((group) => (
          <SidebarGroup key={group.label} className="py-1 md:group-data-[collapsible=icon]/sidebar:py-2">
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                const row = { item, isActive, onClose };

                return item.href === "/dashboard/alerts" && alertsEnabled ? (
                  <AlertsNavRow key={item.href} {...row} />
                ) : (
                  <NavRow key={item.href} {...row} badge={item.href === "/dashboard/users" ? supportBadge : null} />
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Account menu — the one place for account actions (Log out) */}
      <SidebarFooter className="pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <NavUser side={collapsed && !isOpen ? "right" : "top"} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </SidebarRoot>
  );
}

interface NavRowProps {
  item: NavItem;
  isActive: boolean;
  onClose?: () => void;
}

function NavRow({ item, isActive, onClose, badge }: NavRowProps & { badge: NavBadge | null }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        // The rail shows only a dot — its tooltip carries the count.
        tooltip={badge ? `${item.label} · ${badge.label}` : item.label}
        className={cn(badge && "pr-10")}
      >
        {/* A badged link is named in one string ("Alerts, 12 alerts") — an
            sr-only span after the truncated label read "Alerts , 12 alerts". */}
        <Link
          href={item.href}
          onClick={onClose}
          aria-current={isActive ? "page" : undefined}
          aria-label={badge ? `${item.label}, ${badge.label}` : undefined}
        >
          <item.icon />
          <span className="truncate">{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {badge && (
        <SidebarMenuBadge aria-hidden className={cn("border", badgeTone[badge.tone])}>
          {badge.text}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

/** The Alerts row owns the alerts query, so it only runs where the row is allowed it. */
function AlertsNavRow(props: NavRowProps) {
  const { dateRange } = useDateRange();
  const { data: alerts } = useAlerts(dateRange);
  const criticalCount = alerts?.filter((a) => a.severity === "critical").length ?? 0;
  const totalCount = alerts?.length ?? 0;
  const badge: NavBadge | null =
    totalCount > 0
      ? {
          text: String(totalCount),
          tone: criticalCount > 0 ? "danger" : "warning",
          label: `${totalCount} alert${totalCount === 1 ? "" : "s"}${criticalCount > 0 ? `, ${criticalCount} critical` : ""}`,
        }
      : null;
  return <NavRow {...props} badge={badge} />;
}
