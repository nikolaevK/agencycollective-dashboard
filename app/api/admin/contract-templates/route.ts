export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import {
  readContractTemplates,
  insertContractTemplate,
  updateContractTemplate,
  deleteContractTemplate,
} from "@/lib/contractTemplates";

export async function GET() {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await readContractTemplates();
  return NextResponse.json({ data: templates });
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, docusealTemplateId, serviceKeys, isDefault } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!docusealTemplateId || typeof docusealTemplateId !== "number") {
      return NextResponse.json({ error: "DocuSeal template ID is required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await insertContractTemplate({
      id,
      name: name.trim(),
      docusealTemplateId,
      serviceKeys: Array.isArray(serviceKeys) ? serviceKeys : null,
      isDefault: Boolean(isDefault),
    });

    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (err) {
    console.error("[contract-templates POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { id, ...changes } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const sanitized: Record<string, unknown> = {};
    if (changes.name !== undefined) sanitized.name = String(changes.name).trim();
    if (changes.docusealTemplateId !== undefined) sanitized.docusealTemplateId = Number(changes.docusealTemplateId);
    if (changes.serviceKeys !== undefined) sanitized.serviceKeys = Array.isArray(changes.serviceKeys) ? changes.serviceKeys : null;
    if (changes.isDefault !== undefined) sanitized.isDefault = Boolean(changes.isDefault);

    await updateContractTemplate(id, sanitized);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[contract-templates PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const deleted = await deleteContractTemplate(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
