"use server";

import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  findCloser,
  findCloserByEmail,
  insertCloser,
  updateCloser,
  deleteCloser,
  generateUniqueCloserSlug,
} from "@/lib/closers";
import { slugify } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { getAdminSession } from "@/lib/adminSession";
import { logAuditEvent } from "@/lib/auditLog";
import type { CloserRole } from "@/lib/closers";

const ALLOWED_EXTS = ["png", "jpg", "jpeg", "webp"] as const;
const MAX_BYTES = 2 * 1024 * 1024;

const VALID_ROLES: CloserRole[] = [
  "senior_closer",
  "account_executive",
  "inbound_specialist",
  "closer",
];

async function saveAvatar(
  closerId: string,
  file: File
): Promise<{ avatarPath: string } | { error: string }> {
  if (file.size === 0) return { error: "Empty file" };
  if (file.size > MAX_BYTES) return { error: "File too large (max 2 MB)" };

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTS.includes(ext as (typeof ALLOWED_EXTS)[number])) {
    return { error: "Invalid file type. Allowed: PNG, JPG, WEBP" };
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
  fs.mkdirSync(uploadDir, { recursive: true });

  const safeId = closerId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const filename = `closer_${safeId}.${ext}`;
  const bytes = await file.arrayBuffer();
  fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(bytes));

  return { avatarPath: `/uploads/avatars/${filename}` };
}

// ---------------------------------------------------------------------------
// Create closer
// ---------------------------------------------------------------------------

export async function createCloserAction(formData: FormData): Promise<{ error?: string }> {
  const admin = getAdminSession();
  if (!admin) return { error: "Unauthorized" };

  await ensureMigrated();

  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "closer").trim() as CloserRole;
  const commissionStr = String(formData.get("commissionRate") ?? "0").trim();
  const quotaStr = String(formData.get("quota") ?? "0").trim();
  const avatarFile = formData.get("avatar") as File | null;

  if (!displayName || !email) {
    return { error: "Name and email are required" };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Invalid email address" };
  }

  if (!VALID_ROLES.includes(role)) {
    return { error: "Invalid role" };
  }

  const existingByEmail = await findCloserByEmail(email);
  if (existingByEmail) {
    return { error: "A closer with this email already exists" };
  }

  // Commission rate: input is percentage (e.g. 12.5), store as basis points (1250)
  const commissionPct = parseFloat(commissionStr) || 0;
  const commissionRate = Math.round(commissionPct * 100);

  // Quota: input is dollars, store as cents
  const quotaDollars = parseFloat(quotaStr) || 0;
  const quota = Math.round(quotaDollars * 100);

  const baseSlug = slugify(displayName);
  const id = baseSlug + "-" + crypto.randomBytes(4).toString("hex");
  const slug = await generateUniqueCloserSlug(baseSlug || "closer");

  let avatarPath: string | null = null;
  if (avatarFile && avatarFile.size > 0) {
    const result = await saveAvatar(id, avatarFile);
    if ("error" in result) return result;
    avatarPath = result.avatarPath;
  }

  await insertCloser({
    id,
    slug,
    displayName,
    email,
    passwordHash: null,
    role,
    commissionRate,
    quota,
    status: "active",
    avatarPath,
    createdAt: new Date().toISOString(),
  });

  logAuditEvent({
    adminId: admin.adminId,
    adminUsername: admin.username,
    action: "closer.create",
    targetType: "closer",
    targetId: id,
    details: JSON.stringify({ displayName, email, role }),
  }).catch(() => {});

  revalidatePath("/dashboard/closers");
  return {};
}

// ---------------------------------------------------------------------------
// Update closer
// ---------------------------------------------------------------------------

export async function updateCloserAction(formData: FormData): Promise<{ error?: string }> {
  const admin = getAdminSession();
  if (!admin) return { error: "Unauthorized" };

  await ensureMigrated();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Closer ID is required" };

  const closer = await findCloser(id);
  if (!closer) return { error: "Closer not found" };

  const changes: Parameters<typeof updateCloser>[1] = {};

  const displayName = formData.get("displayName") as string | null;
  if (displayName && displayName.trim()) {
    changes.displayName = displayName.trim();
  }

  const email = formData.get("email") as string | null;
  if (email && email.trim()) {
    const normalized = email.trim().toLowerCase();
    if (normalized !== closer.email) {
      const existing = await findCloserByEmail(normalized);
      if (existing && existing.id !== id) {
        return { error: "This email is already used by another closer" };
      }
      changes.email = normalized;
    }
  }

  const role = formData.get("role") as string | null;
  if (role && VALID_ROLES.includes(role as CloserRole)) {
    changes.role = role as CloserRole;
  }

  const commissionStr = formData.get("commissionRate") as string | null;
  if (commissionStr !== null && commissionStr !== undefined) {
    const commissionPct = parseFloat(commissionStr) || 0;
    changes.commissionRate = Math.round(commissionPct * 100);
  }

  const quotaStr = formData.get("quota") as string | null;
  if (quotaStr !== null && quotaStr !== undefined) {
    const quotaDollars = parseFloat(quotaStr) || 0;
    changes.quota = Math.round(quotaDollars * 100);
  }

  const status = formData.get("status") as string | null;
  if (status && ["active", "inactive"].includes(status)) {
    changes.status = status as "active" | "inactive";
  }

  const avatarFile = formData.get("avatar") as File | null;
  if (avatarFile && avatarFile.size > 0) {
    const result = await saveAvatar(id, avatarFile);
    if ("error" in result) return result;
    changes.avatarPath = result.avatarPath;
  }

  await updateCloser(id, changes);

  logAuditEvent({
    adminId: admin.adminId,
    adminUsername: admin.username,
    action: "closer.update",
    targetType: "closer",
    targetId: id,
    details: JSON.stringify(changes),
  }).catch(() => {});

  revalidatePath("/dashboard/closers");
  return {};
}

// ---------------------------------------------------------------------------
// Delete closer
// ---------------------------------------------------------------------------

export async function deleteCloserAction(id: string): Promise<{ error?: string }> {
  const admin = getAdminSession();
  if (!admin) return { error: "Unauthorized" };

  await ensureMigrated();

  const closer = await findCloser(id);
  const deleted = await deleteCloser(id);
  if (!deleted) return { error: "Closer not found" };

  logAuditEvent({
    adminId: admin.adminId,
    adminUsername: admin.username,
    action: "closer.delete",
    targetType: "closer",
    targetId: id,
    details: closer ? JSON.stringify({ displayName: closer.displayName, email: closer.email }) : undefined,
  }).catch(() => {});

  revalidatePath("/dashboard/closers");
  return {};
}
