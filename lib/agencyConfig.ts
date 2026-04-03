import { getDb, ensureMigrated } from "./db";
import type { InvoiceSender } from "@/types/invoice";

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
    sql: "UPDATE agency_config SET config_value = ?, updated_at = datetime('now') WHERE config_key = ?",
    args: [value, key],
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

export async function getDefaultLogo(): Promise<string> {
  return (await getAgencyConfig("default_logo")) ?? "";
}

export async function getDefaultThemeColor(): Promise<string> {
  return (await getAgencyConfig("default_theme_color")) ?? "#475569";
}
