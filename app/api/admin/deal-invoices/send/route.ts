export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDealInvoice, updateDealInvoice } from "@/lib/dealInvoices";
import { sendInvoiceEmail, isEmailConfigured } from "@/lib/invoice/emailService";
import { findDealContractByDealId, updateDealContract } from "@/lib/dealContracts";
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

    if (!invoiceId || !email || !pdfFile) {
      return NextResponse.json({ error: "invoiceId, email, and pdf required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (pdfFile.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF too large" }, { status: 413 });
    }

    const invoice = await findDealInvoice(invoiceId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

    // Check if there's a pending contract to send alongside
    const contract = sendContract ? await findDealContractByDealId(invoice.dealId) : null;
    const hasPendingContract = contract?.status === "pending" && contract.contractTemplateId;

    const buffer = Buffer.from(await pdfFile.arrayBuffer());
    const safeNumber = invoice.invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100);

    // Send invoice email (with or without contract mention)
    const sent = await sendInvoiceEmail(email, buffer, safeNumber, {
      includesContract: !!hasPendingContract,
    });
    if (!sent) return NextResponse.json({ error: "Failed to send invoice email" }, { status: 500 });

    // Update invoice record
    await updateDealInvoice(invoiceId, {
      status: "sent",
      sentAt: new Date().toISOString(),
      sentCount: invoice.sentCount + 1,
      sentBy: session.adminId,
      clientEmail: email,
      pdfData: buffer,
    });

    // Send contract via DocuSeal if pending
    let contractSent = false;
    let contractError: string | undefined;

    if (hasPendingContract && contract) {
      try {
        const deal = await findDeal(invoice.dealId);
        const template = contract.contractTemplateId
          ? await findContractTemplate(contract.contractTemplateId)
          : null;

        if (deal && template) {
          const result = await generateContractFromDeal(deal, email, template);

          try {
            await updateDealContract(contract.id, {
              docusealSubmissionId: result.submissionId,
              docusealSubmitterId: result.submitterId,
              signingUrl: result.signingUrl,
              status: "sent",
              clientEmail: email,
              sentAt: new Date().toISOString(),
            });
            await updateDeal(invoice.dealId, { status: "pending_signature" });
          } catch (dbErr) {
            // DocuSeal submission was created but DB update failed — log for recovery
            console.error(
              `[deal-invoices/send] ORPHAN: DocuSeal submission ${result.submissionId} created for deal ${invoice.dealId} but DB update failed:`,
              dbErr instanceof Error ? dbErr.message : dbErr
            );
            throw dbErr;
          }
          contractSent = true;
        } else {
          contractError = !deal ? "Deal not found" : "Contract template not found";
        }
      } catch (err) {
        console.error("[deal-invoices/send] Contract send failed:", err instanceof Error ? err.message : err);
        contractError = "Contract send failed. You can retry from the contract drawer.";
      }
    }

    return NextResponse.json({
      success: true,
      invoiceSent: true,
      contractSent,
      contractError,
    });
  } catch (err) {
    console.error("[deal-invoices/send]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
