export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/api/openapi";
import { checkOpenApiDrift } from "@/lib/api/driftCheck";
import { corsPreflight, withCors } from "@/lib/api/respond";

export function OPTIONS() {
  return corsPreflight();
}

/** Public machine-readable spec (no auth — it contains no secrets). */
export async function GET() {
  const body: Record<string, unknown> = { ...openApiSpec };
  if (process.env.NODE_ENV === "development") {
    const drift = checkOpenApiDrift();
    if (drift.length > 0) body["x-drift-warnings"] = drift;
  }
  return withCors(NextResponse.json(body));
}
