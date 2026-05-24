export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getUserLogo } from "@/lib/users";

interface RouteContext {
  params: { userId: string };
}

/**
 * Public brand-logo serve route. The client portal top bar and the admin Client
 * Directory both reference this via <img src>, so it's ungated — a brand logo
 * isn't sensitive and user ids are random. NOT in the middleware matcher, so it
 * runs without a session. 404 when the client has no logo uploaded.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  await ensureMigrated();

  const logo = await getUserLogo(params.userId);
  if (!logo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.contentType,
      "Content-Length": String(logo.data.length),
      // Cacheable; logo_path carries a ?v= cache-buster that changes on replace.
      "Cache-Control": "public, max-age=300",
    },
  });
}
