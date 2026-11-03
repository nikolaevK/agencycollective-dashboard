export const dynamic = "force-dynamic";
/** A thorough multi-tool analysis can run for minutes; the loop wraps up before this. */
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaMessageParam,
  BetaTextBlockParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { getAdminSession } from "@/lib/adminSession";
import { requireAdminRecord } from "@/lib/api/requireAdmin";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import { generateReport } from "@/lib/reportGenerator";
import { readJsonCapped } from "@/lib/api/readBodyCapped";
import { businessTodayYmd } from "@/lib/businessTime";
import { ALLOWED_MODELS, DEFAULT_MODEL, type ChatModelId } from "@/lib/chatModels";
import { runToolLoop, type ClaudeEffort, type ToolLoopEvent } from "@/lib/claude/toolLoop";
import { describeClaudeError } from "@/lib/claude/errors";
import { buildAnalystContext } from "@/lib/analyst/context";
import { ANALYST_SYSTEM_PROMPT, buildDataBlock } from "@/lib/analyst/prompt";
import {
  ANALYST_TOOLS,
  DISPLAY_TOOL_NAMES,
  validateDisplayInput,
  validateLandingPageInput,
  validateReportInput,
} from "@/lib/analyst/tools";
import { ANALYSIS_DEPTHS, parseAnalysisDepth, parseAnalystDateRange, parseAnalystHistory } from "@/lib/analyst/request";
import { dateRangeLabel, resolvePresetDates } from "@/lib/analyst/reportPeriod";
import {
  fetchLandingPageText,
  gateLandingPageUrl,
  userUrlAllowList,
  wrapPageForModel,
} from "@/lib/analyst/landingPage";
import { refusalNoticeText } from "@/lib/analyst/streamReducer";
import type { GenerateReportInput } from "@/types/chat";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Limits ──────────────────────────────────────────────────────────────────
const MAX_BODY_BYTES = 512_000;
/** Model requests per reply, the wrap-up turn included. */
const MAX_TOOL_ITERATIONS = 15;
/** Per request; covers adaptive thinking + the reply. Streamed, so no HTTP-timeout pressure. */
const ANALYST_MAX_TOKENS = 64_000;
/** After this, the next request is the wrap-up turn (no more tools) — ~95 s before the hard stop. */
const SOFT_DEADLINE_MS = 190_000;
/** Abort before the platform's 300 s limit so the user gets a clean ending. */
const HARD_DEADLINE_MS = 285_000;
/** Time to response headers per model request (streaming bodies aren't bounded by it). */
const REQUEST_TIMEOUT_MS = 90_000;
/** SSE comment while a request is in flight, so proxies don't drop a stream that's silent while the model thinks. */
const KEEPALIVE_MS = 15_000;

const DISPLAYED = "Displayed successfully to the user.";

// ─── Per-admin rate limiter (in-memory) ─────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(adminId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(adminId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(adminId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    // Periodic cleanup: purge expired entries when map grows large
    if (rateLimitMap.size > 500) {
      for (const [key, val] of rateLimitMap) {
        if (now > val.resetAt) rateLimitMap.delete(key);
      }
    }
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function jsonError(status: number, error: string, headers?: Record<string, string>) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toIdList(raw: unknown, max: number): string[] {
  return Array.isArray(raw)
    ? Array.from(new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64))).slice(0, max)
    : [];
}

// ─── Errors → user-facing text ──────────────────────────────────────────────

function describeError(err: unknown): { message: string; retryable: boolean } {
  if (err instanceof RateLimitError) {
    return { message: `Meta's API rate limit was reached. Try again in about ${err.retryAfterSeconds}s.`, retryable: true };
  }
  if (err instanceof TokenExpiredError) {
    return { message: "The Meta access token is invalid or expired. Ask an admin to reconnect Meta.", retryable: false };
  }
  const described = describeClaudeError(err);
  if (described.code === "unknown" || described.code === "bad_request" || described.code === "auth") {
    console.error("[chat] analysis failed:", err);
  } else {
    console.warn("[chat] analysis failed:", described.code, err instanceof Error ? err.message : err);
  }
  return { message: described.message, retryable: described.retryable };
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message.slice(0, 300) : fallback;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) return jsonError(401, "Unauthorized");
  // The middleware checked the cookie's permission snapshot (up to 7 days old);
  // the DB is the truth — a removed admin or a revoked `analyst` perm stops here.
  const admin = await requireAdminRecord();
  if (!admin || (!admin.isSuper && !admin.permissions.analyst)) return jsonError(403, "Forbidden");

  if (!checkRateLimit(session.adminId)) {
    return jsonError(429, "Too many requests. Please wait before sending another message.", { "Retry-After": "60" });
  }

  const bodyResult = await readJsonCapped(request, MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    return bodyResult.reason === "too_large"
      ? jsonError(413, "This conversation is too large to send. Start a new chat.")
      : jsonError(400, "Invalid request body");
  }
  if (!isPlainObject(bodyResult.value)) return jsonError(400, "Invalid request body");
  const body = bodyResult.value;

  const history = parseAnalystHistory(body.messages);
  if (!history.ok) return jsonError(400, history.error);

  const dateRangeResult = parseAnalystDateRange(body.dateRange);
  if (!dateRangeResult.ok) return jsonError(400, dateRangeResult.error);
  // Presets → today's explicit business-day dates: Meta reads are cached for
  // 24h by request, so a preset ("today") fetched late one day would be served
  // as the next day's. Explicit dates make each calendar day its own query.
  const todayYmd = businessTodayYmd();
  const dateRange = resolvePresetDates(dateRangeResult.value, todayYmd);
  const periodLabel = dateRangeResult.value.preset
    ? `${dateRangeLabel(dateRangeResult.value)} (${dateRange.since} to ${dateRange.until})`
    : dateRangeLabel(dateRange);
  // Pages the analyst may open: sites the user typed (see lib/analyst/landingPage).
  const urlAllowList = userUrlAllowList(history.messages);

  const model: ChatModelId =
    typeof body.model === "string" && ALLOWED_MODELS.includes(body.model as ChatModelId)
      ? (body.model as ChatModelId)
      : DEFAULT_MODEL;
  const depth = parseAnalysisDepth(body.depth);
  const effort: ClaudeEffort = ANALYSIS_DEPTHS[depth];
  const selectedAccountIds = toIdList(body.selectedAccountIds, 50);
  const selectedCampaignIds = toIdList(body.selectedCampaignIds, 200);

  // Client disconnect (Stop, closed tab) or the hard deadline stops the
  // Claude stream and any running tool, instead of finishing a reply nobody reads.
  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  request.signal.addEventListener("abort", onClientAbort, { once: true });

  const encoder = new TextEncoder();
  let closed = false;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      let timedOut = false;
      const startedAt = Date.now();
      const hardStop = setTimeout(() => {
        timedOut = true;
        abort.abort();
      }, HARD_DEADLINE_MS);
      // An SSE comment (lib/chatStreamParser skips frames without an event).
      const keepAlive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, KEEPALIVE_MS);

      try {
        const context = await buildAnalystContext({
          dateRange,
          selectedAccountIds,
          selectedCampaignIds,
          onStatus: (message) => send("status", { message }),
        });
        if (abort.signal.aborted) {
          if (timedOut) send("done", { stopReason: "timeout" });
          return;
        }
        send("status", { message: "Analyzing…" });

        const system: BetaTextBlockParam[] = [
          { type: "text", text: ANALYST_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          {
            type: "text",
            text: buildDataBlock({
              periodLabel,
              todayYmd,
              scope: context.scope,
              contextText: context.contextText,
            }),
            cache_control: { type: "ephemeral" },
          },
        ];

        const runTools = async (calls: BetaToolUseBlock[]): Promise<BetaToolResultBlockParam[]> => {
          type Plan =
            | { call: BetaToolUseBlock; error: string }
            | { call: BetaToolUseBlock; kind: "display"; input: unknown }
            | { call: BetaToolUseBlock; kind: "report"; input: GenerateReportInput }
            | { call: BetaToolUseBlock; kind: "landing"; url: string };

          const plans: Plan[] = calls.map((call) => {
            if (DISPLAY_TOOL_NAMES.has(call.name)) {
              const v = validateDisplayInput(call.name, call.input);
              return v && v.ok ? { call, kind: "display", input: v.value } : { call, error: v && !v.ok ? v.error : "invalid input" };
            }
            if (call.name === "generate_report") {
              const v = validateReportInput(call.input);
              if (!v.ok) return { call, error: v.error };
              if (!context.knownAccountIds.has(v.value.accountId)) {
                return { call, error: `${v.value.accountId} isn't one of the connected ad accounts — use an ID from the data.` };
              }
              const input = { ...v.value };
              if (input.landingPageUrl && input.sections.includes("landing_page")) {
                const gate = gateLandingPageUrl(input.landingPageUrl, urlAllowList);
                if (!gate.ok) return { call, error: `landingPageUrl: ${gate.error}` };
                input.landingPageUrl = gate.url;
              } else {
                delete input.landingPageUrl;
              }
              return { call, kind: "report", input };
            }
            if (call.name === "fetch_landing_page") {
              const v = validateLandingPageInput(call.input);
              if (!v.ok) return { call, error: v.error };
              const gate = gateLandingPageUrl(v.value.url, urlAllowList);
              return gate.ok ? { call, kind: "landing", url: gate.url } : { call, error: gate.error };
            }
            return { call, error: `Unknown tool "${call.name}".` };
          });

          // Announce every accepted call first, so the UI (and the history it
          // sends back) keeps one assistant turn's calls together.
          for (const plan of plans) {
            if ("error" in plan) continue;
            const input = plan.kind === "landing" ? { url: plan.url } : plan.input;
            send("tool_use", { id: plan.call.id, name: plan.call.name, input });
          }

          return Promise.all(
            plans.map(async (plan): Promise<BetaToolResultBlockParam> => {
              const id = plan.call.id;
              if ("error" in plan) {
                // Invalid input: the model sees why and can retry; the UI shows nothing.
                return { type: "tool_result", tool_use_id: id, is_error: true, content: `Invalid input: ${plan.error}` };
              }
              if (plan.kind === "display") {
                send("tool_result", { tool_use_id: id, result: DISPLAYED });
                return { type: "tool_result", tool_use_id: id, content: DISPLAYED };
              }
              if (plan.kind === "report") {
                try {
                  const report = await generateReport(plan.input, { dateRange, signal: abort.signal });
                  send("tool_result", { tool_use_id: id, result: report });
                  return { type: "tool_result", tool_use_id: id, content: JSON.stringify(report) };
                } catch (err) {
                  const message = errorMessage(err, "Report generation failed.");
                  send("tool_result", { tool_use_id: id, result: message, isError: true });
                  return { type: "tool_result", tool_use_id: id, is_error: true, content: `Error: ${message}` };
                }
              }
              try {
                const page = await fetchLandingPageText(plan.url, abort.signal);
                const forModel = wrapPageForModel(page.url, page.text);
                send("tool_result", {
                  tool_use_id: id,
                  result: `Read ${page.text.length.toLocaleString("en-US")} characters from ${new URL(page.url).host}`,
                  content: forModel,
                });
                return { type: "tool_result", tool_use_id: id, content: forModel };
              } catch (err) {
                const message = errorMessage(err, "Couldn't fetch the page.");
                send("tool_result", { tool_use_id: id, result: message, isError: true });
                return { type: "tool_result", tool_use_id: id, is_error: true, content: `Error: ${message}` };
              }
            })
          );
        };

        const onEvent = (event: ToolLoopEvent) => {
          switch (event.type) {
            case "refusal":
              send("refusal", {
                category: event.category,
                message: event.explanation ?? refusalNoticeText(event.category),
              });
              break;
            default: {
              const { type, ...data } = event;
              send(type, data);
            }
          }
        };

        const result = await runToolLoop({
          client: anthropic,
          model,
          system,
          tools: ANALYST_TOOLS,
          messages: history.messages as BetaMessageParam[],
          effort,
          maxTokens: ANALYST_MAX_TOKENS,
          maxIterations: MAX_TOOL_ITERATIONS,
          softDeadline: startedAt + SOFT_DEADLINE_MS,
          display: "updates",
          signal: abort.signal,
          requestTimeoutMs: REQUEST_TIMEOUT_MS,
          runTools,
          onEvent,
        });

        console.info(
          `[chat] admin=${session.adminId} effort=${effort} stop=${result.stopReason} iterations=${result.iterations}` +
            ` servedBy=${result.servedBy} in=${result.usage.inputTokens} out=${result.usage.outputTokens}` +
            ` cacheRead=${result.usage.cacheReadTokens} cacheWrite=${result.usage.cacheWriteTokens}` +
            ` ms=${Date.now() - startedAt}`
        );

        if (result.stopReason === "aborted") {
          if (timedOut) send("done", { stopReason: "timeout", servedBy: result.servedBy });
          return;
        }
        send("done", { stopReason: result.stopReason, servedBy: result.servedBy });
      } catch (err) {
        if (abort.signal.aborted && !timedOut) return; // the client left
        if (timedOut) {
          send("done", { stopReason: "timeout" });
          return;
        }
        send("error", describeError(err));
      } finally {
        clearTimeout(hardStop);
        clearInterval(keepAlive);
        request.signal.removeEventListener("abort", onClientAbort);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
