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
  /** What the UI renders: a report, or a short status string. */
  content: string | ReportResult;
  /** The tool failed (the model saw an error result). */
  isError?: boolean;
  /**
   * What the model saw, when it differs from `content` (e.g. a fetched
   * landing page's text). Sent back as the tool_result in later turns.
   */
  historyContent?: string;
}

/**
 * A progress note the model wrote between tool calls (Opus 5.5
 * `thinking.display: "updates"`). Display-only — never sent back as history.
 */
export interface ProgressBlock {
  type: "progress";
  key: string;
  text: string;
}

export type NoticeKind = "refusal" | "fallback" | "truncated" | "limit" | "error" | "stopped";

/** A client-side status line inside an assistant message. Never sent back as history. */
export interface NoticeBlock {
  type: "notice";
  kind: NoticeKind;
  text: string;
  /** Offer a one-click follow-up for this notice. */
  action?: "retry" | "continue";
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ProgressBlock | NoticeBlock;

// ─── Chat messages ──────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: ContentBlock[];
  /** Model that answered, when it differs from the requested one (refusal fallback). */
  servedBy?: string;
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
  /** AI Analyst only: the tool failed. */
  isError?: boolean;
  /** AI Analyst only: what the model saw, when it differs from `result`. */
  content?: string;
}

export interface DoneEvent {
  type: "done";
  /** AI Analyst only: why the reply ended (end_turn, max_tokens, refusal, aborted, …). */
  stopReason?: string;
  /** AI Analyst only: model that produced the reply. */
  servedBy?: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
  /** AI Analyst only: sending the same message again may work. */
  retryable?: boolean;
}

// ─── AI Analyst-only events (other chat routes never send these) ────────────

/** Server phase before/between model turns, e.g. "Loading Meta data…". */
export interface StatusEvent {
  type: "status";
  message: string;
}

/** A new model request started; a later refusal discards text streamed after this. */
export interface TurnStartEvent {
  type: "turn_start";
  iteration: number;
}

/** Progress-note text between tool calls; deltas sharing `key` form one note. */
export interface ProgressDeltaEvent {
  type: "progress_delta";
  key: string;
  text: string;
}

/** The model started writing a tool call (input still streaming). */
export interface ToolStartEvent {
  type: "tool_start";
  id: string;
  name: string;
}

/** A safety classifier declined and another model continued the reply. */
export interface FallbackEvent {
  type: "fallback";
  from: string;
  to: string;
  category: string | null;
}

/** The reply was declined (no fallback could serve it). */
export interface RefusalEvent {
  type: "refusal";
  category: string | null;
  message: string;
}

export type SSEEvent =
  | TextDeltaEvent
  | ToolUseEvent
  | ToolResultEvent
  | DoneEvent
  | ErrorEvent
  | StatusEvent
  | TurnStartEvent
  | ProgressDeltaEvent
  | ToolStartEvent
  | FallbackEvent
  | RefusalEvent;

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
  /** How plotted values are formatted in labels/tooltips (default: plain number). */
  valueFormat?: "currency" | "percent" | "number";
  /** ISO 4217 code for valueFormat "currency" (default USD). */
  currency?: string;
}

export interface DisplayTableInput {
  title: string;
  columns: { key: string; label: string; format?: "currency" | "percent" | "number" | "text" }[];
  rows: Record<string, unknown>[];
  /** ISO 4217 code for "currency" columns (default USD). */
  currency?: string;
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
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
