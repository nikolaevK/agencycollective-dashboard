export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { readClosers } from "@/lib/closers";
import {
  createNote,
  getSharesForNoteIds,
  isNotePriority,
  listNotesByOwner,
  listNotesSharedWithUser,
  sanitizeShareIds,
  sanitizeTags,
  setNoteShares,
  NOTE_TITLE_MAX,
  NOTE_BODY_MAX,
} from "@/lib/notes";

export async function GET() {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [own, sharedWithMe, sharedArchived] = await Promise.all([
    listNotesByOwner(session.closerId),
    listNotesSharedWithUser(session.closerId),
    listNotesSharedWithUser(session.closerId, { archived: true }),
  ]);

  // Attach the per-note recipient list to own notes so the UI can show the
  // share chips without a second call.
  const sharesByNote = await getSharesForNoteIds(own.map((n) => n.id));
  const ownWithShares = own.map((n) => ({ ...n, sharedWith: sharesByNote[n.id] ?? [] }));

  return NextResponse.json({
    data: { own: ownWithShares, sharedWithMe, sharedArchived },
  });
}

export async function POST(request: Request) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (title.length > NOTE_TITLE_MAX) {
    return NextResponse.json({ error: `title must be ${NOTE_TITLE_MAX} characters or fewer` }, { status: 400 });
  }

  const noteBody = typeof body.body === "string" ? body.body : "";
  if (noteBody.length > NOTE_BODY_MAX) {
    return NextResponse.json({ error: `body must be ${NOTE_BODY_MAX} characters or fewer` }, { status: 400 });
  }

  const priority = body.priority;
  if (priority !== undefined && !isNotePriority(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  const dueDate = body.dueDate === undefined || body.dueDate == null
    ? null
    : String(body.dueDate).trim() || null;

  const tags = sanitizeTags(body.tags);

  const linkedGoogleEventId =
    body.linkedGoogleEventId === undefined || body.linkedGoogleEventId == null
      ? null
      : String(body.linkedGoogleEventId).trim() || null;
  const linkedDealId =
    body.linkedDealId === undefined || body.linkedDealId == null
      ? null
      : String(body.linkedDealId).trim() || null;

  const note = await createNote({
    ownerId: session.closerId,
    title,
    body: noteBody,
    priority: isNotePriority(priority) ? priority : undefined,
    dueDate,
    tags,
    linkedGoogleEventId,
    linkedDealId,
  });

  // Apply share list if the client sent one. Unknown ids, self-shares, and
  // overflow past the cap are silently dropped.
  let cleanedShares: string[] = [];
  if (body.sharedWith !== undefined) {
    const validIds = new Set((await readClosers()).map((c) => c.id));
    cleanedShares = sanitizeShareIds(body.sharedWith, session.closerId, validIds);
    await setNoteShares(note.id, cleanedShares);
  }

  return NextResponse.json(
    { data: { ...note, sharedWith: cleanedShares } },
    { status: 201 }
  );
}
