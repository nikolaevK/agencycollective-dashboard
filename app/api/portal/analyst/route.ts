export const dynamic = "force-dynamic";

import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { readActiveAccountsForUser } from "@/lib/clientAccounts";
import { CHAT_TOOLS, DISPLAY_TOOLS } from "@/lib/chatTools";
import { generateReport } from "@/lib/reportGenerator";
import { fetchAndExtractPage } from "@/lib/urlValidation";
import { rateLimitedResponse } from "@/lib/rateLimit";
import { RateLimitError, TokenExpiredError } from "@/lib/meta/client";
import { buildSingleAccountContext } from "@/lib/chatContext";
import {
  buildClientSystemPrompt,
  checkUserInput,
  runInputJudge,
  runOutputJudge,
  OutputSanitizer,
  detectSystemPromptLeak,
  validateDisplayToolInput,
} from "@/lib/aiGuards";
import type { DateRangeInput } from "@/types/api";
import type { GenerateReportInput, ApiContentBlock } from "@/types/chat";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Match admin defaults — capability parity inside scope.
const MAX_MESSAGES        = 50;
const MAX_MESSAGE_CHARS   = 8_000;
const MAX_TOOL_ITERATIONS = 15;
const ALLOWED_PRESETS     = new Set(["last_7d", "last_14d", "last_30d", "last_90d", "this_month", "last_month"]);
const MODEL               = "claude-sonnet-4-6"; // hard-locked; client cannot override
const OUTPUT_JUDGE_ENABLED = process.env.CLIENT_ANALYST_OUTPUT_JUDGE === "1";

function badRequest(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 400 });
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildDateLabel(dr: DateRangeInput): string {
  if (dr.preset) {
    const labels: Record<string, string> = {
      last_7d:    "Last 7 days",
      last_14d:   "Last 14 days",
      last_30d:   "Last 30 days",
      last_90d:   "Last 90 days",
      this_month: "This month",
      last_month: "Last month",
    };
    return labels[dr.preset] ?? dr.preset;
  }
  return "Last 7 days";
}

function isValidContentBlock(block: unknown): block is ApiContentBlock {
  if (!block || typeof block !== "object") return false;
  const b = block as Record<string, unknown>;
  if (b.type === "text" && typeof b.text === "string") return true;
  if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") return true;
  if (b.type === "tool_result" && typeof b.tool_use_id === "string") return true;
  return false;
}

function validateMessageContent(
  content: unknown,
): Anthropic.Messages.MessageParam["content"] | null {
  if (typeof content === "string") {
    if (content.length > MAX_MESSAGE_CHARS) return null;
    return content;
  }
  if (Array.isArray(content)) {
    const blocks: Anthropic.Messages.ContentBlockParam[] = [];
    for (const block of content) {
      if (!isValidContentBlock(block)) return null;
      if (block.type === "text") {
        if (block.text.length > MAX_MESSAGE_CHARS) return null;
        blocks.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        blocks.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      } else if (block.type === "tool_result") {
        blocks.push({
          type: "tool_result",
          tool_use_id: block.tool_use_id,
          content: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
        });
      }
    }
    return blocks.length > 0 ? blocks : null;
  }
  return null;
}

/** Pull the latest user-typed text from the message list (for input filters). */
function latestUserText(messages: Anthropic.Messages.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    // Skip user turns that are tool_result-only — those aren't typed input.
    const hasText = m.content.some((b) => b.type === "text");
    if (!hasText) continue;
    return m.content
      .filter((b): b is Anthropic.Messages.TextBlockParam => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
  return "";
}

export async function POST(request: Request) {
  // ── Layer 0: Auth ──────────────────────────────────────────────────────────
  const session = getSession();
  if (!session) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const user = await findUser(session.userId);
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  if (!user.analystEnabled) {
    return new Response(
      JSON.stringify({
        error: "AI Analyst access has been disabled for your account. Contact your account manager if you believe this is in error.",
      }),
      { status: 403 },
    );
  }

  // ── Layer 5: Rate limits (per-minute, hourly, daily) ───────────────────────
  const userId = session.userId;
  const minuteCheck = rateLimitedResponse(`analyst:client:${userId}:min`, 15, 60_000,
    "Too many requests. Please slow down.");
  if (minuteCheck) return minuteCheck;
  const hourCheck = rateLimitedResponse(`analyst:client:${userId}:hour`, 120, 3600_000,
    "Hourly request limit reached. Please try again later.");
  if (hourCheck) return hourCheck;
  const dayCheck = rateLimitedResponse(`analyst:client:${userId}:day`, 600, 86_400_000,
    "Daily request limit reached. Please try again tomorrow.");
  if (dayCheck) return dayCheck;

  try {
    const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
    if (contentLength > 512_000) return badRequest("Request body too large");

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Invalid request body");

    const {
      messages: rawMessages,
      accountId: rawAccountId,
      dateRange: dateRangeRaw,
    } = body as Record<string, unknown>;

    // ── Validate accountId + ownership ──────────────────────────────────────
    if (typeof rawAccountId !== "string" || rawAccountId.length > 64) {
      return badRequest("accountId is required");
    }
    const ownedAccounts = await readActiveAccountsForUser(userId);
    const ownedAccount = ownedAccounts.find((a) => a.accountId === rawAccountId);
    if (!ownedAccount) {
      return new Response(
        JSON.stringify({ error: "You don't have access to that account." }),
        { status: 403 },
      );
    }
    const accountId = ownedAccount.accountId;

    // ── Validate messages ───────────────────────────────────────────────────
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return badRequest("messages is required");
    if (rawMessages.length > MAX_MESSAGES) return badRequest(`messages exceeds limit of ${MAX_MESSAGES}`);

    const validMessages: Anthropic.Messages.MessageParam[] = [];
    for (const msg of rawMessages) {
      if (!msg || typeof msg !== "object") return badRequest("Invalid message format");
      const { role, content } = msg as Record<string, unknown>;
      if (!["user", "assistant"].includes(role as string)) return badRequest("Invalid message role");
      const validated = validateMessageContent(content);
      if (validated === null) return badRequest("Invalid message content");
      validMessages.push({ role: role as "user" | "assistant", content: validated });
    }

    // ── Validate dateRange (presets only — narrows attack surface) ──────────
    const dateRangeInput = (dateRangeRaw && typeof dateRangeRaw === "object")
      ? (dateRangeRaw as Record<string, unknown>)
      : {};
    if (
      dateRangeInput.preset !== undefined &&
      (typeof dateRangeInput.preset !== "string" || !ALLOWED_PRESETS.has(dateRangeInput.preset))
    ) {
      return badRequest("Invalid date preset");
    }
    const dateRange: DateRangeInput =
      typeof dateRangeInput.preset === "string" && ALLOWED_PRESETS.has(dateRangeInput.preset)
        ? { preset: dateRangeInput.preset as DateRangeInput["preset"] }
        : { preset: "last_7d" };

    // ── Layer 2a + 2b: Pre-input regex/PII filters on the latest user text.
    // Cheap and synchronous — must short-circuit before we spend on the
    // judge call or Meta data fetch.
    const userText = latestUserText(validMessages);
    if (userText) {
      const guard = checkUserInput(userText, { maxChars: MAX_MESSAGE_CHARS });
      if (!guard.ok) {
        return new Response(JSON.stringify({ error: guard.message }), { status: 400 });
      }
    }

    // ── Layer 2d (judge) + context fetch in parallel.
    // The judge is independent of the context fetch; running them sequentially
    // adds ~300–600 ms before streaming starts. Wasted work on a DENY is
    // bounded — context comes from cache or one Meta batch call.
    const dateLabel = buildDateLabel(dateRange);
    const [judge, ctx] = await Promise.all([
      userText
        ? runInputJudge(anthropic, userText)
        : Promise.resolve({ verdict: "ALLOW" as const, reason: "no user text" }),
      buildSingleAccountContext(accountId, dateRange),
    ]);
    if (judge.verdict === "DENY") {
      console.warn(`[analyst:judge:DENY] user=${userId} reason=${judge.reason}`);
      return new Response(
        JSON.stringify({
          error: `I can only help with analysis of your ${ownedAccount.label ?? accountId} ad account. Try a question about performance, campaigns, or generating a report.`,
        }),
        { status: 400 },
      );
    }
    const { contextString, account } = ctx;
    if (!account) {
      return new Response(
        JSON.stringify({ error: "Could not load account data. Please try again later." }),
        { status: 502 },
      );
    }

    const systemPrompt = buildClientSystemPrompt(account, dateLabel, contextString);

    // ── SSE streaming with tool use loop (Layer 4 sanitization) ─────────────
    const encoder = new TextEncoder();
    const sanitizer = new OutputSanitizer();

    const readable = new ReadableStream({
      async start(controller) {
        function emit(event: string, data: unknown) {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        }

        try {
          let messages = [...validMessages];
          let iterations = 0;
          let fullAssistantText = "";

          while (iterations < MAX_TOOL_ITERATIONS) {
            iterations++;

            const response = await anthropic.messages.create(
              {
                model: MODEL,
                max_tokens: 4096,
                system: systemPrompt,
                messages,
                tools: CHAT_TOOLS,
                stream: true,
              },
              { timeout: 60_000 },
            );

            let currentToolId = "";
            let currentToolName = "";
            let currentToolInput = "";
            let accumulatedText = "";
            const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
            const invalidDisplayToolIds = new Set<string>();
            let stopReason: string | null = null;

            for await (const event of response) {
              if (event.type === "content_block_start") {
                if (event.content_block.type === "tool_use") {
                  currentToolId = event.content_block.id;
                  currentToolName = event.content_block.name;
                  currentToolInput = "";
                }
              } else if (event.type === "content_block_delta") {
                if (event.delta.type === "text_delta") {
                  accumulatedText += event.delta.text;
                  // Layer 4a: Streaming sanitization before reaching the client
                  const safe = sanitizer.feed(event.delta.text);
                  if (safe) emit("text_delta", { text: safe });
                } else if (event.delta.type === "input_json_delta") {
                  currentToolInput += event.delta.partial_json;
                }
              } else if (event.type === "content_block_stop") {
                if (currentToolId && currentToolName) {
                  let parsedInput: Record<string, unknown>;
                  try {
                    parsedInput = JSON.parse(currentToolInput || "{}");
                  } catch {
                    parsedInput = {};
                  }

                  // Layer 3: Display-tool shape validation. Push to toolUseBlocks
                  // unconditionally so Anthropic's required tool_use → tool_result
                  // pairing holds; mark invalid ones so the result loop returns
                  // is_error and the model retries.
                  toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: parsedInput });
                  if (DISPLAY_TOOLS.has(currentToolName) && !validateDisplayToolInput(currentToolName, parsedInput)) {
                    invalidDisplayToolIds.add(currentToolId);
                    // Don't emit tool_use to client — UI would render junk.
                  } else {
                    emit("tool_use", {
                      id: currentToolId,
                      name: currentToolName,
                      input: parsedInput,
                    });
                  }

                  currentToolId = "";
                  currentToolName = "";
                  currentToolInput = "";
                }
              } else if (event.type === "message_delta") {
                stopReason = event.delta.stop_reason;
              }
            }

            // Flush any remaining tail buffer
            const tail = sanitizer.flush();
            if (tail) emit("text_delta", { text: tail });

            fullAssistantText += accumulatedText;

            // Layer 4b: System-prompt leak check against the full text so far
            if (detectSystemPromptLeak(fullAssistantText)) {
              console.warn(`[analyst:leak] user=${userId} — system prompt fragment detected in output`);
              emit("error", {
                message: "Response was withheld by the safety filter — please rephrase.",
              });
              break;
            }

            if (stopReason !== "tool_use" || toolUseBlocks.length === 0) break;

            // ── Process tool calls ────────────────────────────────────────────
            const assistantBlocks: Anthropic.Messages.ContentBlockParam[] = [];
            if (accumulatedText) assistantBlocks.push({ type: "text", text: accumulatedText });
            for (const tool of toolUseBlocks) {
              assistantBlocks.push({
                type: "tool_use",
                id: tool.id,
                name: tool.name,
                input: tool.input,
              });
            }

            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
            for (const tool of toolUseBlocks) {
              if (DISPLAY_TOOLS.has(tool.name)) {
                if (invalidDisplayToolIds.has(tool.id)) {
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: tool.id,
                    content: `Error: ${tool.name} input was malformed. Please retry with the correct schema.`,
                    is_error: true,
                  });
                } else {
                  const result = "Displayed successfully to the user.";
                  toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
                  emit("tool_result", { tool_use_id: tool.id, result });
                }
              } else if (tool.name === "generate_report") {
                try {
                  const reportInput = tool.input as unknown as GenerateReportInput;
                  // Scope guard: model-supplied accountId MUST match the validated account.
                  if (reportInput.accountId !== accountId) {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: tool.id,
                      content: `Error: report can only be generated for the active account ${accountId}.`,
                      is_error: true,
                    });
                    continue;
                  }
                  const report = await generateReport(reportInput);
                  emit("tool_result", { tool_use_id: tool.id, result: report });
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: tool.id,
                    content: JSON.stringify(report),
                  });
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Report generation failed";
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: tool.id,
                    content: `Error: ${msg}`,
                    is_error: true,
                  });
                }
              } else if (tool.name === "fetch_landing_page") {
                try {
                  const { url } = tool.input as { url: string };
                  const text = await fetchAndExtractPage(url);
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: tool.id,
                    content: `Landing page content from ${url}:\n\n${text}`,
                  });
                  emit("tool_result", { tool_use_id: tool.id, result: "Landing page fetched successfully." });
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "Failed to fetch landing page";
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: tool.id,
                    content: `Error: ${msg}`,
                    is_error: true,
                  });
                }
              }
            }

            messages = [
              ...messages,
              { role: "assistant", content: assistantBlocks },
              { role: "user", content: toolResults },
            ];
          }

          if (iterations >= MAX_TOOL_ITERATIONS) {
            emit("text_delta", {
              text: "\n\n*I've reached the maximum number of tool operations for this response. Please send a follow-up message if you need more analysis.*",
            });
          }

          // Layer 4c: Optional Haiku output safety judge
          if (OUTPUT_JUDGE_ENABLED && fullAssistantText.trim()) {
            const verdict = await runOutputJudge(anthropic, fullAssistantText);
            if (verdict.verdict === "FLAG") {
              console.warn(`[analyst:output-judge:FLAG] user=${userId} reason=${verdict.reason}`);
              emit("error", {
                message: "Response was withheld by the safety filter — please rephrase.",
              });
            }
          }

          emit("done", {});
          controller.close();
        } catch (err) {
          try {
            const msg = err instanceof Error ? err.message : "Internal error";
            console.error("[analyst] stream error:", err);
            controller.enqueue(encoder.encode(sseEvent("error", { message: msg })));
          } catch {
            // Controller may already be closed
          }
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return new Response(
        JSON.stringify({
          error: "Meta API rate limit reached. Please try again shortly.",
          retryAfter: err.retryAfterSeconds,
        }),
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    if (err instanceof TokenExpiredError) {
      return new Response(
        JSON.stringify({ error: "Meta access token is invalid or expired." }),
        { status: 401 },
      );
    }
    console.error("[analyst] handler error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500 },
    );
  }
}
