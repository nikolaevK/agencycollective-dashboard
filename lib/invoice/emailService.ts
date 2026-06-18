import nodemailer from "nodemailer";

export type EmailAccountId = "primary" | "secondary";

/** A selectable "from" account exposed to the UI — credentials are NEVER included. */
export interface EmailAccount {
  id: EmailAccountId;
  label: string;
  email: string;
}

interface ResolvedSmtpAccount {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  label: string;
}

/**
 * Resolve one SMTP account from env. "primary" is the original
 * SMTP_HOST/PORT/USER/PASS. "secondary" is the optional second mailbox
 * (SMTP_*_2); its host/port fall back to the primary's, so a second mailbox on
 * the same server only needs SMTP_USER_2 + SMTP_PASS_2. Returns null when the
 * account isn't fully configured (missing host/user/pass, or an invalid port).
 */
function resolveSmtpAccount(id: EmailAccountId): ResolvedSmtpAccount | null {
  const secondary = id === "secondary";
  const host = secondary ? process.env.SMTP_HOST_2 || process.env.SMTP_HOST : process.env.SMTP_HOST;
  const user = secondary ? process.env.SMTP_USER_2 : process.env.SMTP_USER;
  const pass = secondary ? process.env.SMTP_PASS_2 : process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const portRaw = secondary
    ? process.env.SMTP_PORT_2 || process.env.SMTP_PORT || "587"
    : process.env.SMTP_PORT || "587";
  const port = parseInt(portRaw, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`[invoice-email] Invalid SMTP port for "${id}" account`);
    return null;
  }

  const from = (secondary ? process.env.SMTP_FROM_2 : process.env.SMTP_FROM) || user;
  const label = (secondary ? process.env.SMTP_LABEL_2 : process.env.SMTP_LABEL) || from;
  return { host, port, user, pass, from, label };
}

/** Every fully-configured from-account, for the "Send from" picker. */
export function listEmailAccounts(): EmailAccount[] {
  const ids: EmailAccountId[] = ["primary", "secondary"];
  const accounts: EmailAccount[] = [];
  for (const id of ids) {
    const acct = resolveSmtpAccount(id);
    if (acct) accounts.push({ id, label: acct.label, email: acct.from });
  }
  return accounts;
}

/** True when the given from-account is fully configured. */
export function isAccountConfigured(id: EmailAccountId): boolean {
  return resolveSmtpAccount(id) !== null;
}

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
    /** Which configured SMTP account to send from. Defaults to "primary". */
    accountId?: EmailAccountId;
    includesContract?: boolean;
    cc?: string | string[];
    additionalPdfs?: Array<{ buffer: Buffer; invoiceNumber: string }>;
    /** "onboarding" (default) = new-client email with scope/contract/onboarding
     *  language; "rebill" = recurring monthly client invoice (no scope/contract);
     *  "adaccount" = recurring ad-account invoice (retainer + ad-spend fee). */
    variant?: "onboarding" | "rebill" | "adaccount";
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
  const account = resolveSmtpAccount(options?.accountId ?? "primary");
  if (!account) {
    console.warn(`[invoice-email] SMTP account "${options?.accountId ?? "primary"}" not configured — skipping send`);
    return false;
  }

  // Sanitize invoice number for email headers (prevent header injection)
  const safeNumber = invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100) || "Draft";

  const transport = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.port === 465,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });

  const filename = `invoice-${safeNumber}.pdf`;
  const includesContract = options?.includesContract ?? true;
  const additionalPdfs = options?.additionalPdfs ?? [];
  const hasMultiple = additionalPdfs.length > 0;

  const allNumbers = [safeNumber, ...additionalPdfs.map((p) => p.invoiceNumber.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 100))];
  // Ad-account invoices get an "Ad Account Invoice" subject; everything else
  // (onboarding / client re-bill) keeps the plain "Invoice" subject.
  const subjectNoun = options?.variant === "adaccount" ? "Ad Account Invoice" : "Invoice";
  const subject = hasMultiple
    ? `${subjectNoun}s ${allNumbers.map((n) => `#${n}`).join(", ")} — Agency Collective`
    : `${subjectNoun} #${safeNumber} — Agency Collective`;

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

  const adAccountAttachedPhrase = hasExtraAttachments
    ? `your ad account ${invoiceLabel.toLowerCase()} for this billing cycle ${hasMultiple ? "are" : "is"} attached, along with the supporting files for this cycle.`
    : `your ad account ${invoiceLabel.toLowerCase()} for this billing cycle ${hasMultiple ? "are" : "is"} attached.`;

  const adAccountBody = `
          <p style="line-height: 1.7; margin: 0 0 16px;">Hi there,</p>
          <p style="line-height: 1.7; margin: 0 0 16px;">
            Thanks for your continued partnership with Agency Collective &mdash; ${adAccountAttachedPhrase} It covers your monthly retainer and any ad spend fees for this period.
          </p>
          <p style="line-height: 1.7; margin: 0 0 16px;">
            Please review and submit payment at your convenience using the details on the ${invoiceLabel.toLowerCase()}. Keeping your account current ensures uninterrupted delivery across your ad accounts. If you have any questions, just reply to this email and we'll be happy to help.
          </p>
          <p style="line-height: 1.7; margin: 0 0 16px;">We appreciate your business!</p>
          <p style="line-height: 1.7; margin: 0 0 4px;">Best,<br><strong>Ava Morris</strong> | Billing Team</p>`;

  const bodyHtml =
    variant === "rebill"
      ? rebillBody
      : variant === "adaccount"
      ? adAccountBody
      : onboardingBody;

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
      from: account.from,
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
