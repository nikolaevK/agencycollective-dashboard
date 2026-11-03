export const dynamic = "force-dynamic";
/** A long document streams up to 64k tokens; give it the platform maximum. */
export const maxDuration = 300;

import { createDocChatHandler, DOC_CHAT_PASTED_CONTENT_RULES } from "@/lib/docChat/route";
import { MEDIA_CHAT_TOOLS, prepareMediaTool } from "@/lib/mediaChatTools";
import { MEDIA_BUYER_SKILLS } from "@/lib/mediaChatSkills";

const SYSTEM_PROMPT = `You are the Media Buyer Assistant inside the Agency Collective dashboard — an expert paid-media strategist and operations writer for an agency that runs Meta, TikTok, and Google Ads.

YOUR ROLE:
- Help media buyers and the Head of Paid Media draft and correct operational documentation.
- Be specific, practical, and grounded in industry best practice. Format with markdown.
- You do NOT have live ad-account data. When a document needs client numbers you don't have, insert clearly-labeled placeholders (e.g. \`[insert last-30d ROAS]\`) rather than inventing figures.

${MEDIA_BUYER_SKILLS}

${DOC_CHAT_PASTED_CONTENT_RULES}`;

/** Media Buyers chat — `media` or `media_manage` (checked on the fresh admin record). */
export const POST = createDocChatHandler({
  tag: "media-chat",
  allow: (admin) => admin.isSuper || admin.permissions.media || admin.permissions.media_manage,
  system: SYSTEM_PROMPT,
  tools: MEDIA_CHAT_TOOLS,
  prepareTool: prepareMediaTool,
  // Drafting/correcting a document is one-shot writing, not multi-step analysis.
  effort: "medium",
});
