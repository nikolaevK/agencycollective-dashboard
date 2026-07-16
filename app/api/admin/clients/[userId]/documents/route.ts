export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { findUser } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { readDocumentsByBrand } from "@/lib/payoutDocuments";
import { requireAdminRecord as requireAdminSession } from "@/lib/api/requireAdmin";

interface RouteContext {
  params: { userId: string };
}

/**
 * Invoices + project scopes for a client, pulled from the Payout DB's document
 * store by brand. Uses the explicit payout_brand link when set, else the
 * display name. Metadata only — downloads go through the existing
 * /api/admin/payouts/documents/[id] endpoint.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();

  const user = await findUser(params.userId);
  if (!user)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const brand = user.payoutBrand ?? user.displayName;
  const docs = await readDocumentsByBrand(brand);

  return NextResponse.json({
    data: {
      brand,
      invoices: docs.filter((d) => d.docType === "invoice"),
      scopes: docs.filter((d) => d.docType === "project_scope"),
    },
  });
}
