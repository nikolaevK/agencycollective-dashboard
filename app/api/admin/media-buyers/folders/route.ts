export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { listFoldersWithColors } from "@/lib/mediaFolders";
import {
  createFolderAction,
  recolorFolderAction,
  renameFolderAction,
  setFolderImportantAction,
  deleteFolderAction,
} from "@/app/actions/mediaFolders";

function requireMediaAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media && !session.permissions.media_manage) {
    return null;
  }
  return session;
}

export async function GET() {
  const session = requireMediaAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const folders = await listFoldersWithColors();
    return NextResponse.json({ data: folders });
  } catch (err) {
    console.error("[admin/media-buyers/folders GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = requireMediaAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const result = await createFolderAction(body as { name: string; color?: string });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[admin/media-buyers/folders POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = requireMediaAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const b = body as Record<string, unknown>;

    if (typeof b.oldName === "string" && typeof b.newName === "string") {
      const result = await renameFolderAction({ oldName: b.oldName, newName: b.newName });
      if (result.error) {
        const status = result.error === "A folder with that name already exists" ? 409 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ data: result.data });
    }

    if (typeof b.name === "string" && typeof b.color === "string") {
      const result = await recolorFolderAction({ name: b.name, color: b.color });
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ data: result.data });
    }

    if (typeof b.name === "string" && typeof b.important === "boolean") {
      const result = await setFolderImportantAction({ name: b.name, important: b.important });
      if (result.error) {
        const status = result.error === "Forbidden" ? 403 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ data: result.data });
    }

    return NextResponse.json({ error: "Provide {oldName,newName}, {name,color} or {name,important}" }, { status: 400 });
  } catch (err) {
    console.error("[admin/media-buyers/folders PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = requireMediaAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  try {
    const result = await deleteFolderAction({ name });
    if (result.error) {
      const status = result.error === "Folder is not empty" ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/media-buyers/folders DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
