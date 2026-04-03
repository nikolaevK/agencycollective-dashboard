import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { sendInvoiceEmail, isEmailConfigured } from "@/lib/invoice/emailService";

export const dynamic = "force-dynamic";

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured on the server" },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();
    const email = formData.get("email") as string;
    const pdfFile = formData.get("pdf") as File;
    const invoiceNumber = (formData.get("invoiceNumber") as string) || "draft";

    if (!email || !pdfFile) {
      return NextResponse.json(
        { error: "Email and PDF are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 254) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Enforce file size limit
    if (pdfFile.size > MAX_PDF_SIZE) {
      return NextResponse.json(
        { error: "PDF file too large (max 10 MB)" },
        { status: 413 }
      );
    }

    // Sanitize invoice number (strip control characters)
    const safeInvoiceNumber = invoiceNumber
      .replace(/[\r\n\t]/g, "")
      .slice(0, 100);

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    const sent = await sendInvoiceEmail(email, pdfBuffer, safeInvoiceNumber);

    if (sent) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  } catch (err) {
    console.error("[api/invoice/send] Error:", err instanceof Error ? err.message : "Unknown error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
