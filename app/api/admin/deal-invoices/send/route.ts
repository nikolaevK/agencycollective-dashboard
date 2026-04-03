export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findDealInvoice, updateDealInvoice } from "@/lib/dealInvoices";
import { sendInvoiceEmail, isEmailConfigured } from "@/lib/invoice/emailService";

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

    const buffer = Buffer.from(await pdfFile.arrayBuffer());
    const safeNumber = invoice.invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100);

    const sent = await sendInvoiceEmail(email, buffer, safeNumber);
    if (!sent) return NextResponse.json({ error: "Failed to send" }, { status: 500 });

    await updateDealInvoice(invoiceId, {
      status: "sent",
      sentAt: new Date().toISOString(),
      sentCount: invoice.sentCount + 1,
      sentBy: session.adminId,
      clientEmail: email,
      pdfData: buffer,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[deal-invoices/send]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
