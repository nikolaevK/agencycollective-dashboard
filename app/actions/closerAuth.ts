"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { findCloserByEmail, updateCloser } from "@/lib/closers";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createCloserSession, CLOSER_SESSION_COOKIE_NAME, CLOSER_SESSION_MAX_AGE } from "@/lib/closerSession";
import { ensureMigrated } from "@/lib/db";

export async function checkCloserAction(
  email: string
): Promise<{ exists: boolean; hasPassword: boolean }> {
  await ensureMigrated();
  const closer = await findCloserByEmail(email.trim());
  if (!closer) return { exists: false, hasPassword: false };
  return { exists: true, hasPassword: Boolean(closer.passwordHash) };
}

export async function closerLoginAction(
  email: string,
  password: string
): Promise<{ error: string } | undefined> {
  await ensureMigrated();
  const closer = await findCloserByEmail(email.trim());

  if (!closer || !closer.passwordHash) {
    return { error: "Invalid credentials" };
  }

  if (closer.status !== "active") {
    return { error: "Your account is inactive. Please contact your administrator." };
  }

  if (!verifyPassword(password, closer.passwordHash)) {
    return { error: "Invalid credentials" };
  }

  const token = createCloserSession({
    closerId: closer.id,
    slug: closer.slug,
    displayName: closer.displayName,
    role: closer.role,
  });
  cookies().set(CLOSER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: CLOSER_SESSION_MAX_AGE,
    path: "/",
  });

  redirect(closer.role === "setter" ? "/closer/setter" : "/closer/dashboard");
}

export async function closerSetPasswordAction(
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
  const closer = await findCloserByEmail(email.trim());
  if (!closer) return { error: "Account not found" };
  if (closer.passwordHash) return { error: "Password already set" };

  await updateCloser(closer.id, { passwordHash: hashPassword(password) });

  const token = createCloserSession({
    closerId: closer.id,
    slug: closer.slug,
    displayName: closer.displayName,
    role: closer.role,
  });
  cookies().set(CLOSER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: CLOSER_SESSION_MAX_AGE,
    path: "/",
  });

  redirect(closer.role === "setter" ? "/closer/setter" : "/closer/dashboard");
}
