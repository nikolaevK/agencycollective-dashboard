"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { findAdminByUsername, updateAdmin } from "@/lib/admins";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  createAdminSession,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
} from "@/lib/adminSession";

export async function checkAdminAction(
  username: string
): Promise<{ exists: boolean; hasPassword: boolean }> {
  const admin = await findAdminByUsername(username.trim().toLowerCase());
  if (!admin) return { exists: false, hasPassword: false };
  return { exists: true, hasPassword: Boolean(admin.passwordHash) };
}

export async function adminLoginAction(
  username: string,
  password: string
): Promise<{ error: string } | undefined> {
  const admin = await findAdminByUsername(username.trim().toLowerCase());
  if (!admin || !admin.passwordHash) return { error: "Invalid credentials" };
  if (!verifyPassword(password, admin.passwordHash)) return { error: "Invalid credentials" };

  const token = createAdminSession({ adminId: admin.id, username: admin.username });
  cookies().set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });
  redirect("/dashboard");
}

export async function adminSetPasswordAction(
  username: string,
  password: string
): Promise<{ error: string } | undefined> {
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  const admin = await findAdminByUsername(username.trim().toLowerCase());
  if (!admin) return { error: "Admin not found" };
  if (admin.passwordHash) return { error: "Password already set" };

  await updateAdmin(admin.id, { passwordHash: hashPassword(password) });

  const token = createAdminSession({ adminId: admin.id, username: admin.username });
  cookies().set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });
  redirect("/dashboard");
}
