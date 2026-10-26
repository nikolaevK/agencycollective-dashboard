export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Builds the prepared-paperwork snapshot (one DocuSeal GET per contract).
export const maxDuration = 60;

import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import { gateDeal, prepErrorResponse } from "@/lib/api/dealPrepApi";
import { submitDealPrep, presentDealPrep, type DealPrepFlag } from "@/lib/dealPrep";
import { logAuditEvent } from "@/lib/auditLog";

export function OPTIONS() {
  return corsPreflight();
}

const SEVERITIES = new Set(["info", "warning", "blocker"]);

/**
 * The agent reports back: { status: "ready" | "needs_input", summary,
 * flags?: [{ severity, message }], inputHash }. Records what it prepared and
 * lights the Deal queue badge. 409 when the deal changed mid-run (inputHash)
 * or its invoice was already sent.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await authenticateApiRequest(request, "closer:write");
  if (!auth.ok) return auth.response;

  try {
    const gate = await gateDeal(auth.token, params.id);
    if (gate.error) return gate.error;

    const body = await readJsonBody(request);
    if (!body) return fail("invalid_request", "Invalid JSON body", 400);
    const status = body.status;
    if (status !== "ready" && status !== "needs_input") {
      return fail("invalid_request", 'status must be "ready" or "needs_input"', 400);
    }
    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    if (!summary || summary.length > 10_000) {
      return fail("invalid_request", "summary is required (max 10000 characters)", 400);
    }
    const flagsRaw = body.flags ?? [];
    if (!Array.isArray(flagsRaw) || flagsRaw.length > 30) {
      return fail("invalid_request", "flags must be an array (max 30)", 400);
    }
    const flags: DealPrepFlag[] = [];
    for (let i = 0; i < flagsRaw.length; i++) {
      const f = flagsRaw[i] as Record<string, unknown> | null;
      const message = typeof f?.message === "string" ? f.message.trim() : "";
      if (!f || !SEVERITIES.has(String(f.severity)) || !message || message.length > 1000) {
        return fail("invalid_request", `flags[${i}] needs severity (info|warning|blocker) and a message (max 1000)`, 400);
      }
      flags.push({ severity: f.severity as DealPrepFlag["severity"], message });
    }
    if (typeof body.inputHash !== "string" || !body.inputHash) {
      return fail("invalid_request", "inputHash is required — echo prep.inputHash from getDealPrepContext", 400);
    }
    const inputHash = body.inputHash;

    const prep = await submitDealPrep(params.id, { status, summary, flags, inputHash }, `api:${auth.token.name}`);

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "deal_prep.submit",
      targetType: "deal",
      targetId: params.id,
      details: JSON.stringify({ status, flags: flags.length }),
    }).catch(() => {});

    return ok(presentDealPrep(prep));
  } catch (err) {
    return prepErrorResponse(err, "POST /api/v1/closer/deals/[id]/prep");
  }
}
