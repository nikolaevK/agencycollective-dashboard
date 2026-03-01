"use server";

import { revalidatePath } from "next/cache";
import fs from "fs";
import path from "path";
import {
  findUser,
  insertUser,
  updateUser,
  deleteUser,
  normalizeAccountId,
  slugify,
  generateUniqueSlug,
} from "@/lib/users";

// ---------------------------------------------------------------------------
// Logo file handling (server-side only)
// ---------------------------------------------------------------------------

const ALLOWED_EXTS = ["png", "jpg", "jpeg", "webp", "svg"] as const;
const MAX_BYTES = 2 * 1024 * 1024;

async function saveLogo(
  userId: string,
  file: File
): Promise<{ logoPath: string } | { error: string }> {
  if (file.size === 0) return { error: "Empty file" };
  if (file.size > MAX_BYTES) return { error: "File too large (max 2 MB)" };

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTS.includes(ext as (typeof ALLOWED_EXTS)[number])) {
    return { error: "Invalid file type. Allowed: PNG, JPG, WEBP, SVG" };
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
  const id = String(formData.get("id") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim();
  const logoFile = formData.get("logo") as File | null;

  if (!id || !displayName || !accountId) {
    return { error: "User ID, display name, and account ID are required" };
  }

  const existing = await findUser(id);
  if (existing) {
    return { error: "User ID already exists" };
  }

  let logoPath: string | null = null;
  if (logoFile && logoFile.size > 0) {
    const result = await saveLogo(id, logoFile);
    if ("error" in result) return result;
    logoPath = result.logoPath;
  }

  const slug = await generateUniqueSlug(slugify(displayName) || slugify(id));

  await insertUser({
    id,
    slug,
    accountId: normalizeAccountId(accountId),
    displayName,
    logoPath,
    passwordHash: null,
  });

  revalidatePath("/dashboard/users");
  return {};
}

// ---------------------------------------------------------------------------
// Update user — Account ID and/or Logo
// ---------------------------------------------------------------------------

export async function updateUserAction(formData: FormData): Promise<{ error?: string }> {
  const id = String(formData.get("id") ?? "").trim();
  const rawAccountId = formData.get("accountId") as string | null;
  const logoFile = formData.get("logo") as File | null;

  if (!id) return { error: "User ID is required" };

  const user = await findUser(id);
  if (!user) return { error: "User not found" };

  const changes: Parameters<typeof updateUser>[1] = {};

  if (rawAccountId && rawAccountId.trim()) {
    changes.accountId = normalizeAccountId(rawAccountId.trim());
  }

  if (logoFile && logoFile.size > 0) {
    const result = await saveLogo(id, logoFile);
    if ("error" in result) return result;
    changes.logoPath = result.logoPath;
  }

  await updateUser(id, changes);
  revalidatePath("/dashboard/users");
  return {};
}

// ---------------------------------------------------------------------------
// Remove logo from a user
// ---------------------------------------------------------------------------

export async function removeUserLogoAction(id: string): Promise<{ error?: string }> {
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
  const deleted = await deleteUser(id);
  if (!deleted) return { error: "User not found" };

  revalidatePath("/dashboard/users");
  return {};
}
