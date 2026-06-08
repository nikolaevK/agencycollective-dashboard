export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { renameSopFolder, deleteSopFolder } from "@/lib/sopFolders";

export async function PUT(request: Request, { params }: { params: { name: string } }) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const oldName = decodeURIComponent(params.name);
    const body = await request.json().catch(() => null);
    const newName = body && typeof body === "object" ? String((body as Record<string, unknown>).name ?? "") : "";
    const result = await renameSopFolder(oldName, newName);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[admin/sops/folders/:name PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { name: string } }) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const name = decodeURIComponent(params.name);
    const result = await deleteSopFolder(name);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/sops/folders/:name DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
