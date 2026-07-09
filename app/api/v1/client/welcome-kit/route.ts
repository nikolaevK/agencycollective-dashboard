export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  getWelcomeKitRecord,
  saveWelcomeKitDoc,
  setWelcomeKitShare,
  WelcomeKitConflictError,
} from "@/lib/welcomeKit";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Full kit record (doc + share state + pdf meta). */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  const record = await getWelcomeKitRecord();
  return ok(record);
}

/**
 * Save the kit document: { doc, baseUpdatedAt? }. Optimistic concurrency —
 * a stale baseUpdatedAt returns 409 with the current record.
 */
export async function PUT(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body || !("doc" in body)) {
      return fail("invalid_request", "doc is required", 400);
    }

    const actor = tokenAuditActor(auth.token);
    const result = await saveWelcomeKitDoc(
      body.doc,
      actor.adminId,
      body.baseUpdatedAt != null ? String(body.baseUpdatedAt) : (body.baseUpdatedAt as null | undefined)
    );

    logAuditEvent({
      ...actor,
      action: "welcome_kit.update",
      targetType: "welcome_kit",
      targetId: "welcome_kit",
    }).catch(() => {});

    return ok({ doc: result.doc, updatedAt: result.updatedAt });
  } catch (err) {
    if (err instanceof WelcomeKitConflictError) {
      const current = await getWelcomeKitRecord();
      return fail("conflict", "Welcome Kit was modified by someone else", 409, {
        data: current,
      });
    }
    console.error("PUT /api/v1/client/welcome-kit error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Toggle the public /welcome-kit share page: { shareEnabled: boolean }. */
export async function PATCH(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (typeof body?.shareEnabled !== "boolean") {
      return fail("invalid_request", "shareEnabled (boolean) is required", 400);
    }

    const actor = tokenAuditActor(auth.token);
    await setWelcomeKitShare(body.shareEnabled, actor.adminId);

    logAuditEvent({
      ...actor,
      action: "welcome_kit.share_toggle",
      targetType: "welcome_kit",
      targetId: "welcome_kit",
      details: JSON.stringify({ shareEnabled: body.shareEnabled }),
    }).catch(() => {});

    return ok({ shareEnabled: body.shareEnabled });
  } catch (err) {
    console.error("PATCH /api/v1/client/welcome-kit error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
