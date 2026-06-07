"use server";

import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { logAuditEvent } from "@/lib/auditLog";
import {
  upsertFolder,
  renameFolder,
  deleteFolder,
  setFolderImportant,
  isFolderColor,
  DEFAULT_FOLDER_COLOR,
  normalizeFolderName,
} from "@/lib/mediaFolders";
import type { MediaFolder, MediaFolderColor } from "@/lib/mediaFolders";

async function requireMediaAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media && !session.permissions.media_manage) {
    return null;
  }
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return { session, admin };
}

async function requireMediaManager() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media_manage) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return { session, admin };
}

function actorName(session: { displayName: string | null; username: string }): string {
  return session.displayName ?? session.username;
}

function resolveColor(raw: unknown): MediaFolderColor {
  const c = String(raw ?? "");
  return isFolderColor(c) ? c : DEFAULT_FOLDER_COLOR;
}

export async function createFolderAction(input: {
  name: string;
  color?: string;
}): Promise<{ data?: MediaFolder; error?: string }> {
  const auth = await requireMediaAdmin();
  if (!auth) return { error: "Unauthorized" };

  const name = normalizeFolderName(input.name ?? "");
  if (!name) return { error: "Folder name is required" };
  const color = resolveColor(input.color);

  const result = await upsertFolder(name, color, auth.session.adminId, actorName(auth.session));
  if ("error" in result) return { error: result.error };

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "media_folder.create",
      targetType: "media_folder",
      targetId: name,
      details: JSON.stringify({ name, color }),
    });
  } catch {
    /* fire-and-forget */
  }
  return { data: result };
}

export async function recolorFolderAction(input: {
  name: string;
  color: string;
}): Promise<{ data?: MediaFolder; error?: string }> {
  const auth = await requireMediaAdmin();
  if (!auth) return { error: "Unauthorized" };

  const name = normalizeFolderName(input.name ?? "");
  if (!name) return { error: "Folder name is required" };
  if (!isFolderColor(String(input.color))) return { error: "Invalid color" };
  const color = input.color as MediaFolderColor;

  const result = await upsertFolder(name, color, auth.session.adminId, actorName(auth.session));
  if ("error" in result) return { error: result.error };

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "media_folder.recolor",
      targetType: "media_folder",
      targetId: name,
      details: JSON.stringify({ name, color }),
    });
  } catch {
    /* fire-and-forget */
  }
  return { data: result };
}

export async function renameFolderAction(input: {
  oldName: string;
  newName: string;
}): Promise<{ data?: { name: string }; error?: string }> {
  const auth = await requireMediaAdmin();
  if (!auth) return { error: "Unauthorized" };

  const oldName = String(input.oldName ?? "");
  if (!oldName) return { error: "Missing folder" };

  const result = await renameFolder(oldName, input.newName ?? "");
  if ("error" in result) return { error: result.error };

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "media_folder.rename",
      targetType: "media_folder",
      targetId: result.name,
      details: JSON.stringify({ from: oldName, to: result.name }),
    });
  } catch {
    /* fire-and-forget */
  }
  return { data: result };
}

export async function setFolderImportantAction(input: {
  name: string;
  important: boolean;
}): Promise<{ data?: MediaFolder; error?: string }> {
  const auth = await requireMediaManager();
  if (!auth) return { error: "Forbidden" };

  const name = normalizeFolderName(input.name ?? "");
  if (!name) return { error: "Folder name is required" };

  const result = await setFolderImportant(name, Boolean(input.important));
  if ("error" in result) return { error: result.error };

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "media_folder.important",
      targetType: "media_folder",
      targetId: name,
      details: JSON.stringify({ name, important: Boolean(input.important) }),
    });
  } catch {
    /* fire-and-forget */
  }
  return { data: result };
}

export async function deleteFolderAction(input: {
  name: string;
}): Promise<{ error?: string }> {
  const auth = await requireMediaAdmin();
  if (!auth) return { error: "Unauthorized" };

  const name = String(input.name ?? "");
  if (!name) return { error: "Missing folder" };

  const result = await deleteFolder(name);
  if (result.error) return { error: result.error };

  try {
    await logAuditEvent({
      adminId: auth.session.adminId,
      adminUsername: auth.session.username,
      action: "media_folder.delete",
      targetType: "media_folder",
      targetId: name,
      details: JSON.stringify({ name }),
    });
  } catch {
    /* fire-and-forget */
  }
  return {};
}
