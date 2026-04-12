// ─── Content blocks for AI messages ─────────────────────────────────────────

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ReportResult;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

// ─── Chat messages ──────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: ContentBlock[];
}

// ─── SSE event types ────────────────────────────────────────────────────────

export interface TextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface ToolUseEvent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultEvent {
  type: "tool_result";
  tool_use_id: string;
  result: unknown;
}

export interface DoneEvent {
  type: "done";
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type SSEEvent =
  | TextDeltaEvent
  | ToolUseEvent
  | ToolResultEvent
  | DoneEvent
  | ErrorEvent;

// ─── Tool input types ───────────────────────────────────────────────────────

export interface MetricItem {
  label: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  color?: string;
}

export interface DisplayMetricsInput {
  metrics: MetricItem[];
}

export interface DisplayChartInput {
  type: "line" | "bar" | "pie" | "donut";
  title: string;
  data: Record<string, unknown>[];
  metrics: string[];
  xAxisKey?: string;
}

export interface DisplayTableInput {
  title: string;
  columns: { key: string; label: string; format?: "currency" | "percent" | "number" | "text" }[];
  rows: Record<string, unknown>[];
}

export interface GenerateReportInput {
  clientName: string;
  accountId: string;
  period: string;
  sections: ReportSection[];
  landingPageUrl?: string;
}

export type ReportSection =
  | "overview"
  | "campaigns"
  | "demographics"
  | "placements"
  | "conversions"
  | "recommendations"
  | "audit_score"
  | "andromeda"
  | "campaign_structure"
  | "landing_page";

// ─── Report result (returned by generate_report tool) ───────────────────────

export interface ReportResult {
  title: string;
  clientName: string;
  period: string;
  generatedAt: string;
  sections: ReportSectionResult[];
}

export interface ReportSectionResult {
  title: string;
  summary: string;
  metrics?: MetricItem[];
  chartData?: DisplayChartInput;
  tableData?: DisplayTableInput;
}

// ─── API message format (sent to /api/chat) ─────────────────────────────────

export interface ApiChatMessage {
  role: "user" | "assistant";
  content: string | ApiContentBlock[];
}

export type ApiContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };
