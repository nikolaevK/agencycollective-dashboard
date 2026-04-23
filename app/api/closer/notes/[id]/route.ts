export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { readClosers } from "@/lib/closers";
import {
  deleteNote,
  findNote,
  isNotePriority,
  sanitizeShareIds,
  sanitizeTags,
  setNoteShares,
  updateNote,
  NOTE_TITLE_MAX,
  NOTE_BODY_MAX,
} from "@/lib/notes";

interface Params {
  params: { id: string };
}

/**
 * Verify the session owns the note before allowing any write. Notes are
 * strictly private per owner — no cross-user access, no admin override from
 * this endpoint.
 */
async function loadOwnedNote(id: string, ownerId: string) {
  const note = await findNote(id);
  if (!note) return { error: "Not found" as const, status: 404 };
  if (note.ownerId !== ownerId) return { error: "Forbidden" as const, status: 403 };
  return { note };
}

export async function PATCH(request: Request, { params }: Params) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loaded = await loadOwnedNote(params.id, session.closerId);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const changes: Parameters<typeof updateNote>[1] = {};

  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    if (t.length > NOTE_TITLE_MAX) {
      return NextResponse.json({ error: `title must be ${NOTE_TITLE_MAX} characters or fewer` }, { status: 400 });
    }
    changes.title = t;
  }

  if (body.body !== undefined) {
    const b = typeof body.body === "string" ? body.body : "";
    if (b.length > NOTE_BODY_MAX) {
      return NextResponse.json({ error: `body must be ${NOTE_BODY_MAX} characters or fewer` }, { status: 400 });
    }
    changes.body = b;
  }

  if (body.priority !== undefined) {
    if (!isNotePriority(body.priority)) {
      return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
    }
    changes.priority = body.priority;
  }

  if (body.dueDate !== undefined) {
    changes.dueDate = body.dueDate == null ? null : String(body.dueDate).trim() || null;
  }

  if (body.tags !== undefined) {
    changes.tags = sanitizeTags(body.tags);
  }

  if (body.linkedGoogleEventId !== undefined) {
    changes.linkedGoogleEventId = body.linkedGoogleEventId == null
      ? null
      : String(body.linkedGoogleEventId).trim() || null;
  }

  if (body.linkedDealId !== undefined) {
    changes.linkedDealId = body.linkedDealId == null
      ? null
      : String(body.linkedDealId).trim() || null;
  }

  await updateNote(params.id, changes);

  // Share list lives in a separate table; apply separately when the client
  // sent it. Uses the same sanitizer as POST.
  if (body.sharedWith !== undefined) {
    if (!Array.isArray(body.sharedWith)) {
      return NextResponse.json({ error: "sharedWith must be an array" }, { status: 400 });
    }
    const validIds = new Set((await readClosers()).map((c) => c.id));
    const cleaned = sanitizeShareIds(body.sharedWith, session.closerId, validIds);
    await setNoteShares(params.id, cleaned);
  }

  const updated = await findNote(params.id);
  return NextResponse.json({ data: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loaded = await loadOwnedNote(params.id, session.closerId);
  if ("error" in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  await deleteNote(params.id);
  return NextResponse.json({ ok: true });
}
