import { getDb, ensureMigrated } from "./db";
import type { InvoiceSender } from "@/types/invoice";
import type { PaymentType } from "@/types/invoice";
import { emptyPaymentInfo, parsePaymentNoteToPaymentInfo } from "@/lib/invoice/paymentUtils";

export { parsePaymentNoteToPaymentInfo } from "@/lib/invoice/paymentUtils";

export interface AgencyConfigRecord {
  id: string;
  configKey: string;
  configValue: string;
  updatedAt: string;
}

export async function getAgencyConfig(key: string): Promise<string | null> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "SELECT config_value FROM agency_config WHERE config_key = ?", args: [key] });
  return result.rows[0] ? String(result.rows[0].config_value) : null;
}

export async function getAllAgencyConfigs(): Promise<AgencyConfigRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT * FROM agency_config ORDER BY config_key");
  return result.rows.map((row) => ({
    id: String(row.id),
    configKey: String(row.config_key),
    configValue: String(row.config_value),
    updatedAt: String(row.updated_at),
  }));
}

export async function updateAgencyConfig(key: string, value: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO agency_config (id, config_key, config_value, updated_at) VALUES (lower(hex(randomblob(16))), ?, ?, datetime('now'))
          ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = excluded.updated_at`,
    args: [key, value],
  });
}

export async function getAgencySender(): Promise<InvoiceSender> {
  const raw = await getAgencyConfig("sender");
  if (!raw) {
    return { name: "", address: "", city: "", zipCode: "", country: "", email: "", phone: "", customInputs: [] };
  }
  try {
    const parsed = JSON.parse(raw);
    return {
      name: parsed.name ?? "",
      address: parsed.address ?? "",
      city: parsed.city ?? "",
      zipCode: parsed.zipCode ?? "",
      country: parsed.country ?? "",
      email: parsed.email ?? "",
      phone: parsed.phone ?? "",
      customInputs: [],
    };
  } catch {
    return { name: "", address: "", city: "", zipCode: "", country: "", email: "", phone: "", customInputs: [] };
  }
}

export async function getPaymentNote(type: "local" | "international"): Promise<string> {
  const key = type === "international" ? "note_international" : "note_local";
  return (await getAgencyConfig(key)) ?? "";
}

export async function getPaymentTemplate(type: PaymentType) {
  const key = type === "international" ? "payment_template_international" : "payment_template_local";
  const raw = await getAgencyConfig(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return { ...emptyPaymentInfo(type), ...parsed, paymentType: type };
    } catch { /* fall through */ }
  }
  // Fallback: parse old free-text template
  const noteKey = type === "international" ? "note_international" : "note_local";
  const noteText = (await getAgencyConfig(noteKey)) ?? "";
  if (noteText) {
    return parsePaymentNoteToPaymentInfo(noteText, type);
  }
  return emptyPaymentInfo(type);
}

export async function getDefaultLogo(): Promise<string> {
  return (await getAgencyConfig("default_logo")) ?? "";
}

export async function getDefaultThemeColor(): Promise<string> {
  return (await getAgencyConfig("default_theme_color")) ?? "#475569";
}
