import nodemailer from "nodemailer";

export function isEmailConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

export async function sendInvoiceEmail(
  recipientEmail: string,
  pdfBuffer: Buffer,
  invoiceNumber: string,
  options?: { includesContract?: boolean }
): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn("[invoice-email] SMTP not configured — skipping send");
    return false;
  }

  // Sanitize invoice number for email headers (prevent header injection)
  const safeNumber = invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100) || "Draft";

  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("[invoice-email] Invalid SMTP_PORT");
    return false;
  }

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const filename = `invoice-${safeNumber}.pdf`;
  const includesContract = options?.includesContract ?? true;

  const contractParagraph = includesContract
    ? `<p style="line-height: 1.7; margin: 0 0 16px;">
            We've also sent over a contract for your review and signature. Once the agreement is signed and the invoice is taken care of, we'll get your onboarding call on the calendar.
          </p>`
    : `<p style="line-height: 1.7; margin: 0 0 16px;">
            Once the invoice is taken care of, we'll get your onboarding call on the calendar.
          </p>`;

  try {
    await transport.sendMail({
      from: process.env.SMTP_USER,
      to: recipientEmail,
      subject: `Invoice #${safeNumber} — Agency Collective`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #333;">
          <p style="line-height: 1.7; margin: 0 0 16px;">Hello!</p>
          <p style="line-height: 1.7; margin: 0 0 16px;">
            Great chatting with you today, excited to get started.
          </p>
          <p style="line-height: 1.7; margin: 0 0 8px;">Attached you'll find:</p>
          <ul style="line-height: 1.7; margin: 0 0 16px; padding-left: 20px;">
            <li><strong>Project Scope</strong> &mdash; an overview of what we'll be tackling together</li>
            <li><strong>Invoice</strong> &mdash; payment details for your month-to-month agreement</li>
          </ul>
          ${contractParagraph}
          <p style="line-height: 1.7; margin: 0 0 16px;">Looking forward to it!</p>
          <p style="line-height: 1.7; margin: 0 0 4px;">Best,<br><strong>Amber</strong></p>
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 13px; color: #888;">
            <strong style="color: #333;">Agency Collective</strong><br>
            White-Glove Advertising for Niche Verticals<br>
            <a href="mailto:team@agencycollective.ai" style="color: #2563eb; text-decoration: none;">team@agencycollective.ai</a><br>
            <a href="https://www.agencycollective.ai" style="color: #2563eb; text-decoration: none;">https://www.agencycollective.ai</a><br>
            Los Angeles, CA
          </div>
        </div>
      `,
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    return true;
  } catch (err) {
    console.error("[invoice-email] Failed to send:", err instanceof Error ? err.message : "Unknown error");
    return false;
  } finally {
    transport.close();
  }
}
