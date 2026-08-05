export const dynamic = "force-dynamic";
export const maxDuration = 30;

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireDirectoryActor, findAdAccountInScope } from "@/lib/api/requireAdmin";
import { ensureMigrated } from "@/lib/db";
import { findUser } from "@/lib/users";
import {
  normalizeBrandName,
  brandsMatch,
  getAdAccountPayoutMonthsByBrand,
} from "@/lib/payouts";
import { insertDocument, type PayoutDocument } from "@/lib/payoutDocuments";
import {
  createAdAccountInvoice,
  reconcileInvoiceForAdAccount,
} from "@/lib/adAccountInvoices";
import { adInvoiceType, computeAdSpendFeeCents } from "@/lib/adAccountInvoice";
import type { AdInvoiceType } from "@/lib/adAccountLineItem";

interface RouteContext {
  params: { id: string };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Register an invoice that was sent OUTSIDE this UI for a specific ad account —
 * optionally backdated, optionally with the original PDF uploaded. The PDF (if
 * provided) is filed in payout_documents and linked; the record is added to the
 * account's history WITHOUT superseding its current active invoice, then
 * reconciled so a backdated invoice whose cycle already has a matching
 * "Ad Account" payout lands as `paid`.
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = { adminId: actor.admin.id };

  await ensureMigrated();

  const account = await findAdAccountInScope(actor.scope, params.id);
  if (!account)
    return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  let brand: string | null = null;
  let userId: string | null = account.userId;
  if (account.userId) {
    const user = await findUser(account.userId);
    if (user) {
        // Non-main (partner-book) accounts match payouts ONLY via the
        // internally-managed explicit link — no display-name fallback, and
        // exact equality below — so a name collision with an internal brand
        // can't feed internal payments into a partner schedule.
        brand =
          account.workspace !== "main"
            ? user.payoutBrand
            : user.payoutBrand ?? user.displayName;
      }
  }

  try {
    const formData = await req.formData();

    const rawNumber = String(formData.get("invoiceNumber") ?? "").trim();
    const invoiceNumber = rawNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100);
    if (!invoiceNumber)
      return NextResponse.json({ error: "invoiceNumber is required" }, { status: 400 });

    const cycleAnchor = String(formData.get("cycleAnchor") ?? "").trim();
    if (!DATE_RE.test(cycleAnchor))
      return NextResponse.json({ error: "cycleAnchor must be yyyy-mm-dd" }, { status: 400 });
    const cycleProbe = new Date(`${cycleAnchor}T00:00:00Z`);
    if (isNaN(cycleProbe.getTime()) || cycleProbe.toISOString().slice(0, 10) !== cycleAnchor)
      return NextResponse.json({ error: "cycleAnchor is not a real date" }, { status: 400 });

    // sentAt — the (possibly backdated) date the invoice went out.
    const sentDate = String(formData.get("sentAt") ?? "").trim();
    let sentAt: string | undefined;
    if (sentDate) {
      if (!DATE_RE.test(sentDate))
        return NextResponse.json({ error: "sentAt must be yyyy-mm-dd" }, { status: 400 });
      const probe = new Date(`${sentDate}T12:00:00Z`);
      if (isNaN(probe.getTime()))
        return NextResponse.json({ error: "sentAt is not a real date" }, { status: 400 });
      sentAt = probe.toISOString();
    }

    const rawAmount = Number(formData.get("amountCents"));
    const amountCents =
      Number.isFinite(rawAmount) && rawAmount >= 0
        ? Math.min(Math.round(rawAmount), 1_000_000_000)
        : 0;

    const rawSpend = Number(formData.get("spendCents"));
    const spendCents =
      Number.isFinite(rawSpend) && rawSpend > 0 ? Math.round(rawSpend) : 0;
    const rawFee = Number(formData.get("feeBps"));
    const feeBps =
      Number.isFinite(rawFee) && rawFee > 0 ? Math.round(rawFee) : account.adSpendFeeBps;
    const rawRetainer = Number(formData.get("retainerCents"));
    const retainerCents =
      Number.isFinite(rawRetainer) && rawRetainer > 0 ? Math.round(rawRetainer) : 0;

    // Explicit type override, else derive from the component amounts.
    const typeField = String(formData.get("invoiceType") ?? "").trim();
    const feeCents = computeAdSpendFeeCents(spendCents, feeBps);
    const invoiceType: AdInvoiceType =
      typeField === "retainer" || typeField === "ad_spend" || typeField === "combined"
        ? (typeField as AdInvoiceType)
        : adInvoiceType(retainerCents, feeCents);

    let recipientEmail: string | null = null;
    const rawEmail = String(formData.get("recipientEmail") ?? "").trim();
    if (rawEmail) {
      if (!EMAIL_RE.test(rawEmail) || rawEmail.length > 254)
        return NextResponse.json({ error: "Invalid recipientEmail" }, { status: 400 });
      recipientEmail = rawEmail;
    }

    // Optional PDF upload — filed in payout_documents and linked.
    let payoutDocumentId: string | null = null;
    const pdfFile = formData.get("pdf");
    if (pdfFile instanceof File && pdfFile.size > 0) {
      if (pdfFile.size > 10 * 1024 * 1024)
        return NextResponse.json({ error: "PDF too large (max 10 MB)" }, { status: 413 });
      const type = pdfFile.type || "";
      const isPdf = type === "application/pdf" || /\.pdf$/i.test(pdfFile.name);
      if (!isPdf)
        return NextResponse.json({ error: "Only PDF uploads are allowed" }, { status: 400 });
      const buffer = Buffer.from(await pdfFile.arrayBuffer());
      const fileBrand = brand || account.accountName || "Ad Account";
      const anchor = sentDate || cycleAnchor;
      const m = anchor.match(/^(\d{4})-(\d{2})/);
      const doc: PayoutDocument = {
        id: crypto.randomUUID(),
        normalizedBrand: normalizeBrandName(fileBrand),
        brandName: fileBrand,
        workspace: account.workspace,
        docType: "invoice",
        fileName: `invoice-${invoiceNumber}.pdf`,
        fileSize: buffer.length,
        payoutMonth: m ? Number(m[2]) : null,
        payoutYear: m ? Number(m[1]) : null,
        uploadedBy: session.adminId,
        createdAt: (sentAt ?? new Date().toISOString()),
      };
      try {
        await insertDocument(doc, buffer);
        payoutDocumentId = doc.id;
      } catch (err) {
        console.error("[ad-account-invoice/register] PDF file failed:", err);
        return NextResponse.json({ error: "Failed to store the PDF" }, { status: 500 });
      }
    }

    const invoice = await createAdAccountInvoice({
      adAccountId: account.id,
      userId,
      brand,
      invoiceNumber,
      invoiceType,
      payoutDocumentId,
      cycleAnchor,
      amountCents,
      spendCents: spendCents > 0 ? spendCents : null,
      feeBps: spendCents > 0 ? feeBps : null,
      recipientEmail,
      sentByAdminId: session.adminId,
      sentAt,
      supersede: false, // backfill — keep the current active invoice intact
    });

    // Reconcile immediately: a backdated invoice whose cycle already has a
    // matching "Ad Account" payout should land as paid rather than awaiting.
    if (brand) {
      try {
        const byBrand = await getAdAccountPayoutMonthsByBrand();
        const norm = normalizeBrandName(brand);
        const months: Array<{ year: number; month: number }> = [];
        for (const [key, arr] of byBrand) {
          if (
            key === norm ||
            (account.workspace === "main" && brandsMatch(norm, key))
          )
            months.push(...arr);
        }
        await reconcileInvoiceForAdAccount(invoice, months);
      } catch {
        // best-effort — the directory build will reconcile on next read
      }
    }

    return NextResponse.json({ data: invoice });
  } catch (err) {
    console.error("[ad-account-invoice/register]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
