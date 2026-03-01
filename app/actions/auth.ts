"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { readUsers, writeUsers } from "@/lib/users";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";

export async function checkUserAction(
  userId: string
): Promise<{ exists: boolean; hasPassword: boolean }> {
  const users = readUsers();
  const user = users.find((u) => u.id === userId.trim());
  if (!user) return { exists: false, hasPassword: false };
  return { exists: true, hasPassword: Boolean(user.passwordHash) };
}

export async function loginAction(
  userId: string,
  password: string
): Promise<{ error: string } | undefined> {
  const users = readUsers();
  const user = users.find((u) => u.id === userId.trim());

  if (!user || !user.passwordHash) {
    return { error: "Invalid credentials" };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid credentials" };
  }

  const token = createSession({ userId: user.id, accountId: user.accountId });
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  redirect("/portal/overview");
}

export async function setPasswordAction(
  userId: string,
  password: string
): Promise<{ error: string } | undefined> {
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId.trim());
  if (idx === -1) return { error: "User not found" };
  if (users[idx].passwordHash) return { error: "Password already set" };

  users[idx].passwordHash = hashPassword(password);
  writeUsers(users);

  const token = createSession({
    userId: users[idx].id,
    accountId: users[idx].accountId,
  });

  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  redirect("/portal/overview");
}
