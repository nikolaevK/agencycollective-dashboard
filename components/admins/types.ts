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
