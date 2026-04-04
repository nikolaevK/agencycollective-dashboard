export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { docusealFetch } from "@/lib/docuseal/client";
import { DocuSealTemplateSchema } from "@/lib/docuseal/schemas";

/**
 * Proxy to DocuSeal GET /templates/:id.
 * Returns full template details including fields.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const templateId = Number(params.id);
    if (!Number.isFinite(templateId) || templateId <= 0) {
      return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
    }

    const template = await docusealFetch(
      `/templates/${templateId}`,
      DocuSealTemplateSchema
    );
    return NextResponse.json({ data: template });
  } catch (err) {
    console.error("[docuseal-templates GET/:id]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 });
  }
}
