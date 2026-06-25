"use client";

import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { InvoiceData } from "@/types/invoice";
import { numberToWords } from "@/lib/invoice/numberToWords";

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

const ACCENT = "#2563eb";
const LIGHT_BG = "#EBF4FF";

// Description column sizing, used to estimate how tall a block will render so we
// never keep-together (wrap=false) a block that can't fit on a page — which
// react-pdf would CLIP (silent data loss). The estimate counts VISUAL lines
// (after wrapping in the narrow 35% column), not raw "\n" lines: a few long
// sentences can wrap into many visual lines.
//  - DESC_CHARS_PER_LINE: conservative (low) chars-per-line so we OVER-estimate
//    height — the safe direction (route a borderline block to split, not clip).
//    The 35% column is ~180pt wide; Helvetica 8pt averages ~42 chars/line.
//  - BLOCK_MAX_VISUAL_LINES: max visual lines kept together. ~74 lines fit a
//    full A4 page at 8pt/1.4; 55 leaves margin so a kept-together block always
//    fits a fresh page and react-pdf relocates it whole instead of clipping.
const DESC_CHARS_PER_LINE = 34;
const BLOCK_MAX_VISUAL_LINES = 55;

function visualLineCount(line: string): number {
  return Math.max(1, Math.ceil(line.length / DESC_CHARS_PER_LINE));
}

/**
 * Group a line-item description into blocks separated by blank lines. Each block
 * is the consecutive non-empty lines between blanks (a service heading + its
 * bullet points). Rendering each block as its own unit lets a long, multi-page
 * description break BETWEEN services instead of clipping or splitting a list.
 */
function splitDescriptionBlocks(description: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const raw of (description || "").split("\n")) {
    if (raw.trim() === "") {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(raw);
    }
  }
  if (current.length > 0) blocks.push(current);
  return blocks;
}

/**
 * Split one block into chunks that each fit on a page (by estimated visual
 * lines), so every rendered block-row is small enough that react-pdf relocates
 * it whole rather than clipping it. A single line longer than the budget becomes
 * its own (oversized) chunk — flagged `wrap` so it splits losslessly.
 */
function chunkBlock(block: string[]): { lines: string[]; wrap: boolean }[] {
  if (block.length === 0) return [{ lines: [], wrap: false }];
  const chunks: string[][] = [];
  let current: string[] = [];
  let count = 0;
  for (const line of block) {
    const n = visualLineCount(line);
    if (current.length > 0 && count + n > BLOCK_MAX_VISUAL_LINES) {
      chunks.push(current);
      current = [];
      count = 0;
    }
    current.push(line);
    count += n;
  }
  if (current.length > 0) chunks.push(current);
  // A chunk only exceeds the budget when it's a single very long line that
  // can't be chunked further — let that one wrap (split) so it isn't clipped.
  return chunks.map((lines) => ({
    lines,
    wrap: lines.reduce((s, l) => s + visualLineCount(l), 0) > BLOCK_MAX_VISUAL_LINES,
  }));
}

/**
 * Flatten an item's description into the list of block-rows to render: blocks
 * split on blank lines, each block chunked to page height. `gapTop` marks the
 * first row of each original block (except the very first) so spacing appears
 * between services but not between chunks of one service.
 */
function buildItemRows(description: string): { lines: string[]; wrap: boolean; gapTop: boolean }[] {
  const blocks = splitDescriptionBlocks(description);
  const blockList = blocks.length > 0 ? blocks : [[]];
  const rows: { lines: string[]; wrap: boolean; gapTop: boolean }[] = [];
  blockList.forEach((block, blockIdx) => {
    chunkBlock(block).forEach((chunk, chunkIdx) => {
      rows.push({ ...chunk, gapTop: blockIdx > 0 && chunkIdx === 0 });
    });
  });
  return rows;
}

const s = StyleSheet.create({
  page: { padding: 0, fontFamily: "Helvetica", fontSize: 9, color: "#1a1a1a" },
  // Header
  header: { padding: "30 40 20 40", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flex: 1 },
  invoiceTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 4 },
  companyName: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#333" },
  companyText: { fontSize: 8, color: "#666", lineHeight: 1.4 },
  contactRow: { flexDirection: "row", gap: 20, marginTop: 2 },
  contactText: { fontSize: 8, color: "#666" },
  logo: { width: 70, height: 70, objectFit: "contain" },
  // Bill To / Ship To band
  billBand: { backgroundColor: LIGHT_BG, padding: "12 40", marginBottom: 0 },
  billRow: { flexDirection: "row", gap: 40 },
  billBlock: { flex: 1 },
  billLabel: { fontSize: 8, color: "#666", fontStyle: "italic", marginBottom: 2 },
  billName: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  billCompany: { fontSize: 9, color: "#333" },
  // Invoice details
  detailsSection: { padding: "16 40 12 40" },
  detailsTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 6 },
  detailLine: { fontSize: 9, color: "#555", lineHeight: 1.6 },
  detailLabel: { color: ACCENT },
  // Items table
  tableSection: { padding: "0 40 10 40" },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#ccc", paddingBottom: 6, marginBottom: 4 },
  tableHeaderText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#555", textTransform: "uppercase" },
  colNum: { width: "5%" },
  colProduct: { width: "30%" },
  colDesc: { width: "35%" },
  colRate: { width: "15%", textAlign: "right" },
  colAmount: { width: "15%", textAlign: "right" },
  // An item is a group of block-rows (one per description block). The group
  // carries the bottom border + vertical padding and wraps BETWEEN block-rows
  // across a page. Each block-row is a full 5-column flex row: the empty leading
  // cells on continuation blocks preserve the description's column offset when a
  // block lands on a later page (a single flex row drops the text to the left
  // margin instead). The #, name, rate & amount render only on the first
  // block-row, where the name is a flex child so the row grows to fit a long name.
  itemGroup: { paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  blockRow: { flexDirection: "row", alignItems: "flex-start" },
  cellText: { fontSize: 9, color: "#333" },
  cellBold: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  cellDesc: { fontSize: 8, color: "#666", lineHeight: 1.4 },
  // Total
  totalSection: { padding: "10 40", flexDirection: "row", justifyContent: "flex-end" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", width: 200, paddingVertical: 3 },
  totalLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#333" },
  totalValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  totalInWords: { fontSize: 8, color: "#888", fontStyle: "italic", marginTop: 2, textAlign: "right" },
  chargeRow: { flexDirection: "row", justifyContent: "space-between", width: 200, paddingVertical: 2 },
  chargeLabel: { fontSize: 9, color: "#666" },
  chargeValue: { fontSize: 9, color: "#333" },
  // Ways to pay / note
  noteSection: { padding: "16 40 10 40" },
  noteSectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: ACCENT, marginBottom: 6 },
  noteText: { fontSize: 8, color: "#555", lineHeight: 1.5 },
  // Signature
  signatureSection: { padding: "10 40", marginTop: 8 },
  signatureLabel: { fontSize: 8, color: "#888", marginBottom: 4 },
  signatureImage: { width: 150, height: 50, objectFit: "contain" },
  signatureText: { fontSize: 22, color: "#000" },
  // Custom fields
  customField: { flexDirection: "row", gap: 4, marginTop: 1 },
  customKey: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#555" },
  customValue: { fontSize: 8, color: "#555" },
  // Footer section labels
  footerSection: { padding: "6 40" },
  footerLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: ACCENT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  footerText: { fontSize: 8, color: "#555", lineHeight: 1.5 },
});

interface Props {
  data: InvoiceData;
}

export function InvoicePdfDocument({ data }: Props) {
  const { sender, receiver, details } = data;
  const themeColor = details.themeColor || ACCENT;

  const discountAmount = details.discountDetails
    ? details.discountDetails.amountType === "percentage"
      ? details.subTotal * (details.discountDetails.amount / 100)
      : details.discountDetails.amount
    : 0;
  const taxAmount = details.taxDetails
    ? details.taxDetails.amountType === "percentage"
      ? details.subTotal * (details.taxDetails.amount / 100)
      : details.taxDetails.amount
    : 0;
  const shippingAmount = details.shippingDetails
    ? details.shippingDetails.costType === "percentage"
      ? details.subTotal * (details.shippingDetails.cost / 100)
      : details.shippingDetails.cost
    : 0;

  const senderLines = [sender.address, [sender.city, sender.zipCode].filter(Boolean).join(", "), sender.country].filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={{ ...s.invoiceTitle, color: themeColor }}>INVOICE</Text>
            {sender.name ? <Text style={s.companyName}>{sender.name}</Text> : null}
            {senderLines.map((line, i) => (
              <Text key={i} style={s.companyText}>{line}</Text>
            ))}
            <View style={s.contactRow}>
              {sender.email ? <Text style={s.contactText}>{sender.email}</Text> : null}
              {sender.phone ? <Text style={s.contactText}>{sender.phone}</Text> : null}
            </View>
            {sender.customInputs.map((ci) => (
              <View key={ci.id} style={s.customField}>
                <Text style={s.customKey}>{ci.key}:</Text>
                <Text style={s.customValue}>{ci.value}</Text>
              </View>
            ))}
          </View>
          {details.invoiceLogo ? <Image src={details.invoiceLogo} style={s.logo} /> : null}
        </View>

        {/* ── Bill To band ── */}
        <View style={s.billBand}>
          <View style={s.billRow}>
            <View style={s.billBlock}>
              <Text style={s.billLabel}>Bill to</Text>
              {receiver.name ? <Text style={s.billName}>{receiver.name}</Text> : null}
              {receiver.address ? <Text style={s.billCompany}>{receiver.address}</Text> : null}
              {[receiver.city, receiver.zipCode, receiver.country].filter(Boolean).join(", ") && (
                <Text style={s.billCompany}>{[receiver.city, receiver.zipCode, receiver.country].filter(Boolean).join(", ")}</Text>
              )}
              {receiver.email ? <Text style={{ ...s.contactText, marginTop: 2 }}>{receiver.email}</Text> : null}
              {receiver.phone ? <Text style={s.contactText}>{receiver.phone}</Text> : null}
              {receiver.customInputs.map((ci) => (
                <View key={ci.id} style={s.customField}>
                  <Text style={s.customKey}>{ci.key}:</Text>
                  <Text style={s.customValue}>{ci.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Invoice Details ── */}
        <View style={s.detailsSection}>
          <Text style={{ ...s.detailsTitle, color: themeColor }}>Invoice details</Text>
          {details.invoiceNumber ? <Text style={s.detailLine}><Text style={{ ...s.detailLabel, color: themeColor }}>Invoice no.: </Text>{details.invoiceNumber}</Text> : null}
          {details.terms ? <Text style={s.detailLine}><Text style={{ ...s.detailLabel, color: themeColor }}>Terms: </Text>{details.terms}</Text> : null}
          {details.invoiceDate ? <Text style={s.detailLine}><Text style={{ ...s.detailLabel, color: themeColor }}>Invoice date: </Text>{formatDate(details.invoiceDate)}</Text> : null}
          {details.dueDate ? <Text style={s.detailLine}><Text style={{ ...s.detailLabel, color: themeColor }}>Due date: </Text>{formatDate(details.dueDate)}</Text> : null}
        </View>

        {/* ── Items Table ── */}
        <View style={s.tableSection}>
          <View style={s.tableHeader}>
            <Text style={{ ...s.tableHeaderText, ...s.colNum }}>#</Text>
            <Text style={{ ...s.tableHeaderText, ...s.colProduct }}>Product or service</Text>
            <Text style={{ ...s.tableHeaderText, ...s.colDesc }}>Description</Text>
            <Text style={{ ...s.tableHeaderText, ...s.colRate }}>Rate</Text>
            <Text style={{ ...s.tableHeaderText, ...s.colAmount }}>Amount</Text>
          </View>
          {details.items.map((item, idx) => (
            <View key={item.id} style={s.itemGroup}>
              {buildItemRows(item.description).map((row, ri) => (
                // Each row is a block (or page-sized chunk of one) kept together
                // so a page break lands BETWEEN rows, never mid-list. A row only
                // wraps when it's a single line taller than a page, so it splits
                // instead of being clipped — no data loss either way. The
                // #/name/rate/amount render on the first row only; empty leading
                // cells on later rows preserve the description's column offset.
                <View
                  key={ri}
                  style={{ ...s.blockRow, ...(row.gapTop ? { marginTop: 8 } : {}) }}
                  wrap={row.wrap}
                >
                  <Text style={{ ...s.cellText, ...s.colNum }}>{ri === 0 ? `${idx + 1}.` : ""}</Text>
                  <Text style={{ ...s.cellBold, ...s.colProduct }}>{ri === 0 ? item.name : ""}</Text>
                  <View style={s.colDesc}>
                    {row.lines.map((line, li) => (
                      <Text key={li} style={s.cellDesc}>{line}</Text>
                    ))}
                  </View>
                  <Text style={{ ...s.cellText, ...s.colRate }}>{ri === 0 ? fmt(item.unitPrice, details.currency) : ""}</Text>
                  <Text style={{ ...s.cellBold, ...s.colAmount }}>{ri === 0 ? fmt(item.quantity * item.unitPrice, details.currency) : ""}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* ── Totals ── */}
        <View style={s.totalSection}>
          <View>
            {(details.discountDetails || details.taxDetails || details.shippingDetails) && (
              <>
                <View style={s.chargeRow}>
                  <Text style={s.chargeLabel}>Subtotal</Text>
                  <Text style={s.chargeValue}>{fmt(details.subTotal, details.currency)}</Text>
                </View>
                {details.discountDetails && discountAmount > 0 && (
                  <View style={s.chargeRow}>
                    <Text style={s.chargeLabel}>Discount{details.discountDetails.amountType === "percentage" ? ` (${details.discountDetails.amount}%)` : ""}</Text>
                    <Text style={{ ...s.chargeValue, color: "#dc2626" }}>-{fmt(discountAmount, details.currency)}</Text>
                  </View>
                )}
                {details.taxDetails && taxAmount > 0 && (
                  <View style={s.chargeRow}>
                    <Text style={s.chargeLabel}>Tax{details.taxDetails.amountType === "percentage" ? ` (${details.taxDetails.amount}%)` : ""}</Text>
                    <Text style={s.chargeValue}>+{fmt(taxAmount, details.currency)}</Text>
                  </View>
                )}
                {details.shippingDetails && shippingAmount > 0 && (
                  <View style={s.chargeRow}>
                    <Text style={s.chargeLabel}>Shipping{details.shippingDetails.costType === "percentage" ? ` (${details.shippingDetails.cost}%)` : ""}</Text>
                    <Text style={s.chargeValue}>+{fmt(shippingAmount, details.currency)}</Text>
                  </View>
                )}
              </>
            )}
            <View style={{ ...s.totalRow, borderTopWidth: 1, borderTopColor: "#ccc", paddingTop: 6, marginTop: 4 }}>
              <Text style={s.totalLabel}>Total</Text>
              <Text style={s.totalValue}>{fmt(details.totalAmount, details.currency)}</Text>
            </View>
            {details.totalInWords && details.totalAmount > 0 && (
              <Text style={s.totalInWords}>{numberToWords(details.totalAmount, details.currency)}</Text>
            )}
          </View>
        </View>

        {/* ── Payment Information (expanded) ── */}
        {details.paymentInfo && (
          // Keep the whole payment block on one page — it's short and bounded,
          // so wrap={false} moves it to the next page rather than splitting it.
          <View style={s.noteSection} wrap={false}>
            <Text style={{ ...s.noteSectionTitle, color: themeColor }}>Payment Information</Text>
            {details.paymentInfo.paymentType === "local" && details.paymentInfo.zelleContact ? (
              <View style={{ marginBottom: 4 }}>
                <Text style={{ ...s.noteText, fontFamily: "Helvetica-Bold", color: "#333" }}>Zelle</Text>
                <Text style={s.noteText}>Phone / Email: {details.paymentInfo.zelleContact}</Text>
              </View>
            ) : null}
            <View style={{ marginBottom: 2 }}>
              <Text style={{ ...s.noteText, fontFamily: "Helvetica-Bold", color: "#333" }}>
                {details.paymentInfo.paymentType === "international" ? "International Wire" : "Wire"}
              </Text>
            </View>
            {details.paymentInfo.swiftBic ? <Text style={s.noteText}>SWIFT / BIC: {details.paymentInfo.swiftBic}</Text> : null}
            {details.paymentInfo.accountNumber ? <Text style={s.noteText}>Account No: {details.paymentInfo.accountNumber}</Text> : null}
            {details.paymentInfo.routingNumber ? <Text style={s.noteText}>Routing No: {details.paymentInfo.routingNumber}</Text> : null}
            {details.paymentInfo.alternateRoutingNumber ? <Text style={s.noteText}>Alt. Routing: {details.paymentInfo.alternateRoutingNumber}</Text> : null}
            {details.paymentInfo.bankName ? <Text style={s.noteText}>Bank: {details.paymentInfo.bankName}</Text> : null}
            {details.paymentInfo.bankAddress ? <Text style={s.noteText}>Bank Address: {details.paymentInfo.bankAddress}</Text> : null}
            {details.paymentInfo.beneficiaryName ? <Text style={s.noteText}>Beneficiary: {details.paymentInfo.beneficiaryName}</Text> : null}
            {details.paymentInfo.beneficiaryAddress ? <Text style={s.noteText}>Beneficiary Address: {details.paymentInfo.beneficiaryAddress}</Text> : null}
            {details.paymentInfo.memo ? <Text style={{ ...s.noteText, fontStyle: "italic", marginTop: 4 }}>{details.paymentInfo.memo}</Text> : null}
          </View>
        )}

        {/* ── Note to customer (legacy / general) ── */}
        {details.noteToCustomer ? (
          <View style={s.noteSection}>
            <Text style={{ ...s.noteSectionTitle, color: themeColor }}>Note to customer</Text>
            <Text style={s.noteText}>{details.noteToCustomer}</Text>
          </View>
        ) : null}

        {/* ── Payment terms ── */}
        {details.paymentTerms ? (
          <View style={s.footerSection}>
            <Text style={{ ...s.footerLabel, color: themeColor }}>Payment Terms</Text>
            <Text style={s.footerText}>{details.paymentTerms}</Text>
          </View>
        ) : null}

        {/* ── Additional notes ── */}
        {details.additionalNotes ? (
          <View style={s.footerSection}>
            <Text style={{ ...s.footerLabel, color: themeColor }}>Additional Notes</Text>
            <Text style={s.footerText}>{details.additionalNotes}</Text>
          </View>
        ) : null}

        {/* ── Signature ── */}
        {details.signature && details.signature.data && (
          <View style={s.signatureSection}>
            <Text style={s.signatureLabel}>Signature</Text>
            {details.signature.type === "type" ? (
              <Text style={{ ...s.signatureText, color: details.signature.color || "#000" }}>{details.signature.data}</Text>
            ) : (
              <Image src={details.signature.data} style={s.signatureImage} />
            )}
          </View>
        )}
      </Page>
    </Document>
  );
}
