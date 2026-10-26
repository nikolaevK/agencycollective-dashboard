import { getDb, ensureMigrated, sqlIn } from "./db";
import { businessTodayYmd } from "./businessTime";
import { findDeal, type DealRecord } from "./deals";
import { findDealInvoiceByDealId, type DealInvoiceRecord } from "./dealInvoices";
import { findAdditionalInvoicesByDealId, type DealAdditionalInvoiceRecord } from "./dealAdditionalInvoices";
import { findContractTemplate } from "./contractTemplates";
import { listDealContractRefs, loadTemplate, type ContractRef, type LoadedTemplate } from "./dealContractScope";
import { invoiceToSpec, type InvoiceSpec } from "./invoice/invoiceSpec";
import {
  clip,
  diffTemplateFields,
  exemplarScore,
  fieldPosKey,
  isAgencyField,
  parseJson,
  ymdDaysBefore,
  type PaperworkSnapshot,
  type SnapshotContract,
  type SnapshotInvoice,
} from "./dealPrepRules";
import type { InvoiceData } from "@/types/invoice";

// ---------------------------------------------------------------------------
// Exemplars = what ACTUALLY went out for past deals. They are the deal-prep
// agent's worked examples, so its behavior tracks current practice without
// any training step: every invoice send records one (with the reviewer's
// corrections when the agent had prepared the deal), and history is
// backfilled once from the per-deal DocuSeal clones admins already made.
// ---------------------------------------------------------------------------

/** A deal's paperwork records: primary + additional invoices and every contract. */
export interface DealPaperwork {
  primary: DealInvoiceRecord | null;
  additional: DealAdditionalInvoiceRecord[];
  contracts: ContractRef[];
}

export async function loadDealPaperwork(dealId: string): Promise<DealPaperwork> {
  const [primary, additional, contracts] = await Promise.all([
    findDealInvoiceByDealId(dealId),
    findAdditionalInvoicesByDealId(dealId),
    listDealContractRefs(dealId),
  ]);
  return { primary, additional, contracts };
}

function snapshotInvoice(
  kind: "primary" | "additional",
  rec: { id: string; invoiceNumber: string; status: string; invoiceData: InvoiceData }
): SnapshotInvoice {
  // A corrupt invoice_data row parses to {} (lib/dealInvoices.ts).
  const spec: InvoiceSpec = rec.invoiceData?.details ? invoiceToSpec(rec.invoiceData) : {};
  return {
    kind,
    id: rec.id,
    number: rec.invoiceNumber,
    status: rec.status,
    invoiceDate: spec.invoiceDate ?? "",
    dueDate: spec.dueDate ?? "",
    terms: spec.terms ?? "",
    paymentTerms: spec.paymentTerms ?? "",
    notes: spec.notes ?? "",
    discount: spec.discount ?? null,
    items: (spec.items ?? []).map((i) => ({ name: i.name, quantity: i.quantity ?? 1, unitPriceCents: i.unitPriceCents })),
    totalCents: Math.round((rec.invoiceData?.details?.totalAmount ?? 0) * 100),
  };
}

type TemplateCache = Map<number, Promise<LoadedTemplate>>;

function cachedTemplate(cache: TemplateCache, id: number): Promise<LoadedTemplate> {
  let hit = cache.get(id);
  if (!hit) {
    hit = loadTemplate(id);
    cache.set(id, hit);
  }
  return hit;
}

/**
 * The deal's paperwork as it stands: invoice lines + each contract's per-deal
 * scope values. `withBaseDiff`: customized contracts also carry their edits vs
 * the base template (one extra DocuSeal GET per distinct base). `sentOnly`:
 * only what went out (sent invoices, contracts past pending). A template that
 * can't be read marks its contract `unreadable` — unknown, never "no fields".
 */
export async function buildPaperworkSnapshot(
  paperwork: DealPaperwork,
  opts: { withBaseDiff: boolean; sentOnly?: boolean; cache?: TemplateCache }
): Promise<PaperworkSnapshot> {
  const cache = opts.cache ?? new Map();
  const invoices: SnapshotInvoice[] = [
    ...(paperwork.primary ? [snapshotInvoice("primary", paperwork.primary)] : []),
    ...paperwork.additional.map((a) => snapshotInvoice("additional", a)),
  ].filter((i) => !opts.sentOnly || i.status === "sent");

  const contracts = paperwork.contracts.filter((ref) => !opts.sentOnly || ref.record.status !== "pending");
  const contractSnaps = await Promise.all(
    contracts.map(async (ref): Promise<SnapshotContract> => {
      const template = ref.record.contractTemplateId ? await findContractTemplate(ref.record.contractTemplateId) : null;
      const effectiveId = ref.record.docusealTemplateOverrideId ?? template?.docusealTemplateId ?? null;
      const snap: SnapshotContract = {
        kind: ref.kind,
        id: ref.record.id,
        status: ref.record.status,
        templateId: ref.record.contractTemplateId,
        templateName: template?.name ?? null,
        fields: {},
        changesFromBase: null,
        documentNames: [],
      };
      if (effectiveId == null) return snap;
      try {
        const t = await cachedTemplate(cache, effectiveId);
        snap.documentNames = t.documents.map((d) => d.name);
        for (const f of t.fields) {
          if (isAgencyField(f)) snap.fields[fieldPosKey(t, f)] = { type: f.type, value: String(f.default_value ?? "") };
          else if (f.type === "initials" || f.type === "date") snap.fields[fieldPosKey(t, f)] = { type: f.type, value: "" };
        }
        if (opts.withBaseDiff && template && ref.record.docusealTemplateOverrideId != null) {
          snap.changesFromBase = diffTemplateFields(await cachedTemplate(cache, template.docusealTemplateId), t);
        }
      } catch (err) {
        snap.unreadable = true;
        console.error("[dealPrepExemplars] template read failed:", err instanceof Error ? err.message : err);
      }
      return snap;
    })
  );
  return { invoices, contracts: contractSnaps };
}

export async function upsertExemplar(
  deal: DealRecord,
  paperwork: PaperworkSnapshot,
  opts: { corrections: string[] | null; source: "send" | "backfill" }
): Promise<void> {
  await ensureMigrated();
  await getDb().execute({
    sql: `INSERT INTO deal_prep_exemplars
            (deal_id, client_name, deal_value, industry, service_category, notes, paperwork, corrections, source, captured_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(deal_id) DO UPDATE SET
            client_name = excluded.client_name, deal_value = excluded.deal_value, industry = excluded.industry,
            service_category = excluded.service_category, notes = excluded.notes, paperwork = excluded.paperwork,
            corrections = COALESCE(excluded.corrections, deal_prep_exemplars.corrections),
            source = excluded.source, captured_at = excluded.captured_at`,
    args: [
      deal.id,
      deal.clientName,
      deal.dealValue,
      deal.industry,
      deal.serviceCategory,
      deal.notes,
      JSON.stringify(paperwork),
      opts.corrections && opts.corrections.length > 0 ? JSON.stringify(opts.corrections) : null,
      opts.source,
    ],
  });
}

// ---------------------------------------------------------------------------
// Retrieval for the agent's context
// ---------------------------------------------------------------------------

export interface ExemplarView {
  dealId: string;
  clientName: string | null;
  dealValueCents: number;
  industry: string | null;
  services: string | null;
  notes: string;
  sent: {
    invoices: { kind: string; invoiceDate: string; dueDate: string; items: SnapshotInvoice["items"]; discount: SnapshotInvoice["discount"]; notes: string }[];
    /** customized: null = the contract couldn't be read when it was recorded. */
    contracts: { kind: string; templateName: string | null; customized: boolean | null; changesFromBase: SnapshotContract["changesFromBase"] }[];
  };
  reviewerCorrectionsToAgent: string[] | null;
  capturedAt: string;
  score: number;
}

/**
 * The most similar past deals (by notes/services/value — see exemplarScore),
 * plus the latest reviewer corrections of agent work (always included: they
 * are the freshest signal of what the agent gets wrong). `closerIds` limits
 * both to a resource-scoped token's closers; deleted deals never show.
 */
export async function findExemplarsFor(
  deal: Pick<DealRecord, "id" | "notes" | "serviceCategory" | "industry" | "dealValue">,
  opts: { closerIds?: string[] | null; limit?: number; poolSize?: number } = {}
): Promise<{ examples: ExemplarView[]; lessons: { dealId: string; clientName: string | null; corrections: string[] }[] }> {
  await ensureMigrated();
  const db = getDb();
  const closer = opts.closerIds ? sqlIn("d.closer_id", opts.closerIds) : null;
  // Scored on the light columns; the paperwork JSON is read only for the deals shown.
  const rows = (
    await db.execute({
      sql: `SELECT e.deal_id, e.client_name, e.deal_value, e.industry, e.service_category, e.notes, e.corrections, e.captured_at
            FROM deal_prep_exemplars e JOIN deals d ON d.id = e.deal_id
            WHERE e.deal_id != ?${closer ? ` AND ${closer.sql}` : ""}
            ORDER BY e.captured_at DESC LIMIT ?`,
      args: [deal.id, ...(closer?.args ?? []), opts.poolSize ?? 300],
    })
  ).rows;

  const scored = rows
    .map((r, i) => {
      const signal = {
        notes: r.notes != null ? String(r.notes) : null,
        serviceCategory: r.service_category != null ? String(r.service_category) : null,
        industry: r.industry != null ? String(r.industry) : null,
        dealValue: Number(r.deal_value ?? 0),
      };
      // Slight recency tie-break: practice drifts (pricing, templates).
      return { r, score: exemplarScore(deal, signal) + 0.05 * (1 - i / Math.max(rows.length, 1)) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 6);

  const ids = scored.map(({ r }) => String(r.deal_id));
  const top = sqlIn("deal_id", ids);
  const paperworkById = new Map(
    ids.length === 0
      ? []
      : (await db.execute({ sql: `SELECT deal_id, paperwork FROM deal_prep_exemplars WHERE ${top.sql}`, args: top.args })).rows.map(
          (r) => [String(r.deal_id), parseJson<PaperworkSnapshot>(r.paperwork)] as const
        )
  );

  const examples = scored.map(({ r, score }): ExemplarView => {
    // A corrupt row shows the notes only.
    const paperwork = paperworkById.get(String(r.deal_id)) ?? { invoices: [], contracts: [] };
    return {
      dealId: String(r.deal_id),
      clientName: r.client_name != null ? String(r.client_name) : null,
      dealValueCents: Number(r.deal_value ?? 0),
      industry: r.industry != null ? String(r.industry) : null,
      services: r.service_category != null ? String(r.service_category) : null,
      notes: clip(String(r.notes ?? ""), 1500),
      sent: {
        invoices: paperwork.invoices.map((i) => ({
          kind: i.kind,
          invoiceDate: i.invoiceDate,
          dueDate: i.dueDate,
          items: i.items,
          discount: i.discount,
          notes: i.notes,
        })),
        contracts: paperwork.contracts.map((c) => ({
          kind: c.kind,
          templateName: c.templateName,
          customized: c.unreadable ? null : !!c.changesFromBase,
          changesFromBase: c.changesFromBase,
        })),
      },
      reviewerCorrectionsToAgent: parseJson<string[]>(r.corrections),
      capturedAt: String(r.captured_at),
      score: Math.round(score * 100) / 100,
    };
  });
  const lessons = rows
    .map((r) => ({ dealId: String(r.deal_id), clientName: r.client_name != null ? String(r.client_name) : null, corrections: parseJson<string[]>(r.corrections) ?? [] }))
    .filter((l) => l.corrections.length > 0)
    .slice(0, 8);
  return { examples, lessons };
}

// ---------------------------------------------------------------------------
// Backfill ("Learn from past deals")
// ---------------------------------------------------------------------------

/** "Learn from past deals" records sent deals closed this recently — current practice only. */
export const DEAL_PREP_LEARN_DAYS = 30;

/** Keyset position in the newest-first walk over sent deals. */
export interface BackfillCursor {
  createdAt: string;
  id: string;
}

/**
 * Capture exemplars for already-sent deals closed in the last
 * DEAL_PREP_LEARN_DAYS that don't have one yet, newest first, `limit` per call (each customized contract costs DocuSeal GETs),
 * continuing after `cursor`. A deal whose templates can't be read is skipped
 * (failed), not recorded half-empty, and is retried by a later pass. `next` is
 * null once the walk is done.
 */
export async function backfillExemplars(
  limit: number,
  cursor: BackfillCursor | null
): Promise<{ captured: number; failed: number; remaining: number; next: BackfillCursor | null }> {
  await ensureMigrated();
  const db = getDb();
  const since = ymdDaysBefore(businessTodayYmd(), DEAL_PREP_LEARN_DAYS);
  const pendingSql = `FROM deals d JOIN deal_invoices i ON i.deal_id = d.id
                      WHERE i.status = 'sent' AND COALESCE(d.closing_date, substr(d.created_at, 1, 10)) >= ?
                        AND NOT EXISTS (SELECT 1 FROM deal_prep_exemplars e WHERE e.deal_id = d.id)`;
  const rows = (
    await db.execute({
      sql: `SELECT d.id, d.created_at ${pendingSql}
            ${cursor ? "AND (d.created_at < ? OR (d.created_at = ? AND d.id < ?))" : ""}
            ORDER BY d.created_at DESC, d.id DESC LIMIT ?`,
      args: [since, ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : []), limit],
    })
  ).rows;

  const cache: TemplateCache = new Map();
  let captured = 0;
  let failed = 0;
  // Sequential: keeps DocuSeal request bursts small; the base-template cache
  // makes later deals cheap.
  for (const row of rows) {
    const id = String(row.id);
    try {
      const deal = await findDeal(id);
      if (!deal) continue;
      const paperwork = await buildPaperworkSnapshot(await loadDealPaperwork(id), { withBaseDiff: true, sentOnly: true, cache });
      if (paperwork.contracts.some((c) => c.unreadable)) {
        failed++;
        continue;
      }
      await upsertExemplar(deal, paperwork, { corrections: null, source: "backfill" });
      captured++;
    } catch (err) {
      failed++;
      console.error("[dealPrepExemplars] backfill failed for a deal:", err instanceof Error ? err.message : err);
    }
  }
  const remaining = Number((await db.execute({ sql: `SELECT COUNT(*) AS n ${pendingSql}`, args: [since] })).rows[0]?.n ?? 0);
  const last = rows[rows.length - 1];
  return {
    captured,
    failed,
    remaining,
    next: rows.length === limit && last ? { createdAt: String(last.created_at), id: String(last.id) } : null,
  };
}

export async function exemplarCount(): Promise<number> {
  await ensureMigrated();
  const res = await getDb().execute("SELECT COUNT(*) AS n FROM deal_prep_exemplars e JOIN deals d ON d.id = e.deal_id");
  return Number(res.rows[0]?.n ?? 0);
}
