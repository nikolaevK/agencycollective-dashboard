"use client";

import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCards } from "./MetricCards";
import { InlineTable } from "./InlineTable";
import type { ReportResult } from "@/types/chat";

// recharts only loads once a report section actually has a chart.
const InlineChart = dynamic(() => import("./InlineChart").then((m) => m.InlineChart), {
  loading: () => <Skeleton className="h-[300px] w-full rounded-3xl" />,
});

/** Shared by the AI Analyst and Media Buyers chat — keep the `report` prop contract. Memoized by `report`. */
export const ReportCard = memo(function ReportCard({ report }: { report: ReportResult }) {
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

  const generated = new Date(report.generatedAt);

  return (
    <Card className="min-w-0 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="flex min-w-0 items-start gap-3">
          <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h4 className="break-words text-sm font-semibold tracking-tight">{report.title}</h4>
            <p className="text-xs text-muted-foreground">
              {report.period}
              {!isNaN(generated.getTime()) && <> · Generated {generated.toLocaleDateString()}</>}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={handleDownloadPdf} disabled={downloading} data-pdf-ignore="">
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          PDF
        </Button>
        {pdfError && (
          <p role="alert" className="flex w-full items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="size-3.5" />
            {pdfError}
          </p>
        )}
      </div>

      <div className="divide-y">
        {report.sections.map((section, i) => (
          <section key={i} className="space-y-3 p-4">
            <h5 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.title}</h5>
            <p className="text-sm leading-relaxed text-foreground/90">{section.summary}</p>
            {section.metrics && section.metrics.length > 0 && <MetricCards input={{ metrics: section.metrics }} />}
            {section.chartData && <InlineChart input={section.chartData} />}
            {section.tableData && <InlineTable input={section.tableData} />}
          </section>
        ))}
      </div>
    </Card>
  );
});
