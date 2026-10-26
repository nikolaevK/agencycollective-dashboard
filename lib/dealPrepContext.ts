import type { DealRecord } from "./deals";
import { findCloser } from "./closers";
import { readInvoiceServices } from "./invoiceServices";
import { parseServiceCategory } from "./serviceCategory";
import { businessTodayYmd } from "./businessTime";
import { contractTemplateCatalog } from "./dealContractScope";
import { findContractTemplate } from "./contractTemplates";
import { findExemplarsFor, loadDealPaperwork } from "./dealPrepExemplars";
import { getDealPrepPlaybook } from "./dealPrepPlaybook";
import { assertDealPreparable, findDealPrep, presentDealPrep } from "./dealPrep";
import { summarizeDealInvoice } from "./dealInvoiceSummary";
import { dealPrepInputHash } from "./dealPrepRules";

/**
 * The fixed procedure (how to work). Business rules live in the editable
 * playbook; current practice comes from the examples. Returned by
 * getDealPrepContext so the routine's own saved prompt can stay one line and
 * procedure changes ship with the app.
 */
export const DEAL_PREP_INSTRUCTIONS = `You are preparing ONE closed deal's paperwork (draft invoices + DocuSeal contract scopes) for a person at Agency Collective to review and send. Nothing you do emails anyone.

Procedure
1. Read deal.notes (the closer's handoff), playbook, examples (what was ACTUALLY sent for the most similar recent deals — current practice; when they disagree with the playbook, follow the examples and flag it) and lessons (reviewers' corrections of earlier agent work — never repeat those mistakes).
2. Decide the package option(s), prices and add-ons. Empty notes → rely on dealValueCents + services + the closest examples.
3. Invoices (money in integer CENTS, dates yyyy-mm-dd, always pass view: "summary"):
   - Primary: updateDealInvoice(id, invoice: {items, invoiceDate, dueDate, terms, discount?, notes?}, view: "summary"). items REPLACE every line — send the full list, names + descriptions copied from catalog.invoicePresets.
   - Each extra option: createAdditionalInvoice(id: dealId, invoice: {...}, view: "summary"). Remove leftover additional drafts you don't need with deleteAdditionalInvoice.
   - Never set an invoice status.
4. Contracts — one per package option, in the same order as the invoices:
   - No contract yet, or more options than contracts → createDealContract(id: dealId, contractTemplateId). Wrong template → updateDealContract(id: contractId, contractTemplateId).
   - getDealContractScope(id: contractId) lists the template's fields (uuid, page (0-based), x/y/w/h as page fractions, value, hint, editable/removable).
   - updateDealContractScope(id: contractId, edits: [{uuid, value}], remove: [uuid], add: [{type, document?, page, x, y, w, h, value}]) — the first edit makes this deal's own copy; base templates are never changed. Values are the exact text printed on the PDF ("6500 USD", "8", "25000", "$3666/Month"). Templates can hold several documents: a field's "document" indexes the scope's documents list, and an added field goes on document 0 unless you say otherwise. reset: true starts the scope over from its base template.
   - Re-read the scope afterwards and check every value against the invoices and the notes.
5. Finish with submitDealPrep(id: dealId, status, summary, flags, inputHash: prep.inputHash) — inputHash is required:
   - summary: short markdown for the reviewer — each invoice and contract and WHY (quote the notes).
   - flags: [{severity: info|warning|blocker, message}] for anything uncertain, anything the notes asked that you couldn't express, deviations from the playbook, and discrepancies (e.g. the notes' total ≠ dealValue).
   - status "needs_input" when a person must decide something before sending; otherwise "ready".

Rules
- Only touch this deal, and only invoices/contracts that were never sent (invoice status "draft", contract status "pending"). Don't change the deal itself (value, status, email) — flag discrepancies instead.
- Signature fields and client-filled fields are protected. Keep clause language formal and consistent with the invoice numbers.
- If a call answers 409 because the deal changed (inputHash), stop — a fresh run was queued with the new details.`;

/**
 * The agent's working context for one deal — the first call of every run, so
 * it is also the gate: a deal a person is handling (or with nothing to
 * prepare) is refused with a DealPrepError (409). `closerIds` keeps past-deal
 * examples inside a resource-scoped token's closers.
 */
export async function buildDealPrepContext(deal: DealRecord, opts: { closerIds: string[] | null }) {
  const paperwork = await loadDealPaperwork(deal.id);
  await assertDealPreparable(deal, paperwork);

  const [closer, setter, presets, templates, playbook, exemplars, prep] = await Promise.all([
    findCloser(deal.closerId),
    deal.setterId ? findCloser(deal.setterId) : Promise.resolve(null),
    readInvoiceServices(),
    contractTemplateCatalog(),
    getDealPrepPlaybook(),
    findExemplarsFor(deal, { closerIds: opts.closerIds }),
    findDealPrep(deal.id),
  ]);

  const contractViews = await Promise.all(
    paperwork.contracts.map(async (ref) => {
      const t = ref.record.contractTemplateId ? await findContractTemplate(ref.record.contractTemplateId) : null;
      return {
        id: ref.record.id,
        kind: ref.kind,
        status: ref.record.status,
        contractTemplateId: ref.record.contractTemplateId,
        templateName: t?.name ?? null,
        customized: ref.record.docusealTemplateOverrideId != null,
      };
    })
  );

  return {
    instructions: DEAL_PREP_INSTRUCTIONS,
    today: businessTodayYmd(),
    prep: {
      ...(prep ? presentDealPrep(prep) : { status: null }),
      // What submitDealPrep must echo back — the deal as of this read.
      inputHash: dealPrepInputHash(deal),
    },
    deal: {
      id: deal.id,
      status: deal.status,
      clientName: deal.clientName,
      clientEmail: deal.clientEmail,
      brandName: deal.brandName,
      website: deal.website,
      industry: deal.industry,
      services: parseServiceCategory(deal.serviceCategory),
      dealValueCents: deal.dealValue,
      paymentType: deal.paymentType,
      paidStatus: deal.paidStatus,
      closingDate: deal.closingDate,
      closer: closer ? { id: closer.id, name: closer.displayName } : { id: deal.closerId, name: null },
      setter: setter ? { id: setter.id, name: setter.displayName } : null,
      notes: deal.notes ?? "",
    },
    invoices: [
      ...(paperwork.primary ? [summarizeDealInvoice(paperwork.primary, false)] : []),
      ...paperwork.additional.map((a) => summarizeDealInvoice(a, true)),
    ],
    contracts: contractViews,
    catalog: {
      invoicePresets: presets.map((p) => ({
        label: p.internalLabel ?? p.name,
        name: p.name,
        description: p.description,
        rateCents: p.rate,
      })),
      contractTemplates: templates,
    },
    playbook: playbook.text,
    examples: exemplars.examples,
    lessons: exemplars.lessons,
  };
}
