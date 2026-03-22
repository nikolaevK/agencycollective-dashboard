"use server";

import { revalidatePath } from "next/cache";
import { ensureMigrated } from "@/lib/db";
import { findUser } from "@/lib/users";
import { getAdminSession } from "@/lib/adminSession";
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

  const user = await findUser(userId);
  if (!user) return { error: "User not found" };

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

  await toggleAccountActive(userId, accountId, isActive);
  revalidatePath("/dashboard/users");
  return {};
}
