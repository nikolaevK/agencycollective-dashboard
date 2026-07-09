export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { allowedResourceIds, tokenHasResource } from "@/lib/apiScopes";
import {
  getAppointmentsIndex,
  upsertAppointment,
  isPreCallStatus,
  isPostCallStatus,
  isSetterTier,
  type UpsertAppointmentInput,
} from "@/lib/appointments";
import { findCloser } from "@/lib/closers";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Appointment index keyed by google event id, resource-scoped by setter. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  try {
    const index = await getAppointmentsIndex();
    const allowed = allowedResourceIds(auth.token, "closer");
    if (!allowed) return ok(index);

    const filtered: typeof index = {};
    for (const [eventId, entry] of Object.entries(index)) {
      if (allowed.includes((entry as { setterId?: string }).setterId ?? "")) {
        filtered[eventId] = entry;
      }
    }
    return ok(filtered);
  } catch (err) {
    console.error("GET /api/v1/closer/appointments error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/**
 * Create/update a setter claim (upsert on setterId + googleEventId).
 * Body: { setterId, googleEventId, clientName?, clientEmail?, scheduledAt?,
 * preCallStatus?, postCallStatus?, notes?, setterTier? }.
 * GHL attribution/resync side-effects are excluded from v1.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const setterId = String(body.setterId ?? "").trim();
    const googleEventId = String(body.googleEventId ?? "").trim();
    if (!setterId || !googleEventId) {
      return fail("invalid_request", "setterId and googleEventId are required", 400);
    }
    if (!(await findCloser(setterId))) {
      return fail("invalid_request", "Unknown setterId", 400);
    }
    if (!tokenHasResource(auth.token, "closer", setterId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }

    const input: UpsertAppointmentInput = { setterId, googleEventId };
    if (body.clientName !== undefined) input.clientName = body.clientName ? String(body.clientName).trim() : null;
    if (body.clientEmail !== undefined) input.clientEmail = body.clientEmail ? String(body.clientEmail).trim() : null;
    if (body.scheduledAt !== undefined) input.scheduledAt = body.scheduledAt ? String(body.scheduledAt).trim() : null;
    if (body.notes !== undefined) input.notes = body.notes ? String(body.notes).trim() : null;
    if (body.preCallStatus !== undefined) {
      if (!isPreCallStatus(body.preCallStatus)) {
        return fail("invalid_request", "Invalid preCallStatus", 400);
      }
      input.preCallStatus = body.preCallStatus;
    }
    if (body.postCallStatus !== undefined) {
      if (!isPostCallStatus(body.postCallStatus)) {
        return fail("invalid_request", "Invalid postCallStatus", 400);
      }
      input.postCallStatus = body.postCallStatus;
    }
    if (body.setterTier !== undefined) {
      if (body.setterTier === null || body.setterTier === "") {
        input.setterTier = null;
      } else if (isSetterTier(body.setterTier)) {
        input.setterTier = body.setterTier;
      } else {
        return fail("invalid_request", "Invalid setter tier", 400);
      }
    }

    const record = await upsertAppointment(input);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "appointment.upsert",
      targetType: "appointment",
      targetId: record.id,
      details: JSON.stringify({ setterId, googleEventId }),
    }).catch(() => {});

    return ok(record, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/closer/appointments error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
