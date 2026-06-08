export const dynamic = "force-dynamic";

import Anthropic from "@anthropic-ai/sdk";
import { getAdminSession } from "@/lib/adminSession";
import { SOP_CHAT_TOOLS, SOP_DISPLAY_TOOLS } from "@/lib/sopChatTools";
import { SOP_SKILLS } from "@/lib/sopChatSkills";
import { ALLOWED_MODELS, DEFAULT_MODEL, type ChatModelId } from "@/lib/chatModels";
import type { ApiContentBlock } from "@/types/chat";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Input constraints ──────────────────────────────────────────────────────
const MAX_MESSAGES        = 50;
const MAX_MESSAGE_CHARS   = 60_000; // pasted documents (for conversion) can be long
const MAX_TOOL_ITERATIONS = 8;
// The SOP is emitted as a tool-call argument; too low a cap truncates the JSON
// mid-stream and the SOP card renders empty.
const MAX_OUTPUT_TOKENS   = 16_000;

// ─── Per-session rate limiter (in-memory) ───────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX       = 20;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(adminId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(adminId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(adminId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
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

function badRequest(msg: string) {
  return new Response(JSON.stringify({ error: msg }), { status: 400 });
}

// ─── SSE helper ──────────────────────────────────────────────────────────────
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Validate API content blocks ─────────────────────────────────────────────
function isValidContentBlock(block: unknown): block is ApiContentBlock {
  if (!block || typeof block !== "object") return false;
  const b = block as Record<string, unknown>;
  if (b.type === "text" && typeof b.text === "string") return true;
  if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") return true;
  if (b.type === "tool_result" && typeof b.tool_use_id === "string") return true;
  return false;
}

function validateMessageContent(
  content: unknown
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

const SYSTEM_PROMPT = `You are the SOP Assistant inside the Agency Collective dashboard — an expert operations writer who drafts and converts Standard Operating Procedures for the agency's departments (Sales, Media Buyers, and others).

YOUR ROLE:
- Help admins draft, refine, and convert SOPs into a clean, structured, usable form.
- Be specific, practical, and operational. Use the imperative voice.
- You do NOT have live company data. When an SOP needs a value you don't have (an owner, channel, or threshold), insert a clearly-labeled placeholder (e.g. \`[insert owner]\`) rather than inventing it.

${SOP_SKILLS}`;

// ─── Main handler — any logged-in admin (no permission bit required) ─────────
export async function POST(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  if (!checkRateLimit(session.adminId)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait before sending another message." }),
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
    if (contentLength > 2_000_000) return badRequest("Request body too large");

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Invalid request body");

    const { messages: rawMessages, model: modelRaw } = body as Record<string, unknown>;

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

    const model: ChatModelId =
      typeof modelRaw === "string" && ALLOWED_MODELS.includes(modelRaw as ChatModelId)
        ? (modelRaw as ChatModelId)
        : DEFAULT_MODEL;

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let messages = [...validMessages];
          let iterations = 0;

          while (iterations < MAX_TOOL_ITERATIONS) {
            iterations++;

            const response = await anthropic.messages.create({
              model,
              max_tokens: MAX_OUTPUT_TOKENS,
              system: SYSTEM_PROMPT,
              messages,
              tools: SOP_CHAT_TOOLS,
              stream: true,
            }, { timeout: 120000 });

            let currentToolId = "";
            let currentToolName = "";
            let currentToolInput = "";
            let accumulatedText = "";
            const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
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
                  controller.enqueue(encoder.encode(sseEvent("text_delta", { text: event.delta.text })));
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
                  toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: parsedInput });
                  controller.enqueue(encoder.encode(sseEvent("tool_use", {
                    id: currentToolId, name: currentToolName, input: parsedInput,
                  })));
                  currentToolId = "";
                  currentToolName = "";
                  currentToolInput = "";
                }
              } else if (event.type === "message_delta") {
                stopReason = event.delta.stop_reason;
              }
            }

            // No tool calls → done.
            if (stopReason !== "tool_use" || toolUseBlocks.length === 0) {
              break;
            }

            const assistantBlocks: Anthropic.Messages.ContentBlockParam[] = [];
            if (accumulatedText) {
              assistantBlocks.push({ type: "text", text: accumulatedText });
            }
            for (const tool of toolUseBlocks) {
              assistantBlocks.push({
                type: "tool_use",
                id: tool.id,
                name: tool.name,
                input: tool.input,
              });
            }

            // All SOP tools are presentational — auto-acknowledge.
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
            for (const tool of toolUseBlocks) {
              const ack = SOP_DISPLAY_TOOLS.has(tool.name)
                ? "Displayed to the user."
                : `Unknown tool: ${tool.name}`;
              toolResults.push({
                type: "tool_result",
                tool_use_id: tool.id,
                content: ack,
              });
              controller.enqueue(encoder.encode(sseEvent("tool_result", {
                tool_use_id: tool.id,
                result: ack,
              })));
            }

            messages = [
              ...messages,
              { role: "assistant" as const, content: assistantBlocks },
              { role: "user" as const, content: toolResults },
            ];
          }

          if (iterations >= MAX_TOOL_ITERATIONS) {
            controller.enqueue(encoder.encode(sseEvent("text_delta", {
              text: "\n\n*Reached the maximum number of operations for this response. Send a follow-up if you need more.*",
            })));
          }
          controller.enqueue(encoder.encode(sseEvent("done", {})));
          controller.close();
        } catch (err) {
          console.error("[sop-chat] stream error:", err);
          try {
            const status = (err as { status?: number })?.status;
            const message =
              status === 429 ? "The assistant is rate-limited. Please wait a moment and try again."
              : status === 529 ? "The assistant is busy. Please try again shortly."
              : "Something went wrong generating a response. Please try again.";
            controller.enqueue(encoder.encode(sseEvent("error", { message })));
          } catch {
            // controller may already be closed
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
    console.error("[sop-chat] API error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500 }
    );
  }
}
