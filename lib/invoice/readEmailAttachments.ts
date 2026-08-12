import {
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE,
  MAX_TOTAL_ATTACHMENT_SIZE,
  BLOCKED_ATTACHMENT_EXTS,
  attachmentExtension,
} from "./attachments";

export interface EmailAttachment {
  filename: string;
  buffer: Buffer;
  contentType: string;
}

export type ReadEmailAttachmentsResult =
  | { ok: true; attachments: EmailAttachment[] }
  | { ok: false; error: string; status: number };

/** Cap filenames echoed back in error messages — a 5000-char filename would
 *  otherwise produce a 5000-char error string the toast/banner has to render. */
function shortName(name: string): string {
  return name.length > 80 ? `${name.slice(0, 77)}…` : name;
}

/**
 * Read + validate the free-form `attachments` parts of an invoice-send form
 * (receipts, addendums, supporting docs — sent alongside the invoice PDF).
 * Shared by every invoice send route so count/size/extension enforcement
 * can't drift between them. Validation happens before the SMTP connection is
 * ever opened; each file is materialised to a Buffer for nodemailer. Empty
 * (0-byte) file parts are ignored entirely — they don't count against the
 * count limit and aren't sent (the client picker rejects them up-front).
 */
export async function readEmailAttachments(
  formData: FormData
): Promise<ReadEmailAttachmentsResult> {
  const files = formData
    .getAll("attachments")
    .filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length > MAX_ATTACHMENT_COUNT)
    return {
      ok: false,
      error: `Too many attachments (max ${MAX_ATTACHMENT_COUNT})`,
      status: 400,
    };

  let totalBytes = 0;
  const attachments: EmailAttachment[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_SIZE)
      return {
        ok: false,
        error: `Attachment "${shortName(file.name)}" exceeds ${MAX_ATTACHMENT_SIZE / 1024 / 1024} MB`,
        status: 413,
      };
    totalBytes += file.size;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_SIZE)
      return {
        ok: false,
        error: `Attachments total exceeds ${MAX_TOTAL_ATTACHMENT_SIZE / 1024 / 1024} MB`,
        status: 413,
      };
    const ext = attachmentExtension(file.name);
    if (ext && BLOCKED_ATTACHMENT_EXTS.has(ext))
      return {
        ok: false,
        error: `Attachment type ".${ext}" is not allowed`,
        status: 400,
      };
    attachments.push({
      filename: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
    });
  }
  return { ok: true, attachments };
}
