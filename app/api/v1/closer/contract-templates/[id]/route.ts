export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  findContractTemplate,
  updateContractTemplate,
  deleteContractTemplate,
} from "@/lib/contractTemplates";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const existing = await findContractTemplate(params.id);
    if (!existing) return fail("not_found", "Template not found", 404);

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const changes: Parameters<typeof updateContractTemplate>[1] = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) return fail("invalid_request", "name cannot be empty", 400);
      changes.name = name;
    }
    if (body.docusealTemplateId !== undefined) {
      const tid = Number(body.docusealTemplateId);
      if (!Number.isInteger(tid) || tid <= 0) {
        return fail("invalid_request", "docusealTemplateId must be a positive integer", 400);
      }
      changes.docusealTemplateId = tid;
    }
    if (body.serviceKeys !== undefined) {
      changes.serviceKeys = Array.isArray(body.serviceKeys)
        ? body.serviceKeys.filter((k): k is string => typeof k === "string")
        : null;
    }
    if (body.isDefault !== undefined) changes.isDefault = Boolean(body.isDefault);

    if (Object.keys(changes).length === 0) {
      return fail("invalid_request", "No changes provided", 400);
    }
    await updateContractTemplate(params.id, changes);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "contract_template.update",
      targetType: "contract_template",
      targetId: params.id,
      details: JSON.stringify(changes),
    }).catch(() => {});

    const updated = await findContractTemplate(params.id);
    return ok(updated);
  } catch (err) {
    console.error("PATCH /api/v1/closer/contract-templates/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:delete");
  if (!auth.ok) return auth.response;

  try {
    const existing = await findContractTemplate(params.id);
    if (!existing) return fail("not_found", "Template not found", 404);

    await deleteContractTemplate(params.id);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "contract_template.delete",
      targetType: "contract_template",
      targetId: params.id,
      details: JSON.stringify({ name: existing.name }),
    }).catch(() => {});

    return ok({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/v1/closer/contract-templates/[id] error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
