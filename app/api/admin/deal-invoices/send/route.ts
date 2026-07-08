export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDealInvoiceMeta, updateDealInvoice } from "@/lib/dealInvoices";
import { updateAdditionalInvoice } from "@/lib/dealAdditionalInvoices";
import { sendInvoiceEmail, isEmailConfigured } from "@/lib/invoice/emailService";
import { findDealContractByDealId, updateDealContract } from "@/lib/dealContracts";
import { findAdditionalContractsByDealId, updateAdditionalContract } from "@/lib/dealAdditionalContracts";
import { findContractTemplate, type ContractTemplateRecord } from "@/lib/contractTemplates";
import { generateContractFromDeal, fetchDocusealTemplate } from "@/lib/dealContractGenerator";
import { findDeal, updateDeal, type DealRecord } from "@/lib/deals";
import type { DocuSealTemplate } from "@/lib/docuseal/schemas";

// One entry per contract to send: primary (deal_contracts row) or an
// additional contract (deal_additional_contracts row). `id` is the row id in
// the respective table.
type SendTarget = {
  kind: "primary" | "additional";
  id: string;
  templateId: string;
  overrideId: number | null;
};

interface ContractContext {
  deal: DealRecord | null;
  templateById: Map<string, ContractTemplateRecord | null>;
  docusealTemplateByEffectiveId: Map<number, DocuSealTemplate>;
  error?: string;
}

/**
 * Everything the DocuSeal sends need — deal row, local template rows, and
 * each unique DocuSeal template — fetched up front so the caller can overlap
 * it with the SMTP send. Never rejects: a total failure comes back as
 * `{ deal: null, error }`, and individual DocuSeal template misses just fall
 * back to a per-contract fetch inside generateContractFromDeal.
 */
async function prefetchContractContext(dealId: string, targets: SendTarget[]): Promise<ContractContext> {
  try {
    const uniqueTemplateIds = Array.from(new Set(targets.map((t) => t.templateId)));
    const [deal, templates] = await Promise.all([
      findDeal(dealId),
      Promise.all(uniqueTemplateIds.map((tid) => findContractTemplate(tid))),
    ]);
    const templateById = new Map(uniqueTemplateIds.map((tid, i) => [tid, templates[i]]));

    // One GET per unique effective DocuSeal template — contracts often share
    // a template, and generateContractFromDeal would otherwise re-fetch it
    // once per contract.
    const effectiveIds = new Set<number>();
    for (const t of targets) {
      const local = templateById.get(t.templateId);
      if (local) effectiveIds.add(t.overrideId ?? local.docusealTemplateId);
    }
    const docusealTemplateByEffectiveId = new Map<number, DocuSealTemplate>();
    const fetched = await Promise.allSettled(
      Array.from(effectiveIds).map(async (id) => [id, await fetchDocusealTemplate(id)] as const)
    );
    for (const r of fetched) {
      if (r.status === "fulfilled") docusealTemplateByEffectiveId.set(r.value[0], r.value[1]);
    }
    return { deal, templateById, docusealTemplateByEffectiveId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { deal: null, templateById: new Map(), docusealTemplateByEffectiveId: new Map(), error: msg };
  }
}

/** Send every target contract in parallel; returns per-contract tallies. */
async function sendContracts(
  targets: SendTarget[],
  contextPromise: Promise<ContractContext> | null,
  email: string,
  dealId: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (targets.length === 0 || !contextPromise) return { sent: 0, failed: 0, errors: [] };

  const ctx = await contextPromise;
  if (!ctx.deal) {
    return { sent: 0, failed: targets.length, errors: [ctx.error ?? "Deal not found"] };
  }
  const deal = ctx.deal;

  // Send all contracts in parallel — each gets its own Docuseal submission /
  // signing email.
  const sendResults = await Promise.allSettled(
    targets.map(async (t) => {
      const template = ctx.templateById.get(t.templateId);
      if (!template) throw new Error("Contract template not found");
      const effectiveId = t.overrideId ?? template.docusealTemplateId;
      const result = await generateContractFromDeal(
        deal,
        email,
        template,
        t.overrideId,
        ctx.docusealTemplateByEffectiveId.get(effectiveId)
      );
      const now = new Date().toISOString();
      const changes = {
        docusealSubmissionId: result.submissionId,
        docusealSubmitterId: result.submitterId,
        signingUrl: result.signingUrl,
        status: "sent" as const,
        clientEmail: email,
        sentAt: now,
      };
      if (t.kind === "primary") {
        await updateDealContract(t.id, changes);
      } else {
        await updateAdditionalContract(t.id, changes);
      }
      return result;
    })
  );

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let i = 0; i < sendResults.length; i++) {
    const r = sendResults[i];
    if (r.status === "fulfilled") {
      sent += 1;
      continue;
    }
    failed += 1;
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    const target = targets[i];
    const label = target.kind === "primary" ? "primary contract" : `additional contract ${target.id}`;
    console.error(`[deal-invoices/send] Contract send failed for ${label}:`, msg);
    errors.push(msg);
  }

  if (sent > 0) {
    try {
      await updateDeal(dealId, { status: "pending_signature" });
    } catch (err) {
      console.error("[deal-invoices/send] Deal status update failed:", err instanceof Error ? err.message : err);
    }
  }

  return { sent, failed, errors };
}

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "Email not configured" }, { status: 503 });
  }

  const t0 = Date.now();
  try {
    const formData = await req.formData();
    const invoiceId = formData.get("invoiceId") as string;
    const email = formData.get("email") as string;
    const pdfFile = formData.get("pdf") as File;
    const sendContract = formData.get("sendContract") === "true";
    const ccRaw = formData.getAll("cc").filter((v): v is string => typeof v === "string");

    // Invoice JSON piggybacked on the send — persisted alongside the sent
    // status so the client doesn't need a separate save round-trip first.
    const invoiceDataRaw = formData.get("invoiceData");
    const invoiceDataStr = typeof invoiceDataRaw === "string" ? invoiceDataRaw : null;
    const additionalInvoiceDataRaw = formData
      .getAll("additionalInvoiceData")
      .filter((v): v is string => typeof v === "string");

    // Additional invoice PDFs
    const additionalPdfFiles = formData.getAll("additionalPdfs") as File[];
    const additionalIdsRaw = formData.get("additionalInvoiceIds") as string | null;
    let additionalInvoiceIds: string[] = [];
    if (additionalIdsRaw) {
      try {
        const parsed = JSON.parse(additionalIdsRaw);
        if (Array.isArray(parsed)) {
          additionalInvoiceIds = parsed.filter((v): v is string => typeof v === "string");
        }
      } catch { /* ignore */ }
    }

    if (!invoiceId || !email || !pdfFile) {
      return NextResponse.json({ error: "invoiceId, email, and pdf required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // Same caps as the PATCH route — reject before anything is emailed
    for (const s of [invoiceDataStr, ...additionalInvoiceDataRaw]) {
      if (s == null) continue;
      if (s.length > 1_000_000) {
        return NextResponse.json({ error: "Invoice data too large" }, { status: 413 });
      }
      try {
        JSON.parse(s);
      } catch {
        return NextResponse.json({ error: "Invalid invoice data" }, { status: 400 });
      }
    }

    // Validate total size across all PDFs (25MB limit)
    let totalSize = pdfFile.size;
    for (const f of additionalPdfFiles) totalSize += f.size;
    if (totalSize > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Total PDF size exceeds 25MB" }, { status: 413 });
    }
    if (pdfFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF too large" }, { status: 413 });
    }

    const tParsed = Date.now();
    const invoice = await findDealInvoiceMeta(invoiceId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const tInvoice = Date.now();

    // Check if there are contracts to send/resend alongside (both lookups in
    // parallel)
    const [contract, additionalContracts] = sendContract
      ? await Promise.all([
          findDealContractByDealId(invoice.dealId),
          findAdditionalContractsByDealId(invoice.dealId),
        ])
      : [null, []];

    // Build the list of contracts to send: primary (if eligible) + additionals
    // with a template
    const targets: SendTarget[] = [];
    if (contract && contract.status !== "signed" && contract.contractTemplateId) {
      targets.push({
        kind: "primary",
        id: contract.id,
        templateId: contract.contractTemplateId,
        overrideId: contract.docusealTemplateOverrideId ?? null,
      });
    }
    for (const ac of additionalContracts) {
      if (ac.status !== "signed" && ac.contractTemplateId) {
        targets.push({
          kind: "additional",
          id: ac.id,
          templateId: ac.contractTemplateId,
          overrideId: ac.docusealTemplateOverrideId ?? null,
        });
      }
    }
    const anyContractEligible = targets.length > 0;

    const buffer = Buffer.from(await pdfFile.arrayBuffer());
    const safeNumber = invoice.invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100);

    // Build additional PDF buffers (invoiceData aligned by index with the
    // files — the drawer appends both per entry in the same order)
    const additionalPdfs: Array<{ buffer: Buffer; invoiceNumber: string; id: string; invoiceData: string | null }> = [];
    for (let i = 0; i < additionalPdfFiles.length; i++) {
      const file = additionalPdfFiles[i];
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: `Additional PDF ${i + 1} too large` }, { status: 413 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const invNumber = file.name.replace(/^invoice-/, "").replace(/\.pdf$/, "") || `additional-${i + 1}`;
      additionalPdfs.push({
        buffer: buf,
        invoiceNumber: invNumber,
        id: additionalInvoiceIds[i] || "",
        invoiceData: additionalInvoiceDataRaw[i] ?? null,
      });
    }

    // Validate + dedupe CC emails; exclude the primary recipient (case-insensitive)
    // to prevent the client from being sent duplicate copies.
    const toLower = email.trim().toLowerCase();
    const ccEmails: string[] = [];
    const seenCc = new Set<string>([toLower]);
    for (const raw of ccRaw) {
      const v = raw.trim().toLowerCase();
      if (!v) continue;
      if (!emailRegex.test(v) || v.length > 254) {
        return NextResponse.json({ error: "Invalid CC email" }, { status: 400 });
      }
      if (seenCc.has(v)) continue;
      seenCc.add(v);
      ccEmails.push(v);
      if (ccEmails.length >= 10) break;
    }

    // Kick off the contract context prefetch now so it overlaps the SMTP
    // send. DocuSeal submissions themselves are only created AFTER the email
    // succeeds — otherwise a failed email + retry would double-send signing
    // requests.
    const contractContextPromise = anyContractEligible
      ? prefetchContractContext(invoice.dealId, targets)
      : null;

    const tPrepared = Date.now();
    const sent = await sendInvoiceEmail(email, buffer, safeNumber, {
      includesContract: anyContractEligible,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      additionalPdfs: additionalPdfs.length > 0
        ? additionalPdfs.map((p) => ({ buffer: p.buffer, invoiceNumber: p.invoiceNumber }))
        : undefined,
    });
    if (!sent) return NextResponse.json({ error: "Failed to send invoice email" }, { status: 500 });
    const tEmail = Date.now();

    // Invoice DB updates and DocuSeal contract sends are independent — run
    // them concurrently. Both are best-effort: the email is already out.
    let dbWritesMs = 0;
    let contractsMs = 0;
    const [dbResults, contractOutcome] = await Promise.all([
      Promise.allSettled([
        updateDealInvoice(invoiceId, {
          ...(invoiceDataStr != null ? { invoiceData: invoiceDataStr } : {}),
          status: "sent",
          sentAt: new Date().toISOString(),
          incrementSentCount: true,
          sentBy: session.adminId,
          clientEmail: email,
          pdfData: buffer,
        }),
        ...additionalPdfs
          .filter((ap) => ap.id)
          .map((ap) =>
            updateAdditionalInvoice(ap.id, {
              ...(ap.invoiceData != null ? { invoiceData: ap.invoiceData } : {}),
              status: "sent",
              pdfData: ap.buffer,
            })
          ),
      ]).then((r) => { dbWritesMs = Date.now() - tEmail; return r; }),
      sendContracts(targets, contractContextPromise, email, invoice.dealId)
        .then((r) => { contractsMs = Date.now() - tEmail; return r; }),
    ]);

    const dbFailures = dbResults.filter((r) => r.status === "rejected");
    if (dbFailures.length > 0) {
      for (const f of dbFailures) {
        console.error("[deal-invoices/send] DB update failed:", (f as PromiseRejectedResult).reason);
      }
    }

    // Phase timing — durations and counts only. parse = formData/PDF upload
    // read; email = SMTP round-trip (the contract-context prefetch overlaps
    // it); dbWrites/contracts run concurrently after the email.
    const tDone = Date.now();
    console.log(
      `[deal-invoices/send] timing totalMs=${tDone - t0} parseMs=${tParsed - t0} invoiceLookupMs=${tInvoice - tParsed} prepMs=${tPrepared - tInvoice} emailMs=${tEmail - tPrepared} dbWritesMs=${dbWritesMs} contractsMs=${contractsMs} pdfBytes=${totalSize} contracts=${contractOutcome.sent}/${targets.length}`
    );

    return NextResponse.json({
      success: true,
      invoiceSent: true,
      contractsSent: contractOutcome.sent,
      contractsFailed: contractOutcome.failed,
      contractError: contractOutcome.errors.length > 0 ? contractOutcome.errors.join("; ") : undefined,
      dbUpdateErrors: dbFailures.length > 0 ? dbFailures.length : undefined,
    });
  } catch (err) {
    console.error("[deal-invoices/send]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
