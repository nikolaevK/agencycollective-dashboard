import crypto from "crypto";
import { z } from "zod";
import { ensureMigrated, getDb, isUniqueViolation } from "./db";
import {
  findDealContract,
  findDealContractByDealId,
  insertDealContract,
  updateDealContract,
  type DealContractRecord,
} from "./dealContracts";
import {
  countAdditionalContracts,
  deleteAdditionalContract,
  findAdditionalContract,
  findAdditionalContractsByDealId,
  insertAdditionalContract,
  updateAdditionalContract,
  type DealAdditionalContractRecord,
} from "./dealAdditionalContracts";
import { findContractTemplate, readContractTemplates } from "./contractTemplates";
import { docusealArchiveTemplate, docusealCloneTemplate, docusealPut } from "./docuseal/client";
import { fetchDocusealTemplate } from "./dealContractGenerator";
import {
  applyScopeOps,
  byReadingOrder,
  fieldPosKey,
  toScopeFieldView,
  type DsField,
  type DsTemplate,
  type RuleResult,
  type ScopeFieldView,
  type ScopeOps,
} from "./dealPrepRules";

// ---------------------------------------------------------------------------
// A deal contract's SCOPE = the DocuSeal template it will be sent from. Admins
// customize it per deal in the embedded builder, which clones the base
// template (docuseal_template_override_id) and edits read-only text overlays.
// This module does the same server-side so the deal-prep agent (v1/MCP) can:
// read the effective template's fields, and edit / remove / add overlays on a
// per-deal clone. Only contracts that were never sent (status "pending") are
// editable here — resends of sent contracts stay a person's call.
// ---------------------------------------------------------------------------

export type ContractRef =
  | { kind: "primary"; record: DealContractRecord }
  | { kind: "additional"; record: DealAdditionalContractRecord };

export class ContractScopeError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

/** A contract row by id — primary (deal_contracts) or additional. */
export async function findContractRef(id: string): Promise<ContractRef | null> {
  const primary = await findDealContract(id);
  if (primary) return { kind: "primary", record: primary };
  const extra = await findAdditionalContract(id);
  return extra ? { kind: "additional", record: extra } : null;
}

export async function listDealContractRefs(dealId: string): Promise<ContractRef[]> {
  const [primary, additional] = await Promise.all([
    findDealContractByDealId(dealId),
    findAdditionalContractsByDealId(dealId),
  ]);
  return [
    ...(primary ? [{ kind: "primary" as const, record: primary }] : []),
    ...additional.map((record) => ({ kind: "additional" as const, record })),
  ];
}

function assertPending(ref: ContractRef): void {
  if (ref.record.status !== "pending") {
    throw new ContractScopeError(
      `This contract was already sent (status ${ref.record.status}) — only unsent contracts can be prepared. A person handles resends from the dashboard.`,
      409,
      "conflict"
    );
  }
}

async function updateContractRow(
  ref: ContractRef,
  changes: { contractTemplateId?: string | null; docusealTemplateOverrideId: number | null }
): Promise<void> {
  if (ref.kind === "primary") await updateDealContract(ref.record.id, changes);
  else await updateAdditionalContract(ref.record.id, changes);
}

async function assertTemplateExists(contractTemplateId: string | null): Promise<void> {
  if (contractTemplateId && !(await findContractTemplate(contractTemplateId))) {
    throw new ContractScopeError("Contract template not found", 404, "not_found");
  }
}

export interface ContractScope {
  contractId: string;
  dealId: string;
  kind: "primary" | "additional";
  status: string;
  contractTemplateId: string | null;
  templateName: string | null;
  baseDocusealTemplateId: number | null;
  /** The template the contract will be sent from: the per-deal clone when customized, else the base. */
  docusealTemplateId: number | null;
  customized: boolean;
  /** The template's documents in order — a field's `document` is an index into this. */
  documents: { index: number; name: string; url: string | null }[];
  fields: ScopeFieldView[];
}

export interface LoadedTemplate extends DsTemplate {
  id: number;
  submitterUuid: string;
  documents: ContractScope["documents"];
}

/** Read a DocuSeal template into the shape the scope rules work on. */
export async function loadTemplate(id: number): Promise<LoadedTemplate> {
  const t = await fetchDocusealTemplate(id);
  const fields = (Array.isArray(t.fields) ? t.fields : []) as unknown as DsField[];
  const submitter = (Array.isArray(t.submitters) ? t.submitters[0] : undefined) as { uuid?: string } | undefined;
  const schema = (Array.isArray(t.schema) ? t.schema : []) as { attachment_uuid?: string; name?: string }[];
  const rawFiles = (t as Record<string, unknown>).documents;
  const files = (Array.isArray(rawFiles) ? rawFiles : []) as { uuid?: string; filename?: string; url?: string }[];
  const attachments = schema.map((s) => s.attachment_uuid ?? "");
  return {
    id,
    fields,
    attachments,
    submitterUuid: submitter?.uuid ?? "",
    documents: attachments.map((uuid, index) => {
      const file = files.find((d) => d.uuid === uuid);
      return { index, name: file?.filename ?? schema[index]?.name ?? "document.pdf", url: file?.url ?? null };
    }),
  };
}

async function scopeFrom(ref: ContractRef, loaded: LoadedTemplate | null): Promise<ContractScope> {
  const template = ref.record.contractTemplateId ? await findContractTemplate(ref.record.contractTemplateId) : null;
  return {
    contractId: ref.record.id,
    dealId: ref.record.dealId,
    kind: ref.kind,
    status: ref.record.status,
    contractTemplateId: ref.record.contractTemplateId,
    templateName: template?.name ?? null,
    baseDocusealTemplateId: template?.docusealTemplateId ?? null,
    docusealTemplateId: loaded?.id ?? null,
    customized: ref.record.docusealTemplateOverrideId != null,
    documents: loaded?.documents ?? [],
    fields: loaded ? [...loaded.fields].sort(byReadingOrder(loaded)).map((f) => toScopeFieldView(loaded, f)) : [],
  };
}

/** The effective DocuSeal template id a contract sends from (null = no template chosen). */
async function effectiveTemplateId(ref: ContractRef): Promise<number | null> {
  if (ref.record.docusealTemplateOverrideId != null) return ref.record.docusealTemplateOverrideId;
  if (!ref.record.contractTemplateId) return null;
  const template = await findContractTemplate(ref.record.contractTemplateId);
  return template?.docusealTemplateId ?? null;
}

export async function getContractScope(ref: ContractRef): Promise<ContractScope> {
  const id = await effectiveTemplateId(ref);
  return scopeFrom(ref, id != null ? await loadTemplate(id) : null);
}

/**
 * Point the contract at its per-deal copy — only while it has none and is
 * still unsent, so a concurrent clone (builder or another call) or a send
 * can't be overwritten.
 */
async function claimOverride(ref: ContractRef, cloneId: number): Promise<boolean> {
  await ensureMigrated();
  const table = ref.kind === "primary" ? "deal_contracts" : "deal_additional_contracts";
  const res = await getDb().execute({
    sql: `UPDATE ${table} SET docuseal_template_override_id = ?, updated_at = datetime('now')
          WHERE id = ? AND docuseal_template_override_id IS NULL AND status = 'pending'`,
    args: [cloneId, ref.record.id],
  });
  return (res.rowsAffected ?? 0) > 0;
}

/**
 * Archive a per-deal copy no contract points at any more (template changed,
 * scope reset, contract deleted, or a lost clone race). Never a base template
 * or a copy another contract still uses. Best-effort: an orphan is clutter.
 */
async function archiveClone(id: number | null): Promise<void> {
  if (id == null) return;
  try {
    await ensureMigrated();
    const [inUse, templates] = await Promise.all([
      getDb().execute({
        sql: `SELECT 1 FROM deal_contracts WHERE docuseal_template_override_id = ?
              UNION ALL SELECT 1 FROM deal_additional_contracts WHERE docuseal_template_override_id = ? LIMIT 1`,
        args: [id, id],
      }),
      readContractTemplates(),
    ]);
    if (inUse.rows.length > 0 || templates.some((t) => t.docusealTemplateId === id)) return;
    await docusealArchiveTemplate(id);
  } catch (err) {
    console.error("[dealContractScope] archiving an unused contract copy failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * The per-deal clone, creating it on first edit (same as the builder's
 * "Edit Contract": base edits must never leak into other deals' contracts).
 */
async function ensureClone(ref: ContractRef): Promise<number> {
  if (ref.record.docusealTemplateOverrideId != null) return ref.record.docusealTemplateOverrideId;
  if (!ref.record.contractTemplateId) {
    throw new ContractScopeError("Choose a contract template first (updateDealContract)", 400, "invalid_request");
  }
  const template = await findContractTemplate(ref.record.contractTemplateId);
  if (!template) throw new ContractScopeError("Contract template not found", 404, "not_found");
  const cloned = await docusealCloneTemplate(template.docusealTemplateId, template.name);
  if (await claimOverride(ref, cloned.id)) {
    ref.record.docusealTemplateOverrideId = cloned.id;
    return cloned.id;
  }
  // Lost a race — someone else cloned first, or the contract was just sent.
  await archiveClone(cloned.id);
  const fresh = await findContractRef(ref.record.id);
  if (!fresh) throw new ContractScopeError("Contract not found", 404, "not_found");
  Object.assign(ref.record, fresh.record);
  assertPending(ref);
  if (ref.record.docusealTemplateOverrideId == null) {
    throw new ContractScopeError("The contract changed while it was being edited — try again", 409, "conflict");
  }
  return ref.record.docusealTemplateOverrideId;
}

const PutTemplateResponse = z.object({ id: z.number() }).passthrough();

/**
 * A clone gets NEW field uuids, but an agent usually read the scope before
 * the first edit (= the base template's uuids). Map any uuid the clone
 * doesn't know from the base by position; unknown ones stay as-is (and fail
 * validation with a clear error).
 */
async function translateBaseUuids(ref: ContractRef, clone: LoadedTemplate, ops: ScopeOps): Promise<ScopeOps> {
  const known = new Set(clone.fields.map((f) => f.uuid));
  const referenced = [...(ops.edits ?? []).map((e) => e.uuid), ...(ops.remove ?? [])];
  if (referenced.every((u) => known.has(u)) || !ref.record.contractTemplateId) return ops;
  const template = await findContractTemplate(ref.record.contractTemplateId);
  if (!template) return ops;
  const base = await loadTemplate(template.docusealTemplateId);
  const cloneByPos = new Map(clone.fields.map((f) => [`${fieldPosKey(clone, f)}|${f.type}`, f.uuid]));
  const map = new Map<string, string>();
  for (const f of base.fields) {
    const target = cloneByPos.get(`${fieldPosKey(base, f)}|${f.type}`);
    if (target) map.set(f.uuid, target);
  }
  const t = (u: string) => (known.has(u) ? u : (map.get(u) ?? u));
  return {
    ...ops,
    ...(ops.edits ? { edits: ops.edits.map((e) => ({ ...e, uuid: t(e.uuid) })) } : {}),
    ...(ops.remove ? { remove: ops.remove.map(t) } : {}),
  };
}

/** Edit / remove / add overlay fields on the contract's per-deal clone. */
export async function updateContractScope(ref: ContractRef, ops: ScopeOps): Promise<ContractScope> {
  assertPending(ref);
  const cloneId = await ensureClone(ref);
  const loaded = await loadTemplate(cloneId);
  const translated = await translateBaseUuids(ref, loaded, ops);
  const applied: RuleResult<DsField[]> = applyScopeOps(loaded, loaded.submitterUuid, translated, () => crypto.randomUUID());
  if (!applied.ok) throw new ContractScopeError(applied.error, 400, "invalid_request");
  // Not in DocuSeal's published docs, but the update endpoint applies `fields`
  // (their open-source Api::TemplatesController permits it; verified live
  // 2026-10-26: edit, remove and add all persist). The array REPLACES the
  // template's fields, so it always carries every field.
  await docusealPut(`/templates/${cloneId}`, { fields: applied.value }, PutTemplateResponse, { retries: 1 });
  return scopeFrom(ref, await loadTemplate(cloneId));
}

/** Drop the per-deal customization: the contract sends from its base template again. */
export async function resetContractScope(ref: ContractRef): Promise<ContractScope> {
  assertPending(ref);
  const previous = ref.record.docusealTemplateOverrideId;
  await updateContractRow(ref, { docusealTemplateOverrideId: null });
  ref.record.docusealTemplateOverrideId = null;
  await archiveClone(previous);
  return getContractScope(ref);
}

/** Pick the contract template (pending only). Clears any per-deal customization. */
export async function setContractTemplate(ref: ContractRef, contractTemplateId: string | null): Promise<void> {
  assertPending(ref);
  await assertTemplateExists(contractTemplateId);
  const previous = ref.record.docusealTemplateOverrideId;
  await updateContractRow(ref, { contractTemplateId, docusealTemplateOverrideId: null });
  ref.record.contractTemplateId = contractTemplateId;
  ref.record.docusealTemplateOverrideId = null;
  await archiveClone(previous);
}

async function createdRef(id: string): Promise<ContractRef> {
  const ref = await findContractRef(id);
  if (!ref) throw new ContractScopeError("Could not create the contract", 500, "internal_error");
  return ref;
}

/**
 * Add an unsent contract to a deal: its first contract becomes the primary,
 * later ones additional contracts (max 10). The template is checked first, so
 * a bad id leaves nothing behind. ensureDealPaperwork only creates a primary
 * when the deal has a client email and a template matches its services.
 */
export async function addDealContract(
  dealId: string,
  contractTemplateId: string | null,
  createdBy: string
): Promise<ContractRef> {
  await assertTemplateExists(contractTemplateId);
  const id = crypto.randomUUID();
  if (!(await findDealContractByDealId(dealId))) {
    try {
      await insertDealContract({ id, dealId, contractTemplateId, status: "pending", createdBy });
      return createdRef(id);
    } catch (err) {
      // A concurrent add created the primary first — this one is additional.
      if (!isUniqueViolation(err)) throw err;
    }
  }
  const existing = await countAdditionalContracts(dealId);
  if (existing >= 10) throw new ContractScopeError("Maximum of 10 additional contracts per deal", 400, "invalid_request");
  await insertAdditionalContract({ id, dealId, contractTemplateId, sortOrder: existing, createdBy });
  return createdRef(id);
}

/** Remove an additional contract that was never sent (no DocuSeal submission to archive). */
export async function deletePendingAdditionalContract(ref: ContractRef): Promise<void> {
  if (ref.kind !== "additional") {
    throw new ContractScopeError("The primary contract can't be deleted — set its template to null instead", 400, "invalid_request");
  }
  assertPending(ref);
  await deleteAdditionalContract(ref.record.id);
  await archiveClone(ref.record.docusealTemplateOverrideId);
}

/** Template catalog for agents: local mappings only (name → DocuSeal base). */
export async function contractTemplateCatalog(): Promise<{ id: string; name: string; docusealTemplateId: number }[]> {
  const templates = await readContractTemplates();
  return templates.map((t) => ({ id: t.id, name: t.name, docusealTemplateId: t.docusealTemplateId }));
}
