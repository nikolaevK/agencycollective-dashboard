export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight } from "@/lib/api/respond";
import { tokenHasResource } from "@/lib/apiScopes";
import { findAppointmentById, deleteAppointment } from "@/lib/appointments";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  const record = await findAppointmentById(params.id);
  if (!record) return fail("not_found", "Appointment not found", 404);
  if (!tokenHasResource(auth.token, "closer", record.setterId)) {
    return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
  }
  return ok(record);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:delete");
  if (!auth.ok) return auth.response;

  try {
    const record = await findAppointmentById(params.id);
    if (!record) return fail("not_found", "Appointment not found", 404);
    if (!tokenHasResource(auth.token, "closer", record.setterId)) {
      return fail("resource_forbidden", "This token is not allowed to access this closer", 403);
    }

    await deleteAppointment(record.setterId, record.googleEventId);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "appointment.delete",
      targetType: "appointment",
      targetId: params.id,
      details: JSON.stringify({
        setterId: record.setterId,
        googleEventId: record.googleEventId,
      }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/closer/appointments/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
