export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import {

  listClientNotes,
  createClientNote,
  updateClientNote,
  deleteClientNote,
  findClientNote,
} from "@/lib/clientNotes";
import { requireClientRouteActor } from "@/lib/api/requireAdmin";


interface RouteContext {
  params: { userId: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
  await ensureMigrated();
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

  const notes = await listClientNotes(params.userId);
  return NextResponse.json({ data: notes });
}

export async function POST(request: Request, { params }: RouteContext) {
  await ensureMigrated();
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;
  const admin = guard.actor.admin;

  try {
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
  await ensureMigrated();
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

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
  await ensureMigrated();
  const guard = await requireClientRouteActor(params.userId);
  if (guard.response) return guard.response;

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
