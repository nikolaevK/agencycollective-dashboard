import { businessTodayYmd } from "@/lib/businessTime";

/** The slice of an awaiting-payment invoice the send drawers show. */
export interface OpenInvoiceRef {
  id: string;
  invoiceNumber: string;
  cycleAnchor: string;
  sentAt: string;
}

/** Narrow full invoice rows (client re-bill or ad-account) to OpenInvoiceRef. */
export function toOpenInvoiceRefs(
  invoices: ReadonlyArray<OpenInvoiceRef>
): OpenInvoiceRef[] {
  return invoices.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    cycleAnchor: i.cycleAnchor,
    sentAt: i.sentAt,
  }));
}

/**
 * Split an owner's awaiting invoices against the cycle a send will be
 * recorded under (`cycle` null = unscheduled → the send route anchors to the
 * business "today"):
 *   replaced     — same cycle date: the server supersedes these automatically
 *   others       — every other cycle: kept unless the admin ticks Replace
 *   sameMonthIds — `others` in the SAME month as the send (the cycle date moved,
 *                  e.g. a billing-day change): almost always a re-issue, so the
 *                  drawers pre-tick them — otherwise one month ends up with two
 *                  open invoices
 */
export function splitOpenInvoices(
  open: ReadonlyArray<OpenInvoiceRef>,
  cycle: string | null
): { replaced: OpenInvoiceRef[]; others: OpenInvoiceRef[]; sameMonthIds: string[] } {
  const effective = cycle || businessTodayYmd();
  const replaced = open.filter((i) => i.cycleAnchor === effective);
  const others = open.filter((i) => i.cycleAnchor !== effective);
  const month = effective.slice(0, 7);
  const sameMonthIds = others
    .filter((i) => i.cycleAnchor.slice(0, 7) === month)
    .map((i) => i.id);
  return { replaced, others, sameMonthIds };
}
