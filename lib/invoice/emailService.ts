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
  options?: {
    includesContract?: boolean;
    cc?: string | string[];
    additionalPdfs?: Array<{ buffer: Buffer; invoiceNumber: string }>;
    /** "onboarding" (default) = new-client email with scope/contract/onboarding
     *  language; "rebill" = recurring monthly invoice email (no scope/contract). */
    variant?: "onboarding" | "rebill";
    /**
     * Free-form files to include in the email alongside the invoice PDF —
     * receipts, contract addendums, supporting docs. Distinct from
     * `additionalPdfs` (which renders them as additional INVOICES with the
     * `invoice-` filename prefix and counts them in the subject line).
     * Filenames are passed straight through to nodemailer; the route layer is
     * responsible for size/extension/count limits.
     */
    additionalAttachments?: Array<{
      filename: string;
      buffer: Buffer;
      contentType: string;
    }>;
  }
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
  const additionalPdfs = options?.additionalPdfs ?? [];
  const hasMultiple = additionalPdfs.length > 0;

  const allNumbers = [safeNumber, ...additionalPdfs.map((p) => p.invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100))];
  const subject = hasMultiple
    ? `Invoices ${allNumbers.map((n) => `#${n}`).join(", ")} — Agency Collective`
    : `Invoice #${safeNumber} — Agency Collective`;

  const invoiceLabel = hasMultiple ? "Invoices" : "Invoice";

  const contractParagraph = includesContract
    ? `<p style="line-height: 1.7; margin: 0 0 16px;">
            We've also sent over a contract for your review and signature. Once the agreement is signed and the ${invoiceLabel.toLowerCase()} ${hasMultiple ? "are" : "is"} taken care of, we'll get your onboarding call on the calendar.
          </p>`
    : `<p style="line-height: 1.7; margin: 0 0 16px;">
            Once the ${invoiceLabel.toLowerCase()} ${hasMultiple ? "are" : "is"} taken care of, we'll get your onboarding call on the calendar.
          </p>`;

  const variant = options?.variant ?? "onboarding";

  const onboardingBody = `
          <p style="line-height: 1.7; margin: 0 0 16px;">Hello!</p>
          <p style="line-height: 1.7; margin: 0 0 16px;">
            Great chatting with you today, excited to get started.
          </p>
          <p style="line-height: 1.7; margin: 0 0 8px;">We've sent you 2 separate emails. In those you'll find:</p>
          <ul style="line-height: 1.7; margin: 0 0 16px; padding-left: 20px;">
            <li><strong>Project Scope</strong> &mdash; an overview of what we'll be tackling together</li>
            <li><strong>${invoiceLabel}</strong> &mdash; payment details for your month-to-month agreement</li>
          </ul>
          ${contractParagraph}
          <p style="line-height: 1.7; margin: 0 0 16px;">Looking forward to it!</p>
          <p style="line-height: 1.7; margin: 0 0 4px;">Best,<br><strong>Ava Morris</strong> | Onboarding Team</p>`;

  const hasExtraAttachments = (options?.additionalAttachments?.length ?? 0) > 0;
  // Wording sidesteps "you requested" — the admin chose what to attach, not
  // the recipient. "Supporting files" stays neutral.
  const rebillAttachedPhrase = hasExtraAttachments
    ? `your ${invoiceLabel.toLowerCase()} for this billing cycle ${hasMultiple ? "are" : "is"} attached, along with the supporting files for this cycle.`
    : `your ${invoiceLabel.toLowerCase()} for this billing cycle ${hasMultiple ? "are" : "is"} attached.`;

  const rebillBody = `
          <p style="line-height: 1.7; margin: 0 0 16px;">Hi there,</p>
          <p style="line-height: 1.7; margin: 0 0 16px;">
            Thanks for your continued partnership with Agency Collective &mdash; ${rebillAttachedPhrase}
          </p>
          <p style="line-height: 1.7; margin: 0 0 16px;">
            Please review and submit payment at your convenience using the details on the ${invoiceLabel.toLowerCase()}. If you have any questions, just reply to this email and we'll be happy to help.
          </p>
          <p style="line-height: 1.7; margin: 0 0 16px;">We appreciate your business!</p>
          <p style="line-height: 1.7; margin: 0 0 4px;">Best,<br><strong>Ava Morris</strong> | Billing Team</p>`;

  const bodyHtml = variant === "rebill" ? rebillBody : onboardingBody;

  // Sanitise free-form attachment filenames: strip control chars + path
  // separators (no relative-path nodemailer surprises), cap at 200 chars, and
  // keep the extension. Empty filenames fall back to "attachment".
  const sanitiseFilename = (name: string): string => {
    const cleaned = name
      .replace(/[\r\n\x00-\x1f]/g, "")
      .replace(/[\\/]/g, "_")
      .trim();
    if (!cleaned) return "attachment";
    return cleaned.slice(0, 200);
  };

  const attachments = [
    { filename, content: pdfBuffer, contentType: "application/pdf" as const },
    ...additionalPdfs.map((p) => ({
      filename: `invoice-${p.invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100)}.pdf`,
      content: p.buffer,
      contentType: "application/pdf" as const,
    })),
    ...(options?.additionalAttachments ?? []).map((a) => ({
      filename: sanitiseFilename(a.filename),
      content: a.buffer,
      contentType: a.contentType || "application/octet-stream",
    })),
  ];

  try {
    await transport.sendMail({
      from: process.env.SMTP_USER,
      to: recipientEmail,
      ...(options?.cc && (Array.isArray(options.cc) ? options.cc.length > 0 : options.cc.length > 0)
        ? { cc: options.cc }
        : {}),
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #333;">
          ${bodyHtml}
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 13px; color: #888;">
            <strong style="color: #333;">Agency Collective</strong><br>
            White-Glove Advertising for Niche Verticals<br>
            <a href="mailto:team@agencycollective.ai" style="color: #2563eb; text-decoration: none;">team@agencycollective.ai</a><br>
            <a href="https://www.agencycollective.ai" style="color: #2563eb; text-decoration: none;">https://www.agencycollective.ai</a><br>
            Los Angeles, CA
          </div>
        </div>
      `,
      attachments,
    });
    return true;
  } catch (err) {
    console.error("[invoice-email] Failed to send:", err instanceof Error ? err.message : "Unknown error");
    return false;
  } finally {
    transport.close();
  }
}
