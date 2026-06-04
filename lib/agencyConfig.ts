import { getDb, ensureMigrated } from "./db";
import type { InvoiceSender } from "@/types/invoice";
import type { PaymentType, PaymentInfo } from "@/types/invoice";
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

export async function deleteAgencyConfig(key: string): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({ sql: "DELETE FROM agency_config WHERE config_key = ?", args: [key] });
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

// ── Ad-account invoice payment (dedicated, editable in the Ad Accounts tab) ──
// Ad-account invoices are paid into a DIFFERENT bank account than deal /
// client-rebill invoices. These live under their OWN config keys, so editing
// them in the Ad Accounts → Payment settings modal never touches the shared
// templates. Until an admin saves custom values, ad-account invoices fall back
// to the shared template with the account + routing below overlaid.
export const AD_ACCOUNT_DEFAULT_ACCOUNT_NUMBER = "919648154887845";
export const AD_ACCOUNT_DEFAULT_ROUTING_NUMBER = "121145433";

function adAccountPaymentKey(type: PaymentType): string {
  return type === "international"
    ? "ad_account_payment_template_international"
    : "ad_account_payment_template_local";
}

/** True once an admin has saved a custom ad-account payment template. */
export async function isAdAccountPaymentConfigured(type: PaymentType): Promise<boolean> {
  return (await getAgencyConfig(adAccountPaymentKey(type))) != null;
}

/**
 * Resolve the ad-account invoice payment block for `type`. Returns the admin-
 * saved template when present; otherwise the shared agency template with the
 * dedicated ad-account account + routing overlaid (the out-of-the-box default).
 */
export async function getAdAccountPaymentTemplate(type: PaymentType): Promise<PaymentInfo> {
  const raw = await getAgencyConfig(adAccountPaymentKey(type));
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // Only trust a plain object — a corrupted value that parses to a string
      // or array would otherwise spread junk (index keys) into the template.
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...emptyPaymentInfo(type), ...parsed, paymentType: type };
      }
    } catch {
      /* fall through to default */
    }
  }
  const shared = await getPaymentTemplate(type);
  return {
    ...shared,
    accountNumber: AD_ACCOUNT_DEFAULT_ACCOUNT_NUMBER,
    routingNumber: AD_ACCOUNT_DEFAULT_ROUTING_NUMBER,
    paymentType: type,
  };
}

/** Both ad-account payment blocks + whether each is admin-customized. */
export async function getAdAccountPaymentTemplates(): Promise<{
  local: PaymentInfo;
  international: PaymentInfo;
  configured: { local: boolean; international: boolean };
}> {
  const [local, international, cl, ci] = await Promise.all([
    getAdAccountPaymentTemplate("local"),
    getAdAccountPaymentTemplate("international"),
    isAdAccountPaymentConfigured("local"),
    isAdAccountPaymentConfigured("international"),
  ]);
  return { local, international, configured: { local: cl, international: ci } };
}

/** Persist a custom ad-account payment block for one type. */
export async function setAdAccountPaymentTemplate(
  type: PaymentType,
  info: PaymentInfo
): Promise<void> {
  await updateAgencyConfig(
    adAccountPaymentKey(type),
    JSON.stringify({ ...info, paymentType: type })
  );
}

/** Clear a custom ad-account template → revert that type to the shared default. */
export async function resetAdAccountPaymentTemplate(type: PaymentType): Promise<void> {
  await deleteAgencyConfig(adAccountPaymentKey(type));
}

export async function getDefaultLogo(): Promise<string> {
  return (await getAgencyConfig("default_logo")) ?? "";
}

export async function getDefaultThemeColor(): Promise<string> {
  return (await getAgencyConfig("default_theme_color")) ?? "#475569";
}
