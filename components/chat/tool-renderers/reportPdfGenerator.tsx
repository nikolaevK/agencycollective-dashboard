import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";
import type {
  ReportResult,
  ReportSectionResult,
  MetricItem,
  DisplayTableInput,
} from "@/types/chat";

// ─── Register Inter font ─────────────────────────────────────────────────────

Font.register({
  family: "Inter",
  fonts: [
    { src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hjQ.ttf", fontWeight: 600 },
    { src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hjQ.ttf", fontWeight: 700 },
  ],
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const PRIMARY = "#7c3aed";
const TEXT = "#203044";
const MUTED = "#68788f";
const SURFACE = "#f4f6ff";
const BORDER = "#e2e8f0";

const s = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 10,
    color: TEXT,
    padding: 40,
    backgroundColor: "#ffffff",
  },
  // Header
  header: {
    borderBottomWidth: 2,
    borderBottomColor: PRIMARY,
    paddingBottom: 16,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: TEXT,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 10,
    color: MUTED,
  },
  headerBrand: {
    fontSize: 8,
    color: PRIMARY,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  // Sections
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: PRIMARY,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  sectionSummary: {
    fontSize: 9.5,
    lineHeight: 1.5,
    color: TEXT,
    marginBottom: 12,
  },
  // Metric cards
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    padding: 10,
    backgroundColor: SURFACE,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER,
  },
  metricLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 700,
    color: TEXT,
  },
  metricSubtitle: {
    fontSize: 7,
    color: MUTED,
    marginTop: 2,
  },
  // Tables
  table: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  tableRowAlt: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    backgroundColor: "#fafbff",
  },
  tableHeaderCell: {
    fontSize: 7,
    fontWeight: 700,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    padding: 6,
    flex: 1,
  },
  tableCell: {
    fontSize: 8,
    color: TEXT,
    padding: 6,
    flex: 1,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: MUTED,
  },
});

// ─── Color mapping for metrics ───────────────────────────────────────────────

const METRIC_COLORS: Record<string, string> = {
  green: "#059669",
  red: "#dc2626",
  blue: "#2563eb",
  purple: PRIMARY,
  amber: "#d97706",
};

// ─── PDF Components ──────────────────────────────────────────────────────────

function MetricsPdfRow({ metrics }: { metrics: MetricItem[] }) {
  // Split into rows of 3
  const rows: MetricItem[][] = [];
  for (let i = 0; i < metrics.length; i += 3) {
    rows.push(metrics.slice(i, i + 3));
  }

  return (
    <>
      {rows.map((row, ri) => (
        <View key={ri} style={s.metricsRow}>
          {row.map((m, i) => (
            <View key={i} style={s.metricCard}>
              <Text style={s.metricLabel}>{m.label}</Text>
              <Text
                style={[
                  s.metricValue,
                  m.color && METRIC_COLORS[m.color] ? { color: METRIC_COLORS[m.color] } : {},
                ]}
              >
                {m.value}
              </Text>
              {m.subtitle && <Text style={s.metricSubtitle}>{m.subtitle}</Text>}
              {m.trend && (
                <Text style={[s.metricSubtitle, { color: m.trend === "up" ? "#059669" : m.trend === "down" ? "#dc2626" : MUTED }]}>
                  {m.trend === "up" ? "↑" : m.trend === "down" ? "↓" : "—"}
                </Text>
              )}
            </View>
          ))}
          {/* Fill empty slots in last row */}
          {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
            <View key={`empty-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </>
  );
}

function TablePdf({ tableData }: { tableData: DisplayTableInput }) {
  const { columns, rows } = tableData;
  if (!rows || rows.length === 0) return null;

  return (
    <View style={s.table}>
      <View style={s.tableHeaderRow}>
        {columns.map((col) => (
          <Text key={col.key} style={s.tableHeaderCell}>
            {col.label}
          </Text>
        ))}
      </View>
      {rows.slice(0, 20).map((row, i) => (
        <View key={i} style={i % 2 === 1 ? s.tableRowAlt : s.tableRow}>
          {columns.map((col) => {
            const val = row[col.key];
            let display = String(val ?? "—");
            if (col.format === "currency" && typeof val === "number") {
              display = val >= 1000 ? `$${(val / 1000).toFixed(1)}K` : `$${val.toFixed(2)}`;
            } else if (col.format === "percent" && typeof val === "number") {
              display = `${val.toFixed(2)}%`;
            } else if (col.format === "number" && typeof val === "number") {
              display = val.toLocaleString(undefined, { maximumFractionDigits: 2 });
            }
            return (
              <Text key={col.key} style={s.tableCell}>
                {display}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function SectionPdf({ section }: { section: ReportSectionResult }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{section.title}</Text>
      <Text style={s.sectionSummary}>{section.summary}</Text>
      {section.metrics && <MetricsPdfRow metrics={section.metrics} />}
      {section.chartData && (
        <View style={{ padding: 12, backgroundColor: SURFACE, borderRadius: 6, marginBottom: 12 }}>
          <Text style={{ fontSize: 8, color: MUTED, textAlign: "center" }}>
            Chart: {section.chartData.title} — See interactive version in the dashboard
          </Text>
        </View>
      )}
      {section.tableData && <TablePdf tableData={section.tableData} />}
    </View>
  );
}

function ReportPdfDocument({ report }: { report: ReportResult }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerBrand}>Agency Collective</Text>
          <Text style={s.headerTitle}>{report.title}</Text>
          <Text style={s.headerSubtitle}>
            Period: {report.period} | Generated: {(() => { const d = new Date(report.generatedAt); return isNaN(d.getTime()) ? report.generatedAt : d.toLocaleDateString(); })()}
          </Text>
        </View>

        {/* Sections */}
        {report.sections.map((section, i) => (
          <SectionPdf key={i} section={section} />
        ))}

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Generated by Agency Collective AI Analyst
          </Text>
          <Text style={s.footerText}>
            {new Date().toLocaleDateString()}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

// ─── Export function ──────────────────────────────────────────────────────────

export async function generateReportPdf(report: ReportResult): Promise<void> {
  const blob = await pdf(<ReportPdfDocument report={report} />).toBlob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `report-${report.clientName.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
