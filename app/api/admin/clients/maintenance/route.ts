export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {

  getMaintenanceConfig,
  setMaintenanceConfig,
  MAINTENANCE_MESSAGE_MAX,
} from "@/lib/maintenance";
import { requireAdminRecord as requireAdminSession } from "@/lib/api/requireAdmin";

// Middleware gates /api/admin/clients/* on the `users` permission; the handler
// re-checks the admin session as defense in depth.

export async function GET() {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ data: await getMaintenanceConfig() });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { enabled?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "`enabled` must be a boolean" }, { status: 400 });
  }
  if (body.message !== undefined && typeof body.message !== "string") {
    return NextResponse.json({ error: "`message` must be a string" }, { status: 400 });
  }
  if (typeof body.message === "string" && body.message.length > MAINTENANCE_MESSAGE_MAX) {
    return NextResponse.json(
      { error: `\`message\` must be ${MAINTENANCE_MESSAGE_MAX} characters or fewer` },
      { status: 400 }
    );
  }

  const cfg = await setMaintenanceConfig({
    enabled: body.enabled,
    message: body.message as string | undefined,
  });
  return NextResponse.json({ data: cfg });
}
