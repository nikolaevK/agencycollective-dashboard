export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCloserSession } from "@/lib/closerSession";
import { findNote, isShareRecipient, setShareArchived } from "@/lib/notes";

interface Params {
  params: { id: string };
}

/**
 * Recipient-side archive toggle. Body: `{ archived: boolean }`.
 * - Only a recipient of the note can call (verified via isShareRecipient).
 * - The owner of the note cannot archive their own copy — if they want it
 *   off the board, they delete the note outright.
 * - 404 when the note is missing; 403 when the caller isn't a recipient;
 *   409 if the caller *is* the owner.
 */
export async function POST(request: Request, { params }: Params) {
  const session = getCloserSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const note = await findNote(params.id);
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (note.ownerId === session.closerId) {
    return NextResponse.json(
      { error: "Owners don't archive their own notes — delete them instead." },
      { status: 409 }
    );
  }

  const isRecipient = await isShareRecipient(params.id, session.closerId);
  if (!isRecipient) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Strict boolean — avoids silently treating "true" / {} / undefined as
  // archived=false (which would unarchive).
  if (body.archived !== true && body.archived !== false) {
    return NextResponse.json(
      { error: "archived must be a boolean" },
      { status: 400 }
    );
  }

  // Double-check the UPDATE actually affected a row. The isShareRecipient
  // call above should have caught a missing row, but racing concurrent
  // deletes could remove the share between the check and the update.
  const updated = await setShareArchived(params.id, session.closerId, body.archived);
  if (!updated) {
    return NextResponse.json({ error: "Share no longer exists" }, { status: 404 });
  }

  return NextResponse.json({ data: { archived: body.archived } });
}
