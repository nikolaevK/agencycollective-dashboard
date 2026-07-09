export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  findClientNote,
  updateClientNote,
  deleteClientNote,
  type UpdateClientNoteInput,
} from "@/lib/clientNotes";
import { logAuditEvent } from "@/lib/auditLog";

const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;

export function OPTIONS() {
  return corsPreflight();
}

/** Update a note: { body?, remindAt? (ISO-like|null), done? }. */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; noteId: string } }
) {
  const auth = await authenticateApiRequest(request, "client:write", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const note = await findClientNote(params.noteId);
    if (!note || note.userId !== params.id) {
      return fail("not_found", "Note not found on this client", 404);
    }

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const changes: UpdateClientNoteInput = {};
    if (body.body !== undefined) {
      const text = String(body.body).trim();
      if (!text) return fail("invalid_request", "body cannot be empty", 400);
      changes.body = text;
    }
    if (body.remindAt !== undefined) {
      if (body.remindAt === null || body.remindAt === "") {
        changes.remindAt = null;
      } else {
        const raw = String(body.remindAt);
        if (!ISO_LIKE_RE.test(raw)) {
          return fail("invalid_request", "remindAt must be ISO-like", 400);
        }
        changes.remindAt = raw;
      }
    }
    if (body.done !== undefined) changes.done = Boolean(body.done);

    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }
    await updateClientNote(params.noteId, changes);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.note_update",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ noteId: params.noteId, fields: Object.keys(changes) }),
    }).catch(() => {});

    const updated = await findClientNote(params.noteId);
    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/v1/client/clients/[id]/notes/[noteId] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; noteId: string } }
) {
  const auth = await authenticateApiRequest(request, "client:delete", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const note = await findClientNote(params.noteId);
    if (!note || note.userId !== params.id) {
      return fail("not_found", "Note not found on this client", 404);
    }

    await deleteClientNote(params.noteId);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "client.note_delete",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ noteId: params.noteId }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/client/clients/[id]/notes/[noteId] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
