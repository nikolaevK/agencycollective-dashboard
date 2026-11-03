import type { ZodIssue } from "zod";
import type { InvoiceData } from "@/types/invoice";
import { INITIAL_INVOICE_DATA, invoiceDataSchema } from "@/lib/invoice/validation";

/**
 * Checks an imported (or stored) invoice before it reaches the editor. Checked
 * against the same `invoiceDataSchema` the PDF actions use, but only its SHAPE
 * is enforced here: a missing section or a string where the line items belong
 * would crash the editor, while content the editor itself tolerates in a draft
 * (a blank name, no line items, an invalid email, an over-long note) imports
 * fine — Download / Send flag it before a PDF is made.
 */
export function parseImportedInvoice(
  raw: unknown
): { ok: true; data: InvoiceData } | { ok: false; error: string } {
  const result = invoiceDataSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const broken = result.error.issues.find((issue) => !isContentIssue(issue));
  if (broken) {
    const where = broken.path.join(".");
    // A union's own message is just "Invalid input" — its first arm says why.
    const why =
      broken.code === "invalid_union" ? broken.unionErrors[0]?.issues[0]?.message ?? broken.message : broken.message;
    return { ok: false, error: `Not a valid invoice file — ${where ? `${where}: ` : ""}${why}` };
  }

  // Shape is right, so every required field is there with the right type;
  // only the schema's optional-with-default fields can be missing — fill them.
  const data = raw as InvoiceData;
  return {
    ok: true,
    data: {
      sender: { ...INITIAL_INVOICE_DATA.sender, ...data.sender },
      receiver: { ...INITIAL_INVOICE_DATA.receiver, ...data.receiver },
      details: {
        ...INITIAL_INVOICE_DATA.details,
        ...data.details,
        items: data.details.items.map((item) => ({ ...item, description: item.description ?? "" })),
      },
    },
  };
}

/** Too short/long text or lists and bad email/url formats — content, not shape. */
const CONTENT_CODES = new Set<ZodIssue["code"]>(["too_small", "too_big", "invalid_string"]);

function isContentIssue(issue: ZodIssue): boolean {
  if (CONTENT_CODES.has(issue.code)) return true;
  // `email: z.string().email().or(z.literal(""))`: a non-email string fails
  // both arms without a type error in either; a number fails with one.
  if (issue.code === "invalid_union") {
    return issue.unionErrors.every((err) => err.issues.every(isContentIssue));
  }
  if (issue.code === "invalid_literal") return typeof issue.received === "string";
  return false;
}
