export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getWelcomeKitPdf } from "@/lib/welcomeKit";

/**
 * Public download of the uploaded Welcome Kit PDF. No auth: the portal (logged-in
 * clients) and the public share page both link here, and the content is a generic
 * client resource — same exposure as a static /public asset. NOT in the
 * middleware matcher, so it's reachable by anyone with the link. 404 when no PDF
 * has been uploaded.
 */
export async function GET() {
  const pdf = await getWelcomeKitPdf();
  if (!pdf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // RFC 5987 filename encoding for non-ASCII names.
  const asciiName = pdf.name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_");
  const encodedName = encodeURIComponent(pdf.name);

  return new NextResponse(new Uint8Array(pdf.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(pdf.data.length),
      // No-store so a replaced PDF is never served stale from the stable URL.
      "Cache-Control": "no-store",
    },
  });
}
