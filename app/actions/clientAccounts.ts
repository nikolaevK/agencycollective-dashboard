"use server";

import { revalidatePath } from "next/cache";
import { ensureMigrated } from "@/lib/db";
import { getAdminSession } from "@/lib/adminSession";
import { getScopeForAdminId, clientVisibleToScope } from "@/lib/api/supportScope";
import {
  addAccountToUser,
  removeAccountFromUser,
  toggleAccountActive,
} from "@/lib/clientAccounts";

export async function addClientAccountAction(
  userId: string,
  accountId: string,
  label?: string
): Promise<{ error?: string }> {
  const admin = getAdminSession();
  if (!admin) return { error: "Unauthorized" };

  await ensureMigrated();

  if (!userId || !accountId) {
    return { error: "User ID and Account ID are required" };
  }

  // Workspace scoping: out-of-book clients read as not-found.
  const scope = await getScopeForAdminId(admin.adminId);
  if (scope === undefined) return { error: "Unauthorized" };
  if (!(await clientVisibleToScope(scope, userId))) {
    return { error: "User not found" };
  }

  await addAccountToUser(userId, accountId.trim(), label?.trim());
  revalidatePath("/dashboard/users");
  return {};
}

export async function removeClientAccountAction(
  userId: string,
  accountId: string
): Promise<{ error?: string }> {
  const admin = getAdminSession();
  if (!admin) return { error: "Unauthorized" };

  await ensureMigrated();

  if (!userId || !accountId) {
    return { error: "User ID and Account ID are required" };
  }

  // Workspace scoping: out-of-book clients read as not-found.
  const scope = await getScopeForAdminId(admin.adminId);
  if (scope === undefined) return { error: "Unauthorized" };
  if (!(await clientVisibleToScope(scope, userId))) {
    return { error: "User not found" };
  }

  const deleted = await removeAccountFromUser(userId, accountId);
  if (!deleted) return { error: "Account not found for this user" };

  revalidatePath("/dashboard/users");
  return {};
}

export async function toggleClientAccountAction(
  userId: string,
  accountId: string,
  isActive: boolean
): Promise<{ error?: string }> {
  const admin = getAdminSession();
  if (!admin) return { error: "Unauthorized" };

  await ensureMigrated();

  if (!userId || !accountId) {
    return { error: "User ID and Account ID are required" };
  }

  // Workspace scoping: out-of-book clients read as not-found.
  const scope = await getScopeForAdminId(admin.adminId);
  if (scope === undefined) return { error: "Unauthorized" };
  if (!(await clientVisibleToScope(scope, userId))) {
    return { error: "User not found" };
  }

  await toggleAccountActive(userId, accountId, isActive);
  revalidatePath("/dashboard/users");
  return {};
}
