export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDealContractByDealId } from "@/lib/dealContracts";
import { findDeal } from "@/lib/deals";
import { findTemplateForServices, findContractTemplate } from "@/lib/contractTemplates";
import { generateContractFromDeal } from "@/lib/dealContractGenerator";
import { insertDealContract, updateDealContract } from "@/lib/dealContracts";
import { updateDeal } from "@/lib/deals";
import { parseServiceCategory } from "@/lib/serviceCategory";
import crypto from "crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dealId = req.nextUrl.searchParams.get("dealId");
  if (!dealId || !UUID_RE.test(dealId)) {
    return NextResponse.json({ error: "Invalid dealId" }, { status: 400 });
  }

  const contract = await findDealContractByDealId(dealId);
  return NextResponse.json({ data: contract });
}

/** Update contract template selection or per-contract Docuseal override. */
export async function PATCH(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { dealId, contractTemplateId, docusealTemplateOverrideId } = body as {
      dealId?: string;
      contractTemplateId?: string | null;
      docusealTemplateOverrideId?: number | null;
    };
    if (!dealId || !UUID_RE.test(dealId)) {
      return NextResponse.json({ error: "Invalid dealId" }, { status: 400 });
    }

    const isOverrideUpdate = docusealTemplateOverrideId !== undefined;
    const isTemplateUpdate = contractTemplateId !== undefined;

    const contract = await findDealContractByDealId(dealId);

    if (isOverrideUpdate) {
      // Per-contract Docuseal clone pointer — allowed even after send (for resend edits),
      // but not once the contract is signed.
      if (!contract) {
        return NextResponse.json({ error: "Contract not found" }, { status: 404 });
      }
      if (contract.status === "signed") {
        return NextResponse.json({ error: "Cannot edit a signed contract" }, { status: 400 });
      }
      if (docusealTemplateOverrideId !== null && !Number.isFinite(docusealTemplateOverrideId)) {
        return NextResponse.json({ error: "Invalid override id" }, { status: 400 });
      }
      await updateDealContract(contract.id, { docusealTemplateOverrideId });
      return NextResponse.json({ success: true });
    }

    if (isTemplateUpdate) {
      if (!contract) {
        await insertDealContract({
          id: crypto.randomUUID(),
          dealId,
          contractTemplateId: contractTemplateId || null,
          status: "pending",
          createdBy: session.adminId,
        });
      } else if (contract.status === "pending") {
        // Switching templates clears any prior per-contract override
        await updateDealContract(contract.id, {
          contractTemplateId: contractTemplateId || null,
          docusealTemplateOverrideId: null,
        });
      } else {
        return NextResponse.json({ error: "Cannot change template after contract is sent" }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  } catch (err) {
    console.error("[deal-contracts PATCH]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Manually send/resend a contract for a deal. */
export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { dealId, email } = body;
    if (!dealId || !UUID_RE.test(dealId)) {
      return NextResponse.json({ error: "Invalid dealId" }, { status: 400 });
    }

    const deal = await findDeal(dealId);
    if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    const clientEmail = email || deal.clientEmail;
    if (!clientEmail) {
      return NextResponse.json({ error: "Client email is required to send a contract" }, { status: 400 });
    }

    // Check if contract already exists for this deal — use its selected template + override if present,
    // else fall back to service-key template matching
    const existing = await findDealContractByDealId(dealId);
    let template = existing?.contractTemplateId
      ? await findContractTemplate(existing.contractTemplateId)
      : null;
    if (!template) {
      const serviceKeys = parseServiceCategory(deal.serviceCategory);
      template = await findTemplateForServices(serviceKeys);
    }
    if (!template) {
      return NextResponse.json({ error: "No matching contract template found" }, { status: 400 });
    }

    const result = await generateContractFromDeal(
      deal,
      clientEmail,
      template,
      existing?.docusealTemplateOverrideId ?? null
    );
    if (existing) {
      await updateDealContract(existing.id, {
        docusealSubmissionId: result.submissionId,
        docusealSubmitterId: result.submitterId,
        signingUrl: result.signingUrl,
        status: "sent",
        clientEmail,
        sentAt: new Date().toISOString(),
      });
    } else {
      await insertDealContract({
        id: crypto.randomUUID(),
        dealId,
        contractTemplateId: template.id,
        docusealSubmissionId: result.submissionId,
        docusealSubmitterId: result.submitterId,
        status: "sent",
        clientEmail,
        signingUrl: result.signingUrl,
        sentAt: new Date().toISOString(),
        createdBy: session.adminId,
      });
    }

    // Update deal status to pending_signature if it was closed
    if (deal.status === "closed") {
      await updateDeal(dealId, { status: "pending_signature" });
    }

    return NextResponse.json({ success: true, data: { signingUrl: result.signingUrl } });
  } catch (err) {
    console.error("[deal-contracts POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to send contract" }, { status: 500 });
  }
}
