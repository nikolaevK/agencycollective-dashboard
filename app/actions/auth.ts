"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { findUser, findUserByEmail, updateUser } from "@/lib/users";
import { readActiveAccountsForUser } from "@/lib/clientAccounts";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, getSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/session";
import { ensureMigrated } from "@/lib/db";

/**
 * Resolve accounts for a user.
 * Returns the primary accountId + all active account IDs for session.
 */
async function resolveAccounts(userId: string, legacyAccountId: string): Promise<{ accountId: string; accountIds: string[] }> {
  const accounts = await readActiveAccountsForUser(userId);
  const accountIds = accounts.map((a) => a.accountId);
  const accountId = accountIds[0] ?? legacyAccountId;
  return { accountId, accountIds: accountIds.length > 0 ? accountIds : legacyAccountId ? [legacyAccountId] : [] };
}

export async function checkUserAction(
  email: string
): Promise<{ exists: boolean; hasPassword: boolean }> {
  await ensureMigrated();
  const user = await findUserByEmail(email.trim());
  if (!user) return { exists: false, hasPassword: false };
  return { exists: true, hasPassword: Boolean(user.passwordHash) };
}

export async function loginAction(
  email: string,
  password: string
): Promise<{ error: string } | undefined> {
  await ensureMigrated();
  const user = await findUserByEmail(email.trim());

  if (!user || !user.passwordHash) {
    return { error: "Invalid credentials" };
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid credentials" };
  }

  const { accountId, accountIds } = await resolveAccounts(user.id, user.accountId);
  const token = createSession({ userId: user.id, accountId, accountIds });
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  redirect(`/${user.slug}/portal/overview`);
}

export async function setPasswordAction(
  email: string,
  password: string
): Promise<{ error: string } | undefined> {
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  if (password.length > 128) {
    return { error: "Password must be at most 128 characters" };
  }

  await ensureMigrated();
  const user = await findUserByEmail(email.trim());
  if (!user) return { error: "User not found" };
  if (user.passwordHash) return { error: "Password already set" };

  await updateUser(user.id, { passwordHash: hashPassword(password) });

  const { accountId, accountIds } = await resolveAccounts(user.id, user.accountId);
  const token = createSession({ userId: user.id, accountId, accountIds });
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });

  redirect(`/${user.slug}/portal/overview`);
}

export async function switchAccountAction(
  newAccountId: string
): Promise<{ error: string } | undefined> {
  const session = getSession();
  if (!session) return { error: "Not authenticated" };

  await ensureMigrated();
  const user = await findUser(session.userId);
  if (!user) return { error: "User not found" };

  // Validate the account belongs to the user
  const activeAccounts = await readActiveAccountsForUser(user.id);
  const valid = activeAccounts.some((a) => a.accountId === newAccountId);
  if (!valid) return { error: "Account not linked to your profile" };

  const accountIds = activeAccounts.map((a) => a.accountId);
  const token = createSession({ userId: user.id, accountId: newAccountId, accountIds });
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}
