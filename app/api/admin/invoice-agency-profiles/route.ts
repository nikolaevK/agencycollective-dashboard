export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import {
  readAgencyProfiles,
  insertAgencyProfile,
  updateAgencyProfile,
  deleteAgencyProfile,
  type AgencyProfileInput,
} from "@/lib/invoiceAgencyProfiles";
import type { InvoiceSender, PaymentInfo } from "@/types/invoice";
import { emptyPaymentInfo } from "@/lib/invoice/paymentUtils";

// Logo is a base64 data URL stored inline (Vercel FS is read-only). Cap matches
// the client's 500 KB raw limit (~683 KB once base64-encoded) plus headroom.
const MAX_LOGO_CHARS = 700_000;

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function coerceSender(v: unknown): InvoiceSender {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return {
    name: str(o.name),
    address: str(o.address),
    city: str(o.city),
    zipCode: str(o.zipCode),
    country: str(o.country),
    email: str(o.email),
    phone: str(o.phone),
    customInputs: [],
  };
}

function coercePayment(v: unknown, type: "local" | "international"): PaymentInfo {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return {
    ...emptyPaymentInfo(type),
    bankName: str(o.bankName),
    accountName: str(o.accountName),
    accountNumber: str(o.accountNumber),
    routingNumber: str(o.routingNumber),
    bankAddress: str(o.bankAddress),
    beneficiaryName: str(o.beneficiaryName),
    beneficiaryAddress: str(o.beneficiaryAddress),
    zelleContact: str(o.zelleContact),
    swiftBic: str(o.swiftBic),
    alternateRoutingNumber: str(o.alternateRoutingNumber),
    memo: str(o.memo),
    paymentType: type,
  };
}

/** Validate + normalize a request body into a profile input, or return an error. */
function coerceInput(body: Record<string, unknown>): { input: AgencyProfileInput } | { error: string; status: number } {
  const name = str(body.name).trim();
  if (!name) return { error: "Name is required", status: 400 };
  if (name.length > 100) return { error: "Name too long", status: 400 };

  const logo = str(body.logo);
  if (logo.length > MAX_LOGO_CHARS) return { error: "Logo too large (max 500 KB)", status: 413 };

  const themeColor = str(body.themeColor) || "#2563eb";

  return {
    input: {
      name,
      logo,
      themeColor,
      sender: coerceSender(body.sender),
      paymentLocal: coercePayment(body.paymentLocal, "local"),
      paymentInternational: coercePayment(body.paymentInternational, "international"),
    },
  };
}

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profiles = await readAgencyProfiles();
  return NextResponse.json({ data: profiles });
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const result = coerceInput(body);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

    const id = crypto.randomUUID();
    await insertAgencyProfile(id, result.input);
    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (err) {
    console.error("[invoice-agency-profiles POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const id = str(body.id);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const result = coerceInput(body);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

    const updated = await updateAgencyProfile(id, result.input);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[invoice-agency-profiles PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const deleted = await deleteAgencyProfile(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
