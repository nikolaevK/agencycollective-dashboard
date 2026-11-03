"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCards } from "./tool-renderers/MetricCards";
import { InlineTable } from "./tool-renderers/InlineTable";
import type {
  ToolUseBlock,
  ToolResultBlock,
  DisplayMetricsInput,
  DisplayChartInput,
  DisplayTableInput,
  ReportResult,
} from "@/types/chat";

// recharts / the report card only load when a reply actually contains them.
const InlineChart = dynamic(() => import("./tool-renderers/InlineChart").then((m) => m.InlineChart), {
  loading: () => <Skeleton className="h-[300px] w-full rounded-3xl" />,
});
const ReportCard = dynamic(() => import("./tool-renderers/ReportCard").then((m) => m.ReportCard), {
  loading: () => <Skeleton className="h-64 w-full rounded-3xl" />,
});

interface ToolResultRendererProps {
  tool: ToolUseBlock;
  /** This call's tool_result, once it arrived. */
  result?: ToolResultBlock;
  /** The reply is still streaming (a missing result may still come). */
  streaming?: boolean;
}

/**
 * Renders a display / report tool call where it sits in the reply. Memoized:
 * its blocks keep their identity while the reply streams, so finished charts
 * and tables don't re-render on every token.
 */
export const ToolResultRenderer = memo(function ToolResultRenderer({ tool, result, streaming }: ToolResultRendererProps) {
  switch (tool.name) {
    case "display_metrics": {
      const metrics = tool.input as DisplayMetricsInput;
      if (!metrics?.metrics?.length) return null;
      return <MetricCards input={metrics} />;
    }

    case "display_chart": {
      const chart = tool.input as DisplayChartInput;
      if (!chart?.data?.length || !chart?.metrics?.length) return null;
      return <InlineChart input={chart} />;
    }

    case "display_table": {
      const table = tool.input as DisplayTableInput;
      if (!table?.columns?.length || !table?.rows?.length) return null;
      return <InlineTable input={table} />;
    }

    case "generate_report": {
      if (!result) {
        // The reply ended without a result (stopped, or it failed server-side) —
        // neutral, and nothing internal (the client portal renders this too).
        return (
          <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground shadow-none">
            {streaming ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            {streaming ? "Generating report…" : "The report wasn't generated."}
          </Card>
        );
      }

      if (result.isError) {
        return (
          <div role="alert" className={cn("flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm", badgeTone.danger)}>
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>Couldn&apos;t build the report: {String(result.content)}</p>
          </div>
        );
      }

      try {
        const report = (typeof result.content === "string"
          ? JSON.parse(result.content)
          : result.content) as ReportResult;
        if (!report?.sections) throw new Error("Invalid report structure");
        return <ReportCard report={report} />;
      } catch (e) {
        console.warn("[ToolResultRenderer] Failed to parse report:", e);
        return (
          <div role="alert" className={cn("rounded-2xl border px-3 py-2 text-sm", badgeTone.danger)}>
            Failed to load report data.
          </div>
        );
      }
    }

    default:
      // Non-visual tools (e.g. fetch_landing_page) are shown in the message's activity list.
      return null;
  }
});
