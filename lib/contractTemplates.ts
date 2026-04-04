import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";

export interface ContractTemplateRecord {
  id: string;
  name: string;
  docusealTemplateId: number;
  serviceKeys: string[] | null; // parsed JSON array
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

function rowToTemplate(row: Row): ContractTemplateRecord {
  let serviceKeys: string[] | null = null;
  if (row.service_keys) {
    try {
      serviceKeys = JSON.parse(String(row.service_keys));
    } catch {
      serviceKeys = null;
    }
  }

  return {
    id: String(row.id),
    name: String(row.name),
    docusealTemplateId: Number(row.docuseal_template_id),
    serviceKeys,
    isDefault: Number(row.is_default) === 1,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function readContractTemplates(): Promise<ContractTemplateRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT * FROM contract_templates ORDER BY is_default DESC, name");
  return result.rows.map(rowToTemplate);
}

export async function findContractTemplate(id: string): Promise<ContractTemplateRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT * FROM contract_templates WHERE id = ?", args: [id] });
  return result.rows[0] ? rowToTemplate(result.rows[0]) : null;
}

export async function insertContractTemplate(template: {
  id: string;
  name: string;
  docusealTemplateId: number;
  serviceKeys?: string[] | null;
  isDefault?: boolean;
}): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO contract_templates (id, name, docuseal_template_id, service_keys, is_default)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      template.id,
      template.name,
      template.docusealTemplateId,
      template.serviceKeys ? JSON.stringify(template.serviceKeys) : null,
      template.isDefault ? 1 : 0,
    ],
  });
}

export async function updateContractTemplate(
  id: string,
  changes: {
    name?: string;
    docusealTemplateId?: number;
    serviceKeys?: string[] | null;
    isDefault?: boolean;
  }
): Promise<void> {
  const fields: string[] = [];
  const args: (string | number | null)[] = [];

  if (changes.name !== undefined) { fields.push("name = ?"); args.push(changes.name); }
  if (changes.docusealTemplateId !== undefined) { fields.push("docuseal_template_id = ?"); args.push(changes.docusealTemplateId); }
  if (changes.serviceKeys !== undefined) { fields.push("service_keys = ?"); args.push(changes.serviceKeys ? JSON.stringify(changes.serviceKeys) : null); }
  if (changes.isDefault !== undefined) { fields.push("is_default = ?"); args.push(changes.isDefault ? 1 : 0); }

  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  args.push(id);

  await ensureMigrated();
  const db = getDb();
  await db.execute({ sql: `UPDATE contract_templates SET ${fields.join(", ")} WHERE id = ?`, args });
}

export async function deleteContractTemplate(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM contract_templates WHERE id = ?", args: [id] });
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Find the best matching template for a set of service keys.
 * Strategy: find template whose service_keys overlap with the given keys.
 * Fallback: return the default template (is_default=1).
 */
export async function findTemplateForServices(serviceKeys: string[]): Promise<ContractTemplateRecord | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT * FROM contract_templates ORDER BY is_default DESC, name");
  const templates = result.rows.map(rowToTemplate);

  if (templates.length === 0) return null;

  // Try to find a template with overlapping service keys
  if (serviceKeys.length > 0) {
    const lowerKeys = serviceKeys.map((k) => k.toLowerCase());
    for (const tmpl of templates) {
      if (tmpl.serviceKeys && tmpl.serviceKeys.length > 0) {
        const tmplLower = tmpl.serviceKeys.map((k) => k.toLowerCase());
        const overlap = tmplLower.some((k) => lowerKeys.includes(k));
        if (overlap) return tmpl;
      }
    }
  }

  // Fallback to default template
  const defaultTmpl = templates.find((t) => t.isDefault);
  return defaultTmpl ?? null;
}
