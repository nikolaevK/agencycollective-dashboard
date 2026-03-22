"use server";

import { cookies } from "next/headers";
import { findAdmin, getEffectivePermissions } from "@/lib/admins";
import {
  getAdminSession,
  createAdminSession,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
} from "@/lib/adminSession";

/**
 * Re-creates the admin session cookie with fresh data from the DB.
 * Called by the client shell when the layout detects stale session data.
 */
export async function refreshAdminSession(): Promise<void> {
  const session = getAdminSession();
  if (!session) return;

  const admin = await findAdmin(session.adminId);
  if (!admin) return;

  const permissions = getEffectivePermissions(admin);
  const token = createAdminSession({
    adminId: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    avatarPath: admin.avatarPath,
    isSuper: admin.isSuper,
    permissions,
  });

  cookies().set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });
}
