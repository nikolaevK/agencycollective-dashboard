export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "crypto";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  readContractTemplates,
  insertContractTemplate,
  findContractTemplate,
} from "@/lib/contractTemplates";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

/** Local template→DocuSeal-id mappings. Template upload itself is excluded. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:read");
  if (!auth.ok) return auth.response;

  const templates = await readContractTemplates();
  return ok(templates);
}

/** Create a mapping: { name, docusealTemplateId (int), serviceKeys?, isDefault? }. */
export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);

    const name = String(body.name ?? "").trim();
    const docusealTemplateId = Number(body.docusealTemplateId);
    if (!name || !Number.isInteger(docusealTemplateId) || docusealTemplateId <= 0) {
      return fail(
        "invalid_request",
        "name and a positive integer docusealTemplateId are required",
        400
      );
    }
    const serviceKeys = Array.isArray(body.serviceKeys)
      ? body.serviceKeys.filter((k): k is string => typeof k === "string")
      : null;

    const id = crypto.randomUUID();
    await insertContractTemplate({
      id,
      name,
      docusealTemplateId,
      serviceKeys,
      isDefault: Boolean(body.isDefault),
    });

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "contract_template.create",
      targetType: "contract_template",
      targetId: id,
      details: JSON.stringify({ name, docusealTemplateId }),
    }).catch(() => {});

    const record = await findContractTemplate(id);
    return ok(record, undefined, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/closer/contract-templates error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
