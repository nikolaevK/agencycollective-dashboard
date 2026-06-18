import { getDb, ensureMigrated } from "./db";
import type { Row } from "@libsql/client";
import type { InvoiceSender, PaymentInfo, PaymentType } from "@/types/invoice";
import { emptyPaymentInfo } from "@/lib/invoice/paymentUtils";

/**
 * A saved, reusable agency identity for the standalone Invoice Generator only.
 * Bundles everything that distinguishes one agency's invoice from another:
 * logo, "bill from" sender, theme colour and the two payment templates.
 *
 * This is intentionally separate from the singular `agency_config` (which the
 * deal / client-rebill / ad-account invoice flows share) — these profiles never
 * feed those flows.
 */
export interface AgencyProfileRecord {
  id: string;
  name: string;
  sender: InvoiceSender;
  logo: string;
  themeColor: string;
  paymentLocal: PaymentInfo;
  paymentInternational: PaymentInfo;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Fields an admin can write for a profile (sort order is managed separately). */
export interface AgencyProfileInput {
  name: string;
  sender: InvoiceSender;
  logo: string;
  themeColor: string;
  paymentLocal: PaymentInfo;
  paymentInternational: PaymentInfo;
}

function emptySender(): InvoiceSender {
  return { name: "", address: "", city: "", zipCode: "", country: "", email: "", phone: "", customInputs: [] };
}

function parseSender(raw: unknown): InvoiceSender {
  if (typeof raw !== "string" || !raw) return emptySender();
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === "object" && !Array.isArray(p)) {
      return {
        name: p.name ?? "",
        address: p.address ?? "",
        city: p.city ?? "",
        zipCode: p.zipCode ?? "",
        country: p.country ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        customInputs: [],
      };
    }
  } catch { /* fall through */ }
  return emptySender();
}

function parsePayment(raw: unknown, type: PaymentType): PaymentInfo {
  const base = emptyPaymentInfo(type);
  if (typeof raw !== "string" || !raw) return base;
  try {
    const p = JSON.parse(raw);
    // Only trust a plain object — a corrupted value parsing to a string/array
    // would otherwise spread junk (index keys) into the template.
    if (p && typeof p === "object" && !Array.isArray(p)) {
      return { ...base, ...p, paymentType: type };
    }
  } catch { /* fall through */ }
  return base;
}

/** Serialize a sender for storage — only the agency-level fields, no customInputs. */
function serializeSender(sender: InvoiceSender): string {
  return JSON.stringify({
    name: sender.name ?? "",
    address: sender.address ?? "",
    city: sender.city ?? "",
    zipCode: sender.zipCode ?? "",
    country: sender.country ?? "",
    email: sender.email ?? "",
    phone: sender.phone ?? "",
  });
}

function serializePayment(info: PaymentInfo, type: PaymentType): string {
  return JSON.stringify({ ...info, paymentType: type });
}

function rowToProfile(row: Row): AgencyProfileRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    sender: parseSender(row.sender),
    logo: String(row.logo ?? ""),
    themeColor: String(row.theme_color ?? "#2563eb"),
    paymentLocal: parsePayment(row.payment_local, "local"),
    paymentInternational: parsePayment(row.payment_international, "international"),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export async function readAgencyProfiles(): Promise<AgencyProfileRecord[]> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute("SELECT * FROM invoice_agency_profiles ORDER BY sort_order, name");
  return result.rows.map(rowToProfile);
}

export async function insertAgencyProfile(id: string, input: AgencyProfileInput): Promise<void> {
  await ensureMigrated();
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO invoice_agency_profiles
            (id, name, sender, logo, theme_color, payment_local, payment_international)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      serializeSender(input.sender),
      input.logo,
      input.themeColor,
      serializePayment(input.paymentLocal, "local"),
      serializePayment(input.paymentInternational, "international"),
    ],
  });
}

export async function updateAgencyProfile(id: string, input: AgencyProfileInput): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({
    sql: `UPDATE invoice_agency_profiles
          SET name = ?, sender = ?, logo = ?, theme_color = ?,
              payment_local = ?, payment_international = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [
      input.name,
      serializeSender(input.sender),
      input.logo,
      input.themeColor,
      serializePayment(input.paymentLocal, "local"),
      serializePayment(input.paymentInternational, "international"),
      id,
    ],
  });
  return (result.rowsAffected ?? 0) > 0;
}

export async function deleteAgencyProfile(id: string): Promise<boolean> {
  await ensureMigrated();
  const db = getDb();
  const result = await db.execute({ sql: "DELETE FROM invoice_agency_profiles WHERE id = ?", args: [id] });
  return (result.rowsAffected ?? 0) > 0;
}
