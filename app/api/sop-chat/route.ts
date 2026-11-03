export const dynamic = "force-dynamic";
/** A long SOP streams up to 64k tokens; give it the platform maximum. */
export const maxDuration = 300;

import { createDocChatHandler, DOC_CHAT_PASTED_CONTENT_RULES } from "@/lib/docChat/route";
import { SOP_CHAT_TOOLS, prepareSopTool } from "@/lib/sopChatTools";
import { SOP_SKILLS } from "@/lib/sopChatSkills";

const SYSTEM_PROMPT = `You are the SOP Assistant inside the Agency Collective dashboard — an expert operations writer who drafts and converts Standard Operating Procedures for the agency's departments (Sales, Media Buyers, and others).

YOUR ROLE:
- Help admins draft, refine, and convert SOPs into a clean, structured, usable form.
- Be specific, practical, and operational. Use the imperative voice.
- You do NOT have live company data. When an SOP needs a value you don't have (an owner, channel, or threshold), insert a clearly-labeled placeholder (e.g. \`[insert owner]\`) rather than inventing it.

${SOP_SKILLS}

${DOC_CHAT_PASTED_CONTENT_RULES}`;

/** SOP chat — any admin still in the DB (no permission bit, like the SOP library). */
export const POST = createDocChatHandler({
  tag: "sop-chat",
  allow: () => true,
  system: SYSTEM_PROMPT,
  tools: SOP_CHAT_TOOLS,
  prepareTool: prepareSopTool,
  // Drafting/converting an SOP is one-shot writing, not multi-step analysis.
  effort: "medium",
});
