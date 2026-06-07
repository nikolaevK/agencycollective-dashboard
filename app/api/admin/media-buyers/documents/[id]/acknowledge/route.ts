export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import {
  acknowledgeDocumentAction,
  unacknowledgeDocumentAction,
} from "@/app/actions/mediaDocuments";

function requireMediaAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media && !session.permissions.media_manage) {
    return null;
  }
  return session;
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const session = requireMediaAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await acknowledgeDocumentAction(params.id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/media-buyers/documents/acknowledge POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = requireMediaAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await unacknowledgeDocumentAction(params.id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/media-buyers/documents/acknowledge DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
