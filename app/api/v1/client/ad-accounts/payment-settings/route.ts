export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { tokenIsExternal } from "@/lib/apiScopes";
import { authenticateApiRequest, tokenAuditActor } from "@/lib/api/requireApiToken";
import { ok, fail, corsPreflight, readJsonBody } from "@/lib/api/respond";
import {
  getAdAccountPaymentTemplates,
  setAdAccountPaymentTemplate,
  resetAdAccountPaymentTemplate,
} from "@/lib/agencyConfig";
import type { PaymentInfo, PaymentType } from "@/types/invoice";
import { logAuditEvent } from "@/lib/auditLog";

// Every editable PaymentInfo field. `paymentType` is set server-side.
const STRING_FIELDS = [
  "bankName",
  "accountName",
  "accountNumber",
  "routingNumber",
  "bankAddress",
  "beneficiaryName",
  "beneficiaryAddress",
  "zelleContact",
  "swiftBic",
  "alternateRoutingNumber",
  "memo",
] as const;

function sanitizePaymentInfo(raw: unknown, type: PaymentType): PaymentInfo {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = { paymentType: type };
  for (const f of STRING_FIELDS) {
    const v = src[f];
    out[f] = typeof v === "string" ? v.slice(0, 1000) : "";
  }
  return out as unknown as PaymentInfo;
}

export function OPTIONS() {
  return corsPreflight();
}

/** Effective ad-account payment blocks (custom or default) for both types. */
export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "client:read");
  if (!auth.ok) return auth.response;

  // Internal-only surface — denied for workspace-restricted tokens whose
  // books exclude main (mirrors the admin-side external 403).
  if (tokenIsExternal(auth.token)) {
    return fail("resource_forbidden", "This endpoint is internal-only for workspace-restricted tokens", 403);
  }
  const data = await getAdAccountPaymentTemplates();
  return ok(data);
}

/** Save a custom template for one or both types: { local?, international? }. */
export async function PUT(request: Request) {
  const auth = await authenticateApiRequest(request, "client:write");
  if (!auth.ok) return auth.response;

  // Internal-only surface — denied for workspace-restricted tokens whose
  // books exclude main (mirrors the admin-side external 403).
  if (tokenIsExternal(auth.token)) {
    return fail("resource_forbidden", "This endpoint is internal-only for workspace-restricted tokens", 403);
  }

  try {
    const body = await readJsonBody(request);
    if (!body || (body.local === undefined && body.international === undefined)) {
      return fail("invalid_request", "Provide at least one of `local` or `international`", 400);
    }

    if (body.local !== undefined) {
      await setAdAccountPaymentTemplate("local", sanitizePaymentInfo(body.local, "local"));
    }
    if (body.international !== undefined) {
      await setAdAccountPaymentTemplate(
        "international",
        sanitizePaymentInfo(body.international, "international")
      );
    }

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "ad_account.payment_settings_update",
      targetType: "ad_account",
      targetId: "payment-settings",
      details: JSON.stringify({
        types: [
          ...(body.local !== undefined ? ["local"] : []),
          ...(body.international !== undefined ? ["international"] : []),
        ],
      }),
    }).catch(() => {});

    const data = await getAdAccountPaymentTemplates();
    return ok(data);
  } catch (err) {
    console.error("PUT /api/v1/client/ad-accounts/payment-settings error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}

/** Reset to defaults. `?type=local|international` resets one, else both. */
export async function DELETE(request: Request) {
  const auth = await authenticateApiRequest(request, "client:delete");
  if (!auth.ok) return auth.response;

  // Internal-only surface — denied for workspace-restricted tokens whose
  // books exclude main (mirrors the admin-side external 403).
  if (tokenIsExternal(auth.token)) {
    return fail("resource_forbidden", "This endpoint is internal-only for workspace-restricted tokens", 403);
  }

  try {
    const type = new URL(request.url).searchParams.get("type");
    if (type !== null && type !== "local" && type !== "international") {
      return fail("invalid_request", "type must be 'local' or 'international'", 400);
    }
    if (type === "local" || type === "international") {
      await resetAdAccountPaymentTemplate(type);
    } else {
      await resetAdAccountPaymentTemplate("local");
      await resetAdAccountPaymentTemplate("international");
    }

    logAuditEvent({
      ...tokenAuditActor(auth.token),
      action: "ad_account.payment_settings_reset",
      targetType: "ad_account",
      targetId: "payment-settings",
      details: JSON.stringify({ type: type ?? "both" }),
    }).catch(() => {});

    const data = await getAdAccountPaymentTemplates();
    return ok(data);
  } catch (err) {
    console.error("DELETE /api/v1/client/ad-accounts/payment-settings error:", err);
    return fail("internal_error", "Internal server error", 500);
  }
}
