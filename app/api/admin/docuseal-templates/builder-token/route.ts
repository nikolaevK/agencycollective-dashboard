export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { SignJWT } from "jose";
import { docusealCloneTemplate } from "@/lib/docuseal/client";

/**
 * Generate a JWT token for the DocuSeal embedded builder.
 *
 * When `templateId` is provided and `clone` is true (default), the template
 * is cloned first so edits don't affect existing submissions. The response
 * includes the cloned template's ID so the client can update its records.
 */
export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { templateId, externalId, name, clone = true } = body as {
      templateId?: number;
      externalId?: string;
      name?: string;
      clone?: boolean;
    };

    // Validate inputs
    if (templateId !== undefined && (!Number.isFinite(templateId) || templateId <= 0)) {
      return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
    }

    const apiKey = process.env.DOCUSEAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "DocuSeal not configured" }, { status: 500 });
    }

    const userEmail = process.env.DOCUSEAL_USER_EMAIL;
    if (!userEmail) {
      return NextResponse.json({ error: "DocuSeal not configured" }, { status: 500 });
    }

    // Clone existing template before editing so pending submissions are unaffected
    let effectiveTemplateId = templateId;
    let clonedTemplateId: number | null = null;
    if (templateId && clone) {
      const cloned = await docusealCloneTemplate(templateId, name ? `${name} (edit)` : undefined);
      effectiveTemplateId = cloned.id;
      clonedTemplateId = cloned.id;
    }

    const secret = new TextEncoder().encode(apiKey);

    const payload: Record<string, unknown> = {
      user_email: userEmail,
      integration_email: `admin-${session.adminId}@agencycollective.ai`,
      external_id: externalId ? String(externalId).slice(0, 100) : `ac-template-${effectiveTemplateId || Date.now()}`,
    };

    if (effectiveTemplateId) {
      payload.template_id = effectiveTemplateId;
    } else {
      payload.document_urls = [];
    }

    if (name) {
      payload.name = String(name).slice(0, 200);
    }

    const token = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);

    return NextResponse.json({
      data: {
        token,
        ...(clonedTemplateId ? { clonedTemplateId } : {}),
      },
    });
  } catch (err) {
    console.error("[builder-token]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Builder unavailable" }, { status: 500 });
  }
}
