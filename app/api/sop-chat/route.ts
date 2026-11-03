export const dynamic = "force-dynamic";
/** A long document streams up to 64k tokens; give it the platform maximum. */
export const maxDuration = 300;

import Anthropic from "@anthropic-ai/sdk";
import { getAdminSession } from "@/lib/adminSession";
import { requireAdminRecord } from "@/lib/api/requireAdmin";
import { SOP_CHAT_TOOLS, SOP_DISPLAY_TOOLS } from "@/lib/sopChatTools";
import { SOP_SKILLS } from "@/lib/sopChatSkills";
import { ALLOWED_MODELS, DEFAULT_MODEL, type ChatModelId } from "@/lib/chatModels";
import type { ApiChatMessage, ApiContentBlock } from "@/types/chat";
import type {
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { runToolLoop } from "@/lib/claude/toolLoop";
import { describeClaudeError } from "@/lib/claude/errors";
import { repairToolPairs } from "@/lib/analyst/history";
import { refusalNoticeText } from "@/lib/analyst/streamReducer";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── Input constraints ──────────────────────────────────────────────────────
const MAX_MESSAGES        = 50;
const MAX_MESSAGE_CHARS   = 60_000; // pasted documents (for conversion) can be long
const MAX_TOOL_ITERATIONS = 8;
// Thinking counts toward max_tokens (Opus 5.5 always thinks), and documents are
// emitted as ONE tool-call argument — a call cut off at the cap is dropped
// whole, so give long documents room. Streamed: no HTTP-timeout pressure.
const MAX_OUTPUT_TOKENS   = 64_000;
// Drafting/correcting a document is one-shot writing, not multi-step analysis.
const EFFORT = "medium" as const;

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
  // Fresh from the DB: a deleted admin's still-valid cookie stops here.
  if (!(await requireAdminRecord())) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
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

    // Stop / tab close aborts the Claude request instead of letting it run on.
    const abort = new AbortController();
    const onClientAbort = () => abort.abort();
    request.signal.addEventListener("abort", onClientAbort);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(sseEvent(event, data)));
          } catch {
            // stream already closed by the client
          }
        };
        try {
          // Opus 5.5 tool loop (lib/claude/toolLoop): replays each turn with its
          // thinking blocks, handles refusals + server-side fallback.
          const result = await runToolLoop({
            client: anthropic,
            model,
            system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            tools: SOP_CHAT_TOOLS as unknown as BetaToolUnion[],
            // A stopped reply can leave an unanswered tool_use in history — repair it.
            messages: repairToolPairs(validMessages as unknown as ApiChatMessage[]) as unknown as BetaMessageParam[],
            effort: EFFORT,
            maxTokens: MAX_OUTPUT_TOKENS,
            maxIterations: MAX_TOOL_ITERATIONS,
            // This UI renders text + document cards only, not progress notes.
            display: "omitted",
            signal: abort.signal,
            requestTimeoutMs: 120_000,
            // All tools are presentational — auto-acknowledge. Emitted here (not at
            // content_block_stop) so a declined turn's calls never reach the UI.
            runTools: async (calls) =>
              calls.map((tool): BetaToolResultBlockParam => {
                const known = SOP_DISPLAY_TOOLS.has(tool.name);
                const ack = known ? "Displayed to the user." : `Unknown tool: ${tool.name}`;
                send("tool_use", { id: tool.id, name: tool.name, input: tool.input });
                send("tool_result", { tool_use_id: tool.id, result: ack });
                return { type: "tool_result", tool_use_id: tool.id, content: ack, ...(known ? {} : { is_error: true }) };
              }),
            onEvent: (event) => {
              if (event.type === "text_delta") send("text_delta", { text: event.text });
              else if (event.type === "refusal") {
                send("error", { message: refusalNoticeText(event.category, event.explanation ?? undefined) });
              }
            },
          });

          if (result.stopReason === "aborted" || result.stopReason === "refusal") return;
          if (result.stopReason === "iteration_limit") {
            send("text_delta", {
              text: "\n\n*Reached the maximum number of operations for this response. Send a follow-up if you need more.*",
            });
          } else if (result.stopReason === "max_tokens") {
            // A document cut off mid-call is never shown and isn't in the history,
            // so "continue" has nothing to continue from.
            send("text_delta", {
              text: "\n\n*The reply hit its length limit — this document is too long for one reply. Ask for it in parts (for example, a few sections at a time).*",
            });
          }
          send("done", {});
        } catch (err) {
          if (abort.signal.aborted) return;
          // Log the real error server-side; the client gets a safe message.
          console.error("[sop-chat] stream error:", err);
          send("error", { message: describeClaudeError(err).message });
        } finally {
          request.signal.removeEventListener("abort", onClientAbort);
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      },
      cancel() {
        abort.abort();
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
