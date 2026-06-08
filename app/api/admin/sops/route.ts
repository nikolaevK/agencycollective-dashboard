export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { listSops, listAllTags, createSop } from "@/lib/sop";
import { listSopFolders } from "@/lib/sopFolders";
import { logAuditEvent } from "@/lib/auditLog";

/** Any logged-in admin. */
function requireAdmin() {
  return getAdminSession();
}

export async function GET(request: Request) {
  const session = requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder")?.trim() || undefined;
  const tag = searchParams.get("tag")?.trim() || undefined;

  try {
    const [sops, folders, tags] = await Promise.all([
      listSops({ folder, tag }),
      listSopFolders(),
      listAllTags(),
    ]);
    return NextResponse.json({ data: { sops, folders, tags } });
  } catch (err) {
    console.error("[admin/sops GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { doc, folder, tags, status } = body as Record<string, unknown>;
    if (doc === undefined) {
      return NextResponse.json({ error: "doc is required" }, { status: 400 });
    }

    const record = await createSop(
      {
        rawDoc: doc,
        folder: typeof folder === "string" ? folder : undefined,
        tags,
        status,
      },
      session.adminId
    );

    logAuditEvent({
      adminId: session.adminId,
      adminUsername: session.username,
      action: "sop.create",
      targetType: "sop",
      targetId: record.id,
      details: JSON.stringify({ title: record.title, folder: record.folder }),
    }).catch(() => {});

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (err) {
    console.error("[admin/sops POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
