"use client";

import { useState } from "react";
import { Download, FileText, Loader2, AlertCircle } from "lucide-react";
import { MetricCards } from "./MetricCards";
import { InlineChart } from "./InlineChart";
import { InlineTable } from "./InlineTable";
import type { ReportResult } from "@/types/chat";

export function ReportCard({ report }: { report: ReportResult }) {
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  async function handleDownloadPdf() {
    setDownloading(true);
    setPdfError(null);
    try {
      const { generateReportPdf } = await import("./reportPdfGenerator");
      await generateReportPdf(report);
    } catch (err) {
      console.error("PDF generation failed:", err);
      setPdfError("PDF generation failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="my-4 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Report header */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-5 py-4 border-b border-border/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">{report.title}</h4>
              <p className="text-[11px] text-muted-foreground">
                {report.period} &middot; Generated {new Date(report.generatedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            PDF
          </button>
        </div>
        {pdfError && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" />
            {pdfError}
          </div>
        )}
      </div>

      {/* Report sections */}
      <div className="divide-y divide-border/50">
        {report.sections.map((section, i) => (
          <div key={i} className="px-5 py-4">
            <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              {section.title}
            </h5>
            <p className="text-sm text-foreground/85 leading-relaxed mb-3">
              {section.summary}
            </p>
            {section.metrics && <MetricCards input={{ metrics: section.metrics }} />}
            {section.chartData && <InlineChart input={section.chartData} />}
            {section.tableData && <InlineTable input={section.tableData} />}
          </div>
        ))}
      </div>
    </div>
  );
}
