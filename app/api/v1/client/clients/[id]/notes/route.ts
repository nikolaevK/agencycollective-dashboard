export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { findUser } from "@/lib/users";
import { listClientNotes, createClientNote } from "@/lib/clientNotes";
import { logAuditEvent } from "@/lib/auditLog";

const ISO_LIKE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?/;

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:read", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  const user = await findUser(params.id);
  if (!user) return fail("not_found", "Client not found", 404);

  const notes = await listClientNotes(params.id);
  return ok(notes);
}

/** Create a note/reminder: { body (required, ≤10k), remindAt? (ISO-like) }. */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "client:write", {
    resource: { kind: "client", id: params.id },
  });
  if (!auth.ok) return auth.response;

  try {
    const user = await findUser(params.id);
    if (!user) return fail("not_found", "Client not found", 404);

    const body = await readJsonBody(request);
    const text = String(body?.body ?? "").trim();
    if (!text) return fail("invalid_request", "body is required", 400);

    let remindAt: string | undefined;
    if (body?.remindAt != null && body.remindAt !== "") {
      const raw = String(body.remindAt);
      if (!ISO_LIKE_RE.test(raw)) {
        return fail("invalid_request", "remindAt must be ISO-like", 400);
      }
      remindAt = raw;
    }

    const actor = tokenAuditActor(auth.token);
    const note = await createClientNote({
      userId: params.id,
      authorId: actor.adminId,
      authorName: actor.adminUsername,
      body: text,
      remindAt,
    });

    logAuditEvent({
      ...actor,
      action: "client.note_create",
      targetType: "client",
      targetId: params.id,
      details: JSON.stringify({ noteId: note.id }),
    }).catch(() => {});

    return ok(note, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/client/clients/[id]/notes error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
