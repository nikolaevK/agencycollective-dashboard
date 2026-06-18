export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { listEmailAccounts } from "@/lib/invoice/emailService";

/**
 * Configured "send from" accounts for the Invoice Generator's email dialog.
 * Returns only id/label/email — SMTP credentials never leave the server.
 */
export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ data: listEmailAccounts() });
}
