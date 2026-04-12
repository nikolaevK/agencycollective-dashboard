"use client";

import { Loader2 } from "lucide-react";
import { MetricCards } from "./tool-renderers/MetricCards";
import { InlineChart } from "./tool-renderers/InlineChart";
import { InlineTable } from "./tool-renderers/InlineTable";
import { ReportCard } from "./tool-renderers/ReportCard";
import type {
  ToolUseBlock,
  ContentBlock,
  DisplayMetricsInput,
  DisplayChartInput,
  DisplayTableInput,
  ReportResult,
} from "@/types/chat";

interface ToolResultRendererProps {
  tool: ToolUseBlock;
  /** All blocks in the message — used to find tool_result for this tool */
  allBlocks: ContentBlock[];
}

export function ToolResultRenderer({ tool, allBlocks }: ToolResultRendererProps) {
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
      // Find the matching tool_result block
      const resultBlock = allBlocks.find(
        (b) => b.type === "tool_result" && b.tool_use_id === tool.id
      );

      if (!resultBlock || resultBlock.type !== "tool_result") {
        return (
          <div className="my-3 flex items-center gap-2 p-4 bg-muted/30 rounded-xl border border-border/50 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Generating report...
          </div>
        );
      }

      try {
        const report = (typeof resultBlock.content === "string"
          ? JSON.parse(resultBlock.content)
          : resultBlock.content) as ReportResult;
        if (!report?.sections) throw new Error("Invalid report structure");
        return <ReportCard report={report} />;
      } catch (e) {
        console.warn("[ToolResultRenderer] Failed to parse report:", e);
        return (
          <div className="my-3 p-3 bg-destructive/10 rounded-xl border border-destructive/20 text-xs text-destructive">
            Failed to load report data.
          </div>
        );
      }
    }

    default:
      return (
        <div className="my-3 p-3 bg-muted/30 rounded-xl border border-border/50 text-xs text-muted-foreground">
          Tool: {tool.name}
        </div>
      );
  }
}
