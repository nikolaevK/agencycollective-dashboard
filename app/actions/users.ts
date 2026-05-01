"use server";

import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  findUser,
  findUserByEmail,
  insertUser,
  updateUser,
  deleteUser,
  slugify,
  generateUniqueSlug,
} from "@/lib/users";
import type { UserStatus } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { logAuditEvent } from "@/lib/auditLog";

// ---------------------------------------------------------------------------
// Logo file handling (server-side only)
// ---------------------------------------------------------------------------

const ALLOWED_EXTS = ["png", "jpg", "jpeg", "webp"] as const;
const MAX_BYTES = 2 * 1024 * 1024;

async function saveLogo(
  userId: string,
  file: File
): Promise<{ logoPath: string } | { error: string }> {
  if (file.size === 0) return { error: "Empty file" };
  if (file.size > MAX_BYTES) return { error: "File too large (max 2 MB)" };

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTS.includes(ext as (typeof ALLOWED_EXTS)[number])) {
    return { error: "Invalid file type. Allowed: PNG, JPG, WEBP" };
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "logos");
  fs.mkdirSync(uploadDir, { recursive: true });

  const safeId = userId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const filename = `${safeId}.${ext}`;
  const bytes = await file.arrayBuffer();
  fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(bytes));

  return { logoPath: `/uploads/logos/${filename}` };
}

// ---------------------------------------------------------------------------
// Create user
// ---------------------------------------------------------------------------

export async function createUserAction(formData: FormData): Promise<{ error?: string }> {
  const admin = getAdminSession();
  if (!admin) return { error: "Unauthorized" };

  await ensureMigrated();

  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const category = String(formData.get("category") ?? "").trim() || null;
  const mrrStr = String(formData.get("mrr") ?? "0").trim();
  const logoFile = formData.get("logo") as File | null;

  if (!displayName || !email) {
    return { error: "Display name and email are required" };
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Invalid email address" };
  }

  // Check email uniqueness
  const existingByEmail = await findUserByEmail(email);
  if (existingByEmail) {
    return { error: "A client with this email already exists" };
  }

  // Parse MRR (input is dollars, store as cents)
  const mrrDollars = parseFloat(mrrStr) || 0;
  const mrr = Math.round(mrrDollars * 100);

  // Auto-generate ID from displayName
  const baseSlug = slugify(displayName);
  const id = baseSlug + "-" + crypto.randomBytes(4).toString("hex");
  const slug = await generateUniqueSlug(baseSlug || "client");

  let logoPath: string | null = null;
  if (logoFile && logoFile.size > 0) {
    const result = await saveLogo(id, logoFile);
    if ("error" in result) return result;
    logoPath = result.logoPath;
  }

  await insertUser({
    id,
    slug,
    accountId: "",  // legacy field — accounts managed via client_accounts
    displayName,
    logoPath,
    passwordHash: null,
    email,
    status: "active",
    mrr,
    category,
    createdAt: new Date().toISOString(),
    analystEnabled: true,
  });

  revalidatePath("/dashboard/users");
  return {};
}

// ---------------------------------------------------------------------------
// Update user
// ---------------------------------------------------------------------------

export async function updateUserAction(formData: FormData): Promise<{ error?: string }> {
  const admin = getAdminSession();
  if (!admin) return { error: "Unauthorized" };

  await ensureMigrated();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "User ID is required" };

  const user = await findUser(id);
  if (!user) return { error: "User not found" };

  const changes: Parameters<typeof updateUser>[1] = {};

  const displayName = formData.get("displayName") as string | null;
  if (displayName && displayName.trim()) {
    changes.displayName = displayName.trim();
  }

  const email = formData.get("email") as string | null;
  if (email && email.trim()) {
    const normalized = email.trim().toLowerCase();
    if (normalized !== user.email) {
      const existing = await findUserByEmail(normalized);
      if (existing && existing.id !== id) {
        return { error: "This email is already used by another client" };
      }
      changes.email = normalized;
    }
  }

  const status = formData.get("status") as string | null;
  if (status && ["active", "onboarding", "inactive", "archived"].includes(status)) {
    changes.status = status as UserStatus;
  }

  const mrrStr = formData.get("mrr") as string | null;
  if (mrrStr !== null && mrrStr !== undefined) {
    const mrrDollars = parseFloat(mrrStr) || 0;
    changes.mrr = Math.round(mrrDollars * 100);
  }

  const category = formData.get("category") as string | null;
  if (category !== null) {
    changes.category = category.trim() || null;
  }

  const logoFile = formData.get("logo") as File | null;
  if (logoFile && logoFile.size > 0) {
    const result = await saveLogo(id, logoFile);
    if ("error" in result) return result;
    changes.logoPath = result.logoPath;
  }

  // Legacy: also accept accountId for backward compat
  const rawAccountId = formData.get("accountId") as string | null;
  if (rawAccountId && rawAccountId.trim()) {
    const { normalizeAccountId } = await import("@/lib/users");
    changes.accountId = normalizeAccountId(rawAccountId.trim());
  }

  // Per-user feature gate. Only act on a string value — formData.get() can
  // also return File or null. Treating those as "false" would silently
  // disable a user on a malformed request, so we ignore non-string values
  // entirely (no change to the column).
  const analystFlag = formData.get("analystEnabled");
  if (typeof analystFlag === "string") {
    const next = analystFlag === "true" || analystFlag === "1" || analystFlag === "on";
    if (next !== user.analystEnabled) {
      changes.analystEnabled = next;
    }
  }

  await updateUser(id, changes);

  // Audit-log analyst-access changes specifically — they're a moderation lever.
  if (changes.analystEnabled !== undefined) {
    try {
      const adminRecord = await findAdmin(admin.adminId);
      await logAuditEvent({
        adminId: admin.adminId,
        adminUsername: adminRecord?.username ?? admin.adminId,
        action: changes.analystEnabled ? "enable_client_analyst" : "disable_client_analyst",
        targetType: "user",
        targetId: id,
        details: JSON.stringify({ slug: user.slug, displayName: user.displayName }),
      });
    } catch {
      // Audit logging is fire-and-forget elsewhere; preserve that semantics.
    }
  }

  revalidatePath("/dashboard/users");
  return {};
}

// ---------------------------------------------------------------------------
// Remove logo from a user
// ---------------------------------------------------------------------------

export async function removeUserLogoAction(id: string): Promise<{ error?: string }> {
  const admin = getAdminSession();
  if (!admin) return { error: "Unauthorized" };

  await ensureMigrated();
  const user = await findUser(id);
  if (!user) return { error: "User not found" };

  await updateUser(id, { logoPath: null });
  revalidatePath("/dashboard/users");
  return {};
}

// ---------------------------------------------------------------------------
// Delete user
// ---------------------------------------------------------------------------

export async function deleteUserAction(id: string): Promise<{ error?: string }> {
  const admin = getAdminSession();
  if (!admin) return { error: "Unauthorized" };

  await ensureMigrated();
  const deleted = await deleteUser(id);
  if (!deleted) return { error: "User not found" };

  revalidatePath("/dashboard/users");
  return {};
}
