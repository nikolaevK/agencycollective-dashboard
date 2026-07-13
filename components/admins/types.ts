import type { AdminPermissions } from "@/lib/permissions";

export interface AdminPublic {
  id: string;
  username: string;
  isSuper: boolean;
  hasPassword: boolean;
  displayName: string | null;
  email: string | null;
  avatarPath: string | null;
  role: string;
  permissions: AdminPermissions;
}

/**
 * Admin role presets (admins.role slugs). CSM is its OWN role — it typically
 * carries the same module permissions as a Media Buyer (permissions stay
 * independently toggled) but is marked and badged distinctly everywhere.
 * Legacy free-text values still render as-is via adminRoleLabel.
 */
export const ADMIN_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "media_buyer", label: "Media Buyer" },
  { value: "csm", label: "Client Success Manager" },
] as const;

export function adminRoleLabel(role: string): string {
  const preset = ADMIN_ROLE_OPTIONS.find((o) => o.value === role);
  return preset ? preset.label : role;
}
