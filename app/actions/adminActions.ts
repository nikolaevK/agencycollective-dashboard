"use server";

import fs from "fs";
import path from "path";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin, updateAdmin } from "@/lib/admins";

const ALLOWED_EXTS = ["png", "jpg", "jpeg", "webp"] as const;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

export async function uploadAdminAvatar(
  formData: FormData
): Promise<{ avatarPath: string } | { error: string }> {
  const session = getAdminSession();
  if (!session) return { error: "Unauthorized" };

  const caller = await findAdmin(session.adminId);
  if (!caller || !caller.isSuper) return { error: "Forbidden" };

  const adminId = formData.get("adminId") as string | null;
  const file = formData.get("avatar") as File | null;

  if (!adminId) return { error: "adminId is required" };

  // Verify target admin exists before writing any file
  const target = await findAdmin(adminId);
  if (!target) return { error: "Admin not found" };

  if (!file || file.size === 0) return { error: "No file provided" };
  if (file.size > MAX_BYTES) return { error: "File too large (max 2 MB)" };

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTS.includes(ext as (typeof ALLOWED_EXTS)[number])) {
    return { error: "Invalid file type. Allowed: PNG, JPG, WEBP" };
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
  fs.mkdirSync(uploadDir, { recursive: true });

  const safeId = adminId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const filename = `${safeId}.${ext}`;
  const bytes = await file.arrayBuffer();
  fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(bytes));

  const avatarPath = `/uploads/avatars/${filename}`;
  await updateAdmin(adminId, { avatarPath });

  return { avatarPath };
}
