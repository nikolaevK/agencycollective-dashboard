export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDealContractByDealId, updateDealContract, type DealContractStatus } from "@/lib/dealContracts";
import { findAdditionalContract, updateAdditionalContract } from "@/lib/dealAdditionalContracts";
import { updateDeal, findDeal } from "@/lib/deals";
import { docusealFetch } from "@/lib/docuseal/client";
import { DocuSealSubmissionSchema } from "@/lib/docuseal/schemas";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Manually re-sync a contract's status from DocuSeal.
 * Fetches GET /submissions/:id and updates local state.
 *
 * Targets the PRIMARY contract (by `dealId`) OR a specific ADDITIONAL contract /
 * scope (by `additionalContractId`). Needed because webhook events are one-time
 * pushes: a contract signed while its events were being dropped (e.g. additional
 * contracts before the two-table webhook fix) stays stale until actively re-pulled.
 */
export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { dealId, additionalContractId } = (await req.json()) as {
      dealId?: string;
      additionalContractId?: string;
    };

    // Resolve the target row: an additional contract (by id) takes precedence,
    // otherwise the deal's primary contract.
    let contract: { id: string; dealId: string; status: DealContractStatus; signedAt: string | null; docusealSubmissionId: number | null } | null;
    let isPrimary: boolean;
    if (additionalContractId) {
      if (!UUID_RE.test(additionalContractId)) {
        return NextResponse.json({ error: "Invalid additionalContractId" }, { status: 400 });
      }
      contract = await findAdditionalContract(additionalContractId);
      isPrimary = false;
    } else if (dealId) {
      if (!UUID_RE.test(dealId)) {
        return NextResponse.json({ error: "Invalid dealId" }, { status: 400 });
      }
      contract = await findDealContractByDealId(dealId);
      isPrimary = true;
    } else {
      return NextResponse.json({ error: "dealId or additionalContractId required" }, { status: 400 });
    }

    if (!contract) {
      return NextResponse.json({ error: "No contract found" }, { status: 404 });
    }

    if (!contract.docusealSubmissionId) {
      return NextResponse.json({ error: "No DocuSeal submission linked" }, { status: 400 });
    }

    // Fetch submission from DocuSeal
    let submission;
    try {
      submission = await docusealFetch(
        `/submissions/${contract.docusealSubmissionId}`,
        DocuSealSubmissionSchema,
        { retries: 1 }
      );
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : "Unknown error";
      // If submission was deleted from DocuSeal, return a clear message
      if (msg.includes("404") || msg.includes("not found")) {
        return NextResponse.json({
          data: { previousStatus: contract.status, currentStatus: contract.status, changed: false, note: "Submission no longer exists in DocuSeal" },
        });
      }
      throw fetchErr;
    }

    // Derive status from submission + submitters
    const submitters = submission.submitters ?? [];
    const firstSubmitter = submitters[0];

    let newStatus: DealContractStatus = contract.status;
    let signedAt = contract.signedAt;
    let documentUrls: string[] | null = null;

    if (submission.status === "completed" || firstSubmitter?.status === "completed") {
      newStatus = "signed";
      signedAt = firstSubmitter?.completed_at || submission.completed_at || new Date().toISOString();

      // Extract document URLs from submitter
      if (firstSubmitter?.documents && firstSubmitter.documents.length > 0) {
        documentUrls = firstSubmitter.documents
          .map((d) => d.url)
          .filter((u): u is string => !!u);
      }
    } else if (submission.status === "expired") {
      newStatus = "expired";
    } else if (firstSubmitter?.status === "declined") {
      newStatus = "declined";
    } else if (firstSubmitter?.status === "opened") {
      newStatus = "viewed";
    } else if (firstSubmitter?.status === "sent") {
      newStatus = "sent";
    } else if (firstSubmitter?.status === "pending") {
      newStatus = "pending";
    } else {
      console.warn(`[deal-contracts sync] Unmapped DocuSeal status: submission=${submission.status}, submitter=${firstSubmitter?.status}`);
    }

    // Apply changes to the correct table.
    const changes: { status?: DealContractStatus; signedAt?: string | null; documentUrls?: string[] | null } = {};
    if (newStatus !== contract.status) changes.status = newStatus;
    if (signedAt !== contract.signedAt) changes.signedAt = signedAt;
    if (documentUrls && documentUrls.length > 0) changes.documentUrls = documentUrls;

    if (Object.keys(changes).length > 0) {
      if (isPrimary) {
        await updateDealContract(contract.id, changes);
      } else {
        await updateAdditionalContract(contract.id, changes);
      }
    }

    // Deal-lifecycle transition stays tied to the PRIMARY contract only — an
    // additional/scope outcome must not move the deal's status (mirrors the webhook).
    if (isPrimary && newStatus !== contract.status && (newStatus === "signed" || newStatus === "declined" || newStatus === "expired")) {
      const deal = await findDeal(contract.dealId);
      if (deal?.status === "pending_signature") {
        await updateDeal(contract.dealId, { status: "closed" });
      }
    }

    return NextResponse.json({
      data: {
        previousStatus: contract.status,
        currentStatus: newStatus,
        changed: newStatus !== contract.status,
      },
    });
  } catch (err) {
    console.error("[deal-contracts sync]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
