export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { getActiveCloserSession } from "@/lib/closerGuards";
import { getContactById } from "@/lib/ghl/contacts";
import { GhlApiError, GhlNotConfiguredError, describeError } from "@/lib/ghl/client";
import { parseSubAccountId } from "@/lib/ghl/subAccounts";

export async function GET(
  request: NextRequest,
  { params }: { params: { contactId: string } }
) {
  if (!getAdminSession() && !(await getActiveCloserSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subAccountId = parseSubAccountId(request.nextUrl.searchParams.get("subAccount"));

  try {
    const contact = await getContactById(params.contactId, subAccountId);
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    return NextResponse.json({ data: contact });
  } catch (err) {
    if (err instanceof GhlNotConfiguredError) {
      return NextResponse.json({ error: err.message, code: "GHL_NOT_CONFIGURED" }, { status: 503 });
    }
    if (err instanceof GhlApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[ghl-contact:get]", describeError(err));
    return NextResponse.json({ error: "Failed to load contact" }, { status: 500 });
  }
}
