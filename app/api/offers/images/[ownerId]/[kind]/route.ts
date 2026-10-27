export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/db";
import { getOfferImage } from "@/lib/portalOffers";

/**
 * Public serve route for the portal "More from Agency Collective" images —
 * service logos/covers and the page header image. Ungated like
 * /api/clients/[id]/logo: marketing images aren't sensitive. NOT in the
 * middleware matcher. Only the CURRENT version answers (`?v=` must match), so
 * every URL is immutable and CDN-cacheable, and a made-up `?v=` reads no blob.
 */
export async function GET(request: Request, { params }: { params: { ownerId: string; kind: string } }) {
  const v = Number(new URL(request.url).searchParams.get("v"));
  if (!Number.isSafeInteger(v) || v <= 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ensureMigrated();
  const image = await getOfferImage(params.ownerId, params.kind, v);
  if (!image) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}
