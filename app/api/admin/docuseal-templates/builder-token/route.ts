export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { SignJWT } from "jose";

/**
 * Generate a JWT token for the DocuSeal embedded builder.
 * The token authorizes the admin to create/edit templates in DocuSeal.
 *
 * JWT payload:
 *  - user_email: DocuSeal admin account email (from env)
 *  - integration_email: current admin's identifier
 *  - external_id: unique key for the template being edited
 *  - template_id: existing template to edit (optional)
 *  - document_urls: empty array to allow file upload (for new templates)
 *  - name: template name (optional)
 *
 * Signed with DOCUSEAL_API_KEY using HS256 (required by DocuSeal's embedded builder spec).
 * The API key is used as the HMAC secret — it cannot be extracted from the JWT.
 */
export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { templateId, externalId, name } = body as {
      templateId?: number;
      externalId?: string;
      name?: string;
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

    const secret = new TextEncoder().encode(apiKey);

    const payload: Record<string, unknown> = {
      user_email: userEmail,
      integration_email: `admin-${session.adminId}@agencycollective.ai`,
      external_id: externalId ? String(externalId).slice(0, 100) : `ac-template-${templateId || Date.now()}`,
    };

    if (templateId) {
      payload.template_id = templateId;
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

    return NextResponse.json({ data: { token } });
  } catch (err) {
    console.error("[builder-token]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Builder unavailable" }, { status: 500 });
  }
}
