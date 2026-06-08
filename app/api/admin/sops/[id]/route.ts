export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import {
  getSop,
  updateSop,
  deleteSop,
  SopConflictError,
  SopNotFoundError,
} from "@/lib/sop";
import { logAuditEvent } from "@/lib/auditLog";

function requireAdmin() {
  return getAdminSession();
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const session = requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const record = await getSop(params.id);
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ data: record });
  } catch (err) {
    console.error("[admin/sops/:id GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const session = requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { doc, folder, tags, status, baseUpdatedAt } = body as Record<string, unknown>;

    const record = await updateSop(
      params.id,
      {
        rawDoc: doc,
        folder: typeof folder === "string" ? folder : undefined,
        tags: tags !== undefined ? tags : undefined,
        status: status !== undefined ? status : undefined,
      },
      session.adminId,
      baseUpdatedAt === undefined ? undefined : (baseUpdatedAt as string | null)
    );

    return NextResponse.json({ data: record });
  } catch (err) {
    if (err instanceof SopConflictError) {
      const current = await getSop(params.id);
      return NextResponse.json({ error: "conflict", data: current }, { status: 409 });
    }
    if (err instanceof SopNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[admin/sops/:id PUT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const ok = await deleteSop(params.id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

    logAuditEvent({
      adminId: session.adminId,
      adminUsername: session.username,
      action: "sop.delete",
      targetType: "sop",
      targetId: params.id,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/sops/:id DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
