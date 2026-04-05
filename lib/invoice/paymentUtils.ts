import type { PaymentInfo, PaymentType } from "@/types/invoice";

export function emptyPaymentInfo(type: PaymentType = "local"): PaymentInfo {
  return {
    paymentType: type,
    bankName: "",
    accountName: "",
    accountNumber: "",
    routingNumber: "",
    bankAddress: "",
    beneficiaryName: "",
    beneficiaryAddress: "",
    zelleContact: "",
    swiftBic: "",
    alternateRoutingNumber: "",
    memo: "",
  };
}

export function parsePaymentNoteToPaymentInfo(text: string, type: PaymentType): PaymentInfo {
  const info = emptyPaymentInfo(type);

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = (prefix: string) =>
      line.toLowerCase().startsWith(prefix.toLowerCase()) ? line.slice(prefix.length).trim() : null;

    const phoneNum = match("Phone number:");
    if (phoneNum) { info.zelleContact = phoneNum; continue; }

    const acct = match("Account number:");
    if (acct) { info.accountNumber = acct; continue; }

    const routing = match("Routing number:");
    if (routing) { info.routingNumber = routing; continue; }

    const swift = match("SWIFT / BIC Code:") || match("SWIFT/BIC Code:");
    if (swift) { info.swiftBic = swift; continue; }

    const bank = match("Bank Name:");
    if (bank) { info.bankName = bank; continue; }

    const beneficiary = match("Beneficiary Name:");
    if (beneficiary) { info.beneficiaryName = beneficiary; continue; }

    if (line.toLowerCase() === "bank address:") {
      const addrLines: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || next.includes(":")) break;
        addrLines.push(next);
      }
      info.bankAddress = addrLines.join("\n");
      continue;
    }

    if (line.toLowerCase().startsWith("beneficiary address:")) {
      const inline = line.slice("Beneficiary Address:".length).trim();
      const addrLines: string[] = inline ? [inline] : [];
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || next.includes(":") || next.toLowerCase().includes("digital service")) break;
        addrLines.push(next);
      }
      info.beneficiaryAddress = addrLines.join("\n");
      continue;
    }

    if (line.toLowerCase().startsWith("if the sending bank")) {
      const nextLine = lines[i + 1]?.trim() ?? "";
      const alt = nextLine.match(/please use:\s*(\S+)/i);
      if (alt) { info.alternateRoutingNumber = alt[1]; }
      continue;
    }

    if (line.toLowerCase().includes("digital service") || line.toLowerCase().includes("non refundable")) {
      info.memo = line;
      continue;
    }
  }

  return info;
}

/**
 * Load a structured PaymentInfo from agency config (client-side).
 * Tries structured JSON template first, falls back to parsing free-text note.
 */
export function loadPaymentInfoFromConfig(
  config: Record<string, string> | null | undefined,
  type: PaymentType
): PaymentInfo | null {
  if (!config) return null;

  // Try new structured template
  const structuredKey = type === "international" ? "payment_template_international" : "payment_template_local";
  const structuredRaw = config[structuredKey];
  if (structuredRaw) {
    try {
      const parsed = JSON.parse(structuredRaw);
      return { ...emptyPaymentInfo(type), ...parsed, paymentType: type };
    } catch (err) {
      console.warn("[paymentUtils] Failed to parse structured template:", err);
    }
  }

  // Fallback: parse old free-text note
  const noteKey = type === "international" ? "note_international" : "note_local";
  const noteText = config[noteKey];
  if (noteText) {
    return parsePaymentNoteToPaymentInfo(noteText, type);
  }

  return null;
}
