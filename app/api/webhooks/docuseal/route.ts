export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { findDealContractBySubmissionId, updateDealContract } from "@/lib/dealContracts";
import { findDeal, updateDeal } from "@/lib/deals";

/** Health check — visit /api/webhooks/docuseal in a browser to verify the route is reachable. */
export async function GET() {
  return NextResponse.json({ status: "ok", webhook: "docuseal" });
}

/**
 * DocuSeal webhook handler.
 * Public endpoint — verified by header secret, NOT by session cookie.
 * Not included in middleware matcher so it bypasses auth automatically.
 *
 * In DocuSeal webhook settings:
 *   1. Set URL to: https://your-domain.com/api/webhooks/docuseal
 *   2. Click "Add Secret" and set key/value matching your env vars:
 *      - Header key = DOCUSEAL_WEBHOOK_SECRET_KEY (default: "x-docuseal-secret")
 *      - Header value = DOCUSEAL_WEBHOOK_SECRET
 *   3. If DOCUSEAL_WEBHOOK_SECRET is not set, all requests are accepted (dev mode).
 */
export async function POST(req: NextRequest) {
  try {
    // Verify webhook authenticity.
    // DocuSeal sends configured secrets as request headers (key-value pairs).
    // We also support ?token= query param as a fallback.
    const webhookSecret = process.env.DOCUSEAL_WEBHOOK_SECRET;
    if (webhookSecret) {
      const secretKey = process.env.DOCUSEAL_WEBHOOK_SECRET_KEY || "x-docuseal-secret";
      const headerValue = req.headers.get(secretKey) || "";
      const urlToken = req.nextUrl.searchParams.get("token") || "";
      const candidate = headerValue || urlToken;

      try {
        const a = Buffer.from(webhookSecret, "utf8");
        const b = Buffer.from(candidate, "utf8");
        if (!candidate || a.length !== b.length || !timingSafeEqual(a, b)) {
          console.warn("[docuseal-webhook] Auth failed — header or token mismatch");
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } catch {
        console.warn("[docuseal-webhook] Auth failed — comparison error");
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const body = await req.json();
    const eventType = body.event_type as string;
    const data = body.data as Record<string, unknown> | undefined;

    if (!eventType || !data) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    console.log(`[docuseal-webhook] ${eventType}`);

    // Consistent submission ID extraction across all event types.
    // DocuSeal sends it in different places depending on the event.
    const submissionObj = data.submission as Record<string, unknown> | undefined;
    const submissionId = Number(submissionObj?.id ?? data.submission_id ?? data.id ?? 0);
    if (!submissionId) {
      console.warn(`[docuseal-webhook] No submission ID in ${eventType} payload`);
      return NextResponse.json({ ok: true });
    }

    const contract = await findDealContractBySubmissionId(submissionId);
    if (!contract) {
      console.warn(`[docuseal-webhook] No contract for submission ${submissionId} (event: ${eventType})`);
      return NextResponse.json({ ok: true });
    }

    if (eventType === "form.completed") {
      // Idempotent — skip if already signed
      if (contract.status === "signed") {
        return NextResponse.json({ ok: true });
      }

      const documents = data.documents as Array<{ url?: string }> | undefined;
      const documentUrls = documents
        ?.map((d) => d.url)
        .filter((u): u is string => !!u) ?? null;

      await updateDealContract(contract.id, {
        status: "signed",
        signedAt: new Date().toISOString(),
        documentUrls: documentUrls && documentUrls.length > 0 ? documentUrls : null,
      });

      const deal = await findDeal(contract.dealId);
      if (deal && deal.status === "pending_signature") {
        await updateDeal(contract.dealId, { status: "closed" });
      }
      console.log(`[docuseal-webhook] Contract ${contract.id} signed`);
    }

    if (eventType === "form.declined") {
      if (contract.status === "signed") {
        return NextResponse.json({ ok: true });
      }

      await updateDealContract(contract.id, { status: "declined" });

      const deal = await findDeal(contract.dealId);
      if (deal?.status === "pending_signature") {
        await updateDeal(contract.dealId, { status: "closed" });
      }
      console.log(`[docuseal-webhook] Contract ${contract.id} declined`);
    }

    if (eventType === "submission.expired") {
      if (contract.status === "signed") {
        return NextResponse.json({ ok: true });
      }

      await updateDealContract(contract.id, { status: "expired" });

      const deal = await findDeal(contract.dealId);
      if (deal?.status === "pending_signature") {
        await updateDeal(contract.dealId, { status: "closed" });
      }
      console.log(`[docuseal-webhook] Contract ${contract.id} expired`);
    }

    if (eventType === "form.started" || eventType === "form.viewed") {
      if (contract.status === "sent" || contract.status === "pending") {
        await updateDealContract(contract.id, { status: "viewed" });
        console.log(`[docuseal-webhook] Contract ${contract.id} viewed`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[docuseal-webhook] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
