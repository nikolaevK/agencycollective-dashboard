export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { findUser } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import {
  listClientNotes,
  createClientNote,
  updateClientNote,
  deleteClientNote,
  findClientNote,
} from "@/lib/clientNotes";

async function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

interface RouteContext {
  params: { userId: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();
  const notes = await listClientNotes(params.userId);
  return NextResponse.json({ data: notes });
}

export async function POST(request: Request, { params }: RouteContext) {
  const admin = await requireAdminSession();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  try {
    const user = await findUser(params.userId);
    if (!user)
      return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const body = (await request.json()) as {
      body?: string;
      remindAt?: string | null;
    };
    const text = String(body.body ?? "").trim();
    if (!text)
      return NextResponse.json({ error: "Note body is required" }, { status: 400 });

    const note = await createClientNote({
      userId: params.userId,
      authorId: admin.id,
      authorName: admin.displayName ?? admin.username ?? null,
      body: text,
      remindAt: body.remindAt ? String(body.remindAt) : null,
    });
    return NextResponse.json({ data: note }, { status: 201 });
  } catch (err) {
    console.error("[client-notes] POST failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  try {
    const body = (await request.json()) as {
      id?: string;
      body?: string;
      remindAt?: string | null;
      done?: boolean;
    };
    if (!body.id)
      return NextResponse.json({ error: "Note id is required" }, { status: 400 });

    // Confirm the note belongs to this client before mutating.
    const existing = await findClientNote(body.id);
    if (!existing || existing.userId !== params.userId)
      return NextResponse.json({ error: "Note not found" }, { status: 404 });

    await updateClientNote(body.id, {
      body: body.body,
      remindAt: body.remindAt,
      done: body.done,
    });
    const note = await findClientNote(body.id);
    return NextResponse.json({ data: note });
  } catch (err) {
    console.error("[client-notes] PATCH failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });

    const existing = await findClientNote(id);
    if (!existing || existing.userId !== params.userId)
      return NextResponse.json({ error: "Note not found" }, { status: 404 });

    await deleteClientNote(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[client-notes] DELETE failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
