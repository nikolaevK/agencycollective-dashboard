export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import {
  findAdditionalContractsByDealId,
  findAdditionalContract,
  insertAdditionalContract,
  updateAdditionalContract,
  deleteAdditionalContract,
  countAdditionalContracts,
} from "@/lib/dealAdditionalContracts";
import { findContractTemplate } from "@/lib/contractTemplates";
import { docusealArchiveSubmission, DocuSealApiError } from "@/lib/docuseal/client";
import crypto from "crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId || !UUID_RE.test(dealId)) {
    return NextResponse.json({ error: "Invalid dealId" }, { status: 400 });
  }

  const contracts = await findAdditionalContractsByDealId(dealId);
  return NextResponse.json({ data: contracts });
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { dealId, contractTemplateId } = body as { dealId?: string; contractTemplateId?: string | null };
    if (!dealId || !UUID_RE.test(dealId)) {
      return NextResponse.json({ error: "Invalid dealId" }, { status: 400 });
    }

    if (contractTemplateId) {
      const template = await findContractTemplate(contractTemplateId);
      if (!template) {
        return NextResponse.json({ error: "Contract template not found" }, { status: 404 });
      }
    }

    const existing = await countAdditionalContracts(dealId);
    if (existing >= 10) {
      return NextResponse.json({ error: "Maximum of 10 additional contracts per deal" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await insertAdditionalContract({
      id,
      dealId,
      contractTemplateId: contractTemplateId ?? null,
      sortOrder: existing,
      createdBy: session.adminId,
    });

    const record = await findAdditionalContract(id);
    return NextResponse.json({ data: record });
  } catch (err) {
    console.error("[deal-contracts/additional POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { id, contractTemplateId, docusealTemplateOverrideId } = body as {
      id?: string;
      contractTemplateId?: string | null;
      docusealTemplateOverrideId?: number | null;
    };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const contract = await findAdditionalContract(id);
    if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

    const isOverrideUpdate = docusealTemplateOverrideId !== undefined;
    const isTemplateUpdate = contractTemplateId !== undefined;

    if (isOverrideUpdate) {
      if (contract.status === "signed") {
        return NextResponse.json({ error: "Cannot edit a signed contract" }, { status: 400 });
      }
      if (docusealTemplateOverrideId !== null && !Number.isFinite(docusealTemplateOverrideId)) {
        return NextResponse.json({ error: "Invalid override id" }, { status: 400 });
      }
      await updateAdditionalContract(id, { docusealTemplateOverrideId });
      return NextResponse.json({ success: true });
    }

    if (isTemplateUpdate) {
      if (contract.status !== "pending") {
        return NextResponse.json({ error: "Cannot change template after contract is sent" }, { status: 400 });
      }
      if (contractTemplateId) {
        const template = await findContractTemplate(contractTemplateId);
        if (!template) {
          return NextResponse.json({ error: "Contract template not found" }, { status: 404 });
        }
      }
      // Switching templates clears any prior per-contract override
      await updateAdditionalContract(id, {
        contractTemplateId: contractTemplateId ?? null,
        docusealTemplateOverrideId: null,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  } catch (err) {
    console.error("[deal-contracts/additional PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const contract = await findAdditionalContract(id);
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  // If a Docuseal submission was created, archive it first so the signing
  // link is invalidated. If that fails, keep the local row so admin can retry.
  if (contract.docusealSubmissionId) {
    try {
      await docusealArchiveSubmission(contract.docusealSubmissionId);
    } catch (err) {
      const isNotFound = err instanceof DocuSealApiError && err.statusCode === 404;
      if (!isNotFound) {
        const message = err instanceof Error ? err.message : "Docuseal archive failed";
        console.error("[deal-contracts/additional DELETE] archive failed:", message);
        return NextResponse.json({ error: `Failed to archive Docuseal submission: ${message}` }, { status: 502 });
      }
    }
  }

  const deleted = await deleteAdditionalContract(id);
  if (!deleted) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
