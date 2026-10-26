export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requirePortalUser } from "@/lib/api/requirePortalUser";
import {
  getPeptideAiPolicy,
  isLaunchState,
  isPeptideAiConfigured,
  peptideAiLaunchUrl,
  peptideAiStartUrl,
  schedulePeptideAiSync,
} from "@/lib/peptideAi";

/**
 * "Open Peptide AI". Without `state`, the browser is sent to Peptide AI's
 * /sso/start, which pins a random state to it and comes back here with it;
 * with `state`, this mints a single-use, minute-long launch token for the
 * signed-in client bound to that state and sends the browser on to Peptide
 * AI's /sso. Only ever for the cookie's own client. A client who can't launch
 * is sent back to the tab, which explains why — and the off policy is
 * re-pushed, in case the push that switched them off was missed.
 */
export async function GET(request: Request) {
  const guard = await requirePortalUser();
  if (guard.response) return NextResponse.redirect(new URL("/?portal=client", request.url), 303);
  const { user } = guard;

  const back = new URL(`/${user.slug}/portal/peptide-ai`, request.url);
  if (!isPeptideAiConfigured()) return NextResponse.redirect(back, 303);
  const policy = await getPeptideAiPolicy(user);
  if (!policy.enabled) {
    schedulePeptideAiSync(user.id);
    return NextResponse.redirect(back, 303);
  }

  const state = new URL(request.url).searchParams.get("state");
  const res = NextResponse.redirect(
    isLaunchState(state) ? await peptideAiLaunchUrl(policy, state) : peptideAiStartUrl(),
    303
  );
  res.headers.set("Cache-Control", "no-store");
  return res;
}
