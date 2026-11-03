import type { AdminPermissions, PermissionKey } from "@/lib/permissions";

/**
 * Creative Studio tabs (/dashboard/creative?tab=…). Pure — imported by the
 * client page, the Sidebar and the MobileHeader (old per-tool routes redirect
 * here from next.config.js). Each tab keeps its own permission key: the page only lists
 * the tabs an admin holds, and every tool's API route stays gated by its own
 * key in middleware (unchanged).
 */
export type CreativeTabId = "analyst" | "image" | "json" | "ad-copy";

export const CREATIVE_TABS: { id: CreativeTabId; label: string; perm: PermissionKey }[] = [
  { id: "analyst", label: "AI Analyst", perm: "analyst" },
  { id: "image", label: "Image Generator", perm: "studio" },
  { id: "json", label: "JSON Editor", perm: "jsoneditor" },
  { id: "ad-copy", label: "Ad Copy", perm: "adcopy" },
];

export const CREATIVE_PATH = "/dashboard/creative";

export const CREATIVE_PERMS: PermissionKey[] = CREATIVE_TABS.map((t) => t.perm);

type CreativeAdmin = { isSuper: boolean; permissions: AdminPermissions };

/** The tabs this admin holds, in display order. */
export function allowedCreativeTabs(admin: CreativeAdmin) {
  return CREATIVE_TABS.filter((t) => admin.isSuper || admin.permissions[t.perm]);
}

/**
 * The tab shown for `?tab=…`: the requested one when the admin holds it, else
 * their first tool (null = none). The page and the MobileHeader's date picker
 * both resolve through here, so they can't disagree.
 */
export function resolveCreativeTab(admin: CreativeAdmin, requested: string | null): CreativeTabId | null {
  const tabs = allowedCreativeTabs(admin);
  return tabs.find((t) => t.id === requested)?.id ?? tabs[0]?.id ?? null;
}
