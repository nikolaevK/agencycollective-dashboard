export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { listSopFolders, upsertSopFolder, isFolderColor, DEFAULT_FOLDER_COLOR } from "@/lib/sopFolders";

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const folders = await listSopFolders();
    return NextResponse.json({ data: { folders } });
  } catch (err) {
    console.error("[admin/sops/folders GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { name, color, icon } = body as Record<string, unknown>;
    const colorVal = typeof color === "string" && isFolderColor(color) ? color : DEFAULT_FOLDER_COLOR;
    const iconVal = typeof icon === "string" && icon ? icon : null;
    const result = await upsertSopFolder(String(name ?? ""), colorVal, iconVal);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[admin/sops/folders POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
