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
  tableRow: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  colNum: { width: "5%" },
  colProduct: { width: "30%" },
  colDesc: { width: "35%" },
  colRate: { width: "15%", textAlign: "right" },
  colAmount: { width: "15%", textAlign: "right" },
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
            <View key={item.id} style={s.tableRow}>
              <Text style={{ ...s.cellText, ...s.colNum }}>{idx + 1}.</Text>
              <Text style={{ ...s.cellBold, ...s.colProduct }}>{item.name}</Text>
              <View style={s.colDesc}>
                {item.description.split("\n").map((line, li) => (
                  <Text key={li} style={{ ...s.cellDesc, ...(line === "" ? { marginTop: 6 } : {}) }}>
                    {line || " "}
                  </Text>
                ))}
              </View>
              <Text style={{ ...s.cellText, ...s.colRate }}>{fmt(item.unitPrice, details.currency)}</Text>
              <Text style={{ ...s.cellBold, ...s.colAmount }}>{fmt(item.quantity * item.unitPrice, details.currency)}</Text>
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

        {/* ── Note to customer ── */}
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

        {/* ── Payment info ── */}
        {details.paymentInfo && (
          <View style={s.footerSection}>
            <Text style={{ ...s.footerLabel, color: themeColor }}>Payment Information</Text>
            {details.paymentInfo.bankName ? <Text style={s.footerText}>Bank: {details.paymentInfo.bankName}</Text> : null}
            {details.paymentInfo.accountName ? <Text style={s.footerText}>Account: {details.paymentInfo.accountName}</Text> : null}
            {details.paymentInfo.accountNumber ? <Text style={s.footerText}>Account No: {details.paymentInfo.accountNumber}</Text> : null}
          </View>
        )}

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
