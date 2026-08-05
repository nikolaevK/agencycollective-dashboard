export const dynamic = "force-dynamic";
export const maxDuration = 30;

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireDirectoryActor, findAdAccountInScope } from "@/lib/api/requireAdmin";
import { isExternalScope } from "@/lib/workspaces";
import { ensureMigrated } from "@/lib/db";
import { sendInvoiceEmail, isEmailConfigured } from "@/lib/invoice/emailService";
import {
  getAgencyProfileEmailBrand,
  type AgencyProfileEmailBrand,
} from "@/lib/invoiceAgencyProfiles";
import { insertDocument, type PayoutDocument } from "@/lib/payoutDocuments";
import {
  normalizeBrandName,
  brandsMatch,
  getAdAccountPayoutMonthsByBrand,
} from "@/lib/payouts";
import { computeRebillSchedule, type ClientBilling } from "@/lib/clientBilling";
import { businessToday, businessTodayYmd } from "@/lib/businessTime";
import { getAdAccount, normalizeFeeBps } from "@/lib/adAccounts";
import { findUser } from "@/lib/users";
import { createAdAccountInvoice } from "@/lib/adAccountInvoices";
import { adInvoiceType, computeAdSpendFeeCents } from "@/lib/adAccountInvoice";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Same attachment limits as the client re-bill send route.
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_SIZE = 3 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 3 * 1024 * 1024;
const BLOCKED_ATTACHMENT_EXTS = new Set([
  "exe", "bat", "cmd", "com", "scr", "pif", "msi", "ps1", "vbs", "vbe",
  "js", "jse", "wsf", "wsh", "hta", "jar", "app", "deb", "rpm",
]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

function shortName(name: string): string {
  return name.length > 80 ? `${name.slice(0, 77)}…` : name;
}

/** yyyy-mm-dd from a timestamp. */
function datePart(value: string | null): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

/**
 * Send an ad-account invoice and file the PDF in payout_documents. When an
 * `adAccountId` is supplied the recipient/brand are resolved server-side and a
 * tracking row is recorded so the account moves to `invoice_sent` until a
 * matching "Ad Account"-flagged payout lands. Without it, a free invoice is
 * sent and recorded with no account/brand link (no auto-reconciliation).
 */
export async function POST(req: NextRequest) {
  const actor = await requireDirectoryActor();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = { adminId: actor.admin.id };

  if (!isEmailConfigured())
    return NextResponse.json({ error: "Email not configured" }, { status: 503 });

  await ensureMigrated();

  try {
    const formData = await req.formData();
    const email = String(formData.get("email") ?? "").trim();
    const pdfRaw = formData.get("pdf");
    const pdfFile = pdfRaw instanceof File ? pdfRaw : null;
    const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
    const ccRaw = formData.getAll("cc").filter((v): v is string => typeof v === "string");
    const adAccountId = String(formData.get("adAccountId") ?? "").trim() || null;

    if (!email || !pdfFile)
      return NextResponse.json({ error: "email and pdf are required" }, { status: 400 });
    // Free invoices (no account) file under a free-form brand — internal only;
    // external (partner) scopes must invoice through one of their accounts.
    if (!adAccountId && isExternalScope(actor.scope))
      return NextResponse.json({ error: "adAccountId is required" }, { status: 400 });
    if (!EMAIL_RE.test(email) || email.length > 254)
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    if (pdfFile.size > 10 * 1024 * 1024)
      return NextResponse.json({ error: "PDF too large" }, { status: 413 });

    // Resolve the ad account + its client (if attached).
    let account = null;
    let brand: string | null = null;
    let userId: string | null = null;
    if (adAccountId) {
      account = await findAdAccountInScope(actor.scope, adAccountId);
      if (!account)
        return NextResponse.json({ error: "Ad account not found" }, { status: 404 });
      if (account.userId) {
        userId = account.userId;
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
    }
    // Fall back for filing: client brand → account name → recipient name.
    const fileBrand =
      brand ||
      account?.accountName ||
      (typeof formData.get("brand") === "string" ? String(formData.get("brand")).trim() : "") ||
      String(formData.get("recipientName") ?? "").trim() ||
      "Ad Account";

    // Validate + dedupe CC.
    const toLower = email.toLowerCase();
    const seen = new Set<string>([toLower]);
    const ccEmails: string[] = [];
    for (const raw of ccRaw) {
      const v = raw.trim().toLowerCase();
      if (!v) continue;
      if (!EMAIL_RE.test(v) || v.length > 254)
        return NextResponse.json({ error: "Invalid CC email" }, { status: 400 });
      if (seen.has(v)) continue;
      seen.add(v);
      ccEmails.push(v);
      if (ccEmails.length >= 10) break;
    }

    const buffer = Buffer.from(await pdfFile.arrayBuffer());
    const safeNumber =
      invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100) || "Invoice";

    // Invoice style — when the drawer used a saved Agency Profile (e.g.
    // PepAds), brand the email to match the PDF. Resolved server-side from
    // the profile id so no free-form branding text enters the email.
    const styleProfileId = String(formData.get("styleProfileId") ?? "").trim();
    let emailBrand: AgencyProfileEmailBrand | undefined;
    if (styleProfileId) {
      const brand = await getAgencyProfileEmailBrand(styleProfileId);
      if (!brand)
        return NextResponse.json(
          { error: "Invoice style profile not found" },
          { status: 400 }
        );
      emailBrand = brand;
    }

    // Free-form attachments.
    const attachmentFiles = formData
      .getAll("attachments")
      .filter((v): v is File => v instanceof File);
    if (attachmentFiles.length > MAX_ATTACHMENT_COUNT)
      return NextResponse.json(
        { error: `Too many attachments (max ${MAX_ATTACHMENT_COUNT})` },
        { status: 400 }
      );
    let totalAttachmentBytes = 0;
    const additionalAttachments: Array<{
      filename: string;
      buffer: Buffer;
      contentType: string;
    }> = [];
    for (const file of attachmentFiles) {
      if (file.size === 0) continue;
      if (file.size > MAX_ATTACHMENT_SIZE)
        return NextResponse.json(
          { error: `Attachment "${shortName(file.name)}" exceeds ${MAX_ATTACHMENT_SIZE / 1024 / 1024} MB` },
          { status: 413 }
        );
      totalAttachmentBytes += file.size;
      if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_SIZE)
        return NextResponse.json(
          { error: `Attachments total exceeds ${MAX_TOTAL_ATTACHMENT_SIZE / 1024 / 1024} MB` },
          { status: 413 }
        );
      const ext = extensionOf(file.name);
      if (ext && BLOCKED_ATTACHMENT_EXTS.has(ext))
        return NextResponse.json(
          { error: `Attachment type ".${ext}" is not allowed` },
          { status: 400 }
        );
      additionalAttachments.push({
        filename: file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || "application/octet-stream",
      });
    }

    const sent = await sendInvoiceEmail(email, buffer, safeNumber, {
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      variant: "adaccount",
      brand: emailBrand,
      additionalAttachments:
        additionalAttachments.length > 0 ? additionalAttachments : undefined,
    });
    if (!sent)
      return NextResponse.json({ error: "Failed to send invoice email" }, { status: 500 });

    // File the PDF against the resolved brand.
    const now = new Date();
    const rawMonth = Number(formData.get("payoutMonth"));
    const rawYear = Number(formData.get("payoutYear"));
    const month =
      Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12
        ? rawMonth
        : now.getMonth() + 1;
    const year =
      Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
        ? rawYear
        : now.getFullYear();

    const doc: PayoutDocument = {
      id: crypto.randomUUID(),
      normalizedBrand: normalizeBrandName(fileBrand),
      brandName: fileBrand,
      // Free invoices (no account) are internal-only (guarded above) → main.
      workspace: account?.workspace ?? "main",
      docType: "invoice",
      fileName: `invoice-${safeNumber}.pdf`,
      fileSize: buffer.length,
      payoutMonth: month,
      payoutYear: year,
      uploadedBy: session.adminId,
      createdAt: now.toISOString(),
    };

    let docSaved = true;
    try {
      await insertDocument(doc, buffer);
    } catch (err) {
      console.error("[ad-account-invoice/send] document save failed (email sent):", err);
      docSaved = false;
    }

    // Compute the cycle anchor: for an attached account, the next bill date from
    // its schedule (so the directory shows `invoice_sent` for this cycle). For a
    // free invoice, today. Best-effort — falls back to today on any hiccup.
    // "Today" is the business-timezone date (NOT the UTC server clock) so an
    // evening-PT send doesn't anchor a day ahead — and it matches the basis the
    // directory uses to recompute `nextRebillAt`, so the `invoice_sent` chip
    // lights up for this cycle.
    let cycleAnchor = businessTodayYmd();
    if (account && brand) {
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
        // Feed the engine the SAME billing controls the directory uses (billing
        // day, last-billed override, pause, extend, lead). Passing `billing: null`
        // here made the anchor fall back to the account's UTC `createdAt` day,
        // which — for an account whose billing day differs (e.g. created at 8pm
        // PT so createdAt rolls to the next UTC day) — disagreed with the
        // directory's recomputed `nextRebillAt`, so the `invoice_sent` chip
        // wouldn't light and the stamped cycle looked a day off.
        const billing: ClientBilling = {
          userId: account.userId ?? "",
          cadence: "monthly",
          billingDay: account.billingDay,
          paused: account.billingPaused,
          pauseReason: null,
          extendUntil: account.extendUntil,
          lastRebilledOverride: account.lastBilledOverride,
          mrrMonthOverride: null,
          leadDays: account.leadDays,
          settingsNotes: null,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        };
        const schedule = computeRebillSchedule({
          anchorDate: datePart(account.createdAt),
          billing,
          payoutMonths: months,
          today: businessToday(),
        });
        if (schedule.nextRebillAt) cycleAnchor = schedule.nextRebillAt;
      } catch {
        // keep today
      }
    }

    const rawAmount = Number(formData.get("amountCents"));
    const amountCents =
      Number.isFinite(rawAmount) && rawAmount >= 0
        ? Math.min(Math.round(rawAmount), 1_000_000_000)
        : 0;
    // The invoice carries a retainer line and/or an ad-spend line — derive the
    // type from which components are present and record the ad-spend detail.
    const rawSpend = Number(formData.get("spendCents"));
    const spendCentsRaw =
      Number.isFinite(rawSpend) && rawSpend > 0 ? Math.round(rawSpend) : 0;
    const rawFee = Number(formData.get("feeBps"));
    const feeBpsRaw =
      Number.isFinite(rawFee) && rawFee > 0
        ? normalizeFeeBps(rawFee)
        : account?.adSpendFeeBps ?? 350;
    const rawRetainer = Number(formData.get("retainerCents"));
    const retainerCents =
      Number.isFinite(rawRetainer) && rawRetainer > 0 ? Math.round(rawRetainer) : 0;
    const feeCents = computeAdSpendFeeCents(spendCentsRaw, feeBpsRaw);

    const hasSpend = spendCentsRaw > 0 && feeCents > 0;
    const spendCents = hasSpend ? spendCentsRaw : null;
    const feeBps = hasSpend ? feeBpsRaw : null;
    const invoiceType = adInvoiceType(retainerCents, feeCents);

    let recorded = true;
    try {
      await createAdAccountInvoice({
        adAccountId,
        userId,
        brand,
        invoiceNumber: safeNumber,
        invoiceType,
        payoutDocumentId: docSaved ? doc.id : null,
        cycleAnchor,
        amountCents,
        spendCents,
        feeBps,
        recipientEmail: email,
        sentByAdminId: session.adminId,
      });
    } catch (err) {
      console.error("[ad-account-invoice/send] invoice record failed:", err);
      recorded = false;
    }

    return NextResponse.json({ success: true, saved: docSaved, recorded });
  } catch (err) {
    console.error("[ad-account-invoice/send]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
