export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDealInvoice, updateDealInvoice } from "@/lib/dealInvoices";
import { updateAdditionalInvoice } from "@/lib/dealAdditionalInvoices";
import { sendInvoiceEmail, isEmailConfigured } from "@/lib/invoice/emailService";
import { findDealContractByDealId, updateDealContract } from "@/lib/dealContracts";
import { findAdditionalContractsByDealId, updateAdditionalContract } from "@/lib/dealAdditionalContracts";
import { findContractTemplate } from "@/lib/contractTemplates";
import { generateContractFromDeal } from "@/lib/dealContractGenerator";
import { findDeal, updateDeal } from "@/lib/deals";

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "Email not configured" }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const invoiceId = formData.get("invoiceId") as string;
    const email = formData.get("email") as string;
    const pdfFile = formData.get("pdf") as File;
    const sendContract = formData.get("sendContract") === "true";
    const ccEmail = (formData.get("cc") as string | null)?.trim() || null;

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

    // Validate total size across all PDFs (25MB limit)
    let totalSize = pdfFile.size;
    for (const f of additionalPdfFiles) totalSize += f.size;
    if (totalSize > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "Total PDF size exceeds 25MB" }, { status: 413 });
    }
    if (pdfFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF too large" }, { status: 413 });
    }

    const invoice = await findDealInvoice(invoiceId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    // Check if there's a contract to send/resend alongside
    const contract = sendContract ? await findDealContractByDealId(invoice.dealId) : null;
    const canSendContract = contract && contract.status !== "signed" && contract.contractTemplateId;
    const additionalContractsForEmail = sendContract
      ? await findAdditionalContractsByDealId(invoice.dealId)
      : [];
    const anyContractEligible =
      !!canSendContract ||
      additionalContractsForEmail.some((ac) => ac.status !== "signed" && !!ac.contractTemplateId);

    const buffer = Buffer.from(await pdfFile.arrayBuffer());
    const safeNumber = invoice.invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100);

    // Build additional PDF buffers
    const additionalPdfs: Array<{ buffer: Buffer; invoiceNumber: string; id: string }> = [];
    for (let i = 0; i < additionalPdfFiles.length; i++) {
      const file = additionalPdfFiles[i];
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: `Additional PDF ${i + 1} too large` }, { status: 413 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const invNumber = file.name.replace(/^invoice-/, "").replace(/\.pdf$/, "") || `additional-${i + 1}`;
      additionalPdfs.push({ buffer: buf, invoiceNumber: invNumber, id: additionalInvoiceIds[i] || "" });
    }

    // Validate CC email if provided
    if (ccEmail && (!emailRegex.test(ccEmail) || ccEmail.length > 254)) {
      return NextResponse.json({ error: "Invalid CC email" }, { status: 400 });
    }

    const sent = await sendInvoiceEmail(email, buffer, safeNumber, {
      includesContract: anyContractEligible,
      cc: ccEmail || undefined,
      additionalPdfs: additionalPdfs.length > 0
        ? additionalPdfs.map((p) => ({ buffer: p.buffer, invoiceNumber: p.invoiceNumber }))
        : undefined,
    });
    if (!sent) return NextResponse.json({ error: "Failed to send invoice email" }, { status: 500 });

    // Update all invoice records in parallel (best-effort — email already sent)
    const dbResults = await Promise.allSettled([
      updateDealInvoice(invoiceId, {
        status: "sent",
        sentAt: new Date().toISOString(),
        sentCount: invoice.sentCount + 1,
        sentBy: session.adminId,
        clientEmail: email,
        pdfData: buffer,
      }),
      ...additionalPdfs
        .filter((ap) => ap.id)
        .map((ap) => updateAdditionalInvoice(ap.id, { status: "sent", pdfData: ap.buffer })),
    ]);
    const dbFailures = dbResults.filter((r) => r.status === "rejected");
    if (dbFailures.length > 0) {
      for (const f of dbFailures) {
        console.error("[deal-invoices/send] DB update failed:", (f as PromiseRejectedResult).reason);
      }
    }

    // Send/resend primary contract + any additional contracts via DocuSeal
    let contractsSent = 0;
    let contractsFailed = 0;
    const contractErrors: string[] = [];

    if (sendContract) {
      // Build the list of contracts to send: primary (if eligible) + additionals with a template
      type SendTarget =
        | { kind: "primary"; record: NonNullable<typeof contract>; templateId: string; overrideId: number | null }
        | { kind: "additional"; id: string; templateId: string; overrideId: number | null };

      const targets: SendTarget[] = [];
      if (canSendContract && contract && contract.contractTemplateId) {
        targets.push({
          kind: "primary",
          record: contract,
          templateId: contract.contractTemplateId,
          overrideId: contract.docusealTemplateOverrideId ?? null,
        });
      }

      for (const ac of additionalContractsForEmail) {
        if (ac.status !== "signed" && ac.contractTemplateId) {
          targets.push({
            kind: "additional",
            id: ac.id,
            templateId: ac.contractTemplateId,
            overrideId: ac.docusealTemplateOverrideId ?? null,
          });
        }
      }

      // Parallel fetch: deal + all referenced templates (dedup by templateId)
      const uniqueTemplateIds = Array.from(new Set(targets.map((t) => t.templateId)));
      const [deal, ...templates] = await Promise.all([
        findDeal(invoice.dealId),
        ...uniqueTemplateIds.map((tid) => findContractTemplate(tid)),
      ]);
      const templateById = new Map(uniqueTemplateIds.map((tid, i) => [tid, templates[i]]));

      if (targets.length > 0 && !deal) {
        contractErrors.push("Deal not found");
        contractsFailed += targets.length;
      } else if (deal) {
        // Send all contracts in parallel — each gets its own Docuseal submission / signing email
        const sendResults = await Promise.allSettled(
          targets.map(async (t) => {
            const template = templateById.get(t.templateId);
            if (!template) throw new Error("Contract template not found");
            const result = await generateContractFromDeal(deal, email, template, t.overrideId);
            const now = new Date().toISOString();
            if (t.kind === "primary") {
              await updateDealContract(t.record.id, {
                docusealSubmissionId: result.submissionId,
                docusealSubmitterId: result.submitterId,
                signingUrl: result.signingUrl,
                status: "sent",
                clientEmail: email,
                sentAt: now,
              });
            } else {
              await updateAdditionalContract(t.id, {
                docusealSubmissionId: result.submissionId,
                docusealSubmitterId: result.submitterId,
                signingUrl: result.signingUrl,
                status: "sent",
                clientEmail: email,
                sentAt: now,
              });
            }
            return result;
          })
        );

        for (let i = 0; i < sendResults.length; i++) {
          const r = sendResults[i];
          if (r.status === "fulfilled") {
            contractsSent += 1;
          } else {
            contractsFailed += 1;
            const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
            const target = targets[i];
            const label = target.kind === "primary" ? "primary contract" : `additional contract ${target.id}`;
            console.error(`[deal-invoices/send] Contract send failed for ${label}:`, msg);
            contractErrors.push(msg);
          }
        }

        if (contractsSent > 0) {
          try {
            await updateDeal(invoice.dealId, { status: "pending_signature" });
          } catch (err) {
            console.error("[deal-invoices/send] Deal status update failed:", err instanceof Error ? err.message : err);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      invoiceSent: true,
      contractsSent,
      contractsFailed,
      contractError: contractErrors.length > 0 ? contractErrors.join("; ") : undefined,
      dbUpdateErrors: dbFailures.length > 0 ? dbFailures.length : undefined,
    });
  } catch (err) {
    console.error("[deal-invoices/send]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
