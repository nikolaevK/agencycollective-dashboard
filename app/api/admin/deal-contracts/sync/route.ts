export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDealContractByDealId, updateDealContract } from "@/lib/dealContracts";
import { updateDeal, findDeal } from "@/lib/deals";
import { docusealFetch } from "@/lib/docuseal/client";
import { DocuSealSubmissionSchema } from "@/lib/docuseal/schemas";

/**
 * Manually re-sync a contract's status from DocuSeal.
 * Fetches GET /submissions/:id and updates local state.
 */
export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  try {
    const { dealId } = await req.json();
    if (!dealId || !UUID_RE.test(dealId)) {
      return NextResponse.json({ error: "Invalid dealId" }, { status: 400 });
    }

    const contract = await findDealContractByDealId(dealId);
    if (!contract) {
      return NextResponse.json({ error: "No contract found for this deal" }, { status: 404 });
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

    let newStatus = contract.status;
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

    // Update contract
    const changes: Parameters<typeof updateDealContract>[1] = {};
    if (newStatus !== contract.status) changes.status = newStatus;
    if (signedAt !== contract.signedAt) changes.signedAt = signedAt;
    if (documentUrls && documentUrls.length > 0) changes.documentUrls = documentUrls;

    if (Object.keys(changes).length > 0) {
      await updateDealContract(contract.id, changes);
    }

    // Update deal status if contract was signed/declined/expired — only revert pending_signature
    if (newStatus !== contract.status && (newStatus === "signed" || newStatus === "declined" || newStatus === "expired")) {
      const deal = await findDeal(dealId);
      if (deal?.status === "pending_signature") {
        await updateDeal(dealId, { status: "closed" });
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
