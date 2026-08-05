export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  getAdAccountPaymentTemplates,
  setAdAccountPaymentTemplate,
  resetAdAccountPaymentTemplate,
} from "@/lib/agencyConfig";
import type { PaymentInfo, PaymentType } from "@/types/invoice";
import { requireInternalActor } from "@/lib/api/requireAdmin";

// Every editable PaymentInfo field. `paymentType` is set server-side, not trusted.
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

/** Coerce arbitrary input into a clean PaymentInfo (strings only, capped). */
function sanitizePaymentInfo(raw: unknown, type: PaymentType): PaymentInfo {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = { paymentType: type };
  for (const f of STRING_FIELDS) {
    const v = src[f];
    out[f] = typeof v === "string" ? v.slice(0, 1000) : "";
  }
  return out as unknown as PaymentInfo;
}

/** Load the effective ad-account payment blocks (custom or default) for both types. */
export async function GET() {
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;
  const data = await getAdAccountPaymentTemplates();
  return NextResponse.json({ data });
}

/** Save a custom template for one or both types. Body: { local?, international? }. */
export async function PUT(req: NextRequest) {
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;

  let body: { local?: unknown; international?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.local === undefined && body.international === undefined) {
    return NextResponse.json(
      { error: "Provide at least one of `local` or `international`" },
      { status: 400 }
    );
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

  const data = await getAdAccountPaymentTemplates();
  return NextResponse.json({ data });
}

/** Reset to the shared default. `?type=local|international` resets one, else both. */
export async function DELETE(req: NextRequest) {
  const guard = await requireInternalActor();
  if (guard.response) return guard.response;

  const type = new URL(req.url).searchParams.get("type");
  // Reset one type when explicitly named; only an ABSENT param resets both. A
  // present-but-invalid value is rejected so a typo can't silently wipe both.
  if (type !== null && type !== "local" && type !== "international") {
    return NextResponse.json(
      { error: "type must be 'local' or 'international'" },
      { status: 400 }
    );
  }
  if (type === "local" || type === "international") {
    await resetAdAccountPaymentTemplate(type);
  } else {
    await resetAdAccountPaymentTemplate("local");
    await resetAdAccountPaymentTemplate("international");
  }

  const data = await getAdAccountPaymentTemplates();
  return NextResponse.json({ data });
}
