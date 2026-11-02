import { redirect } from "next/navigation";
import { ExternalLink, FlaskConical } from "lucide-react";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { StatusBadge, badgeTone } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  getPeptideAiPolicy,
  isPeptideAiConfigured,
  readAndReconcilePeptideAi,
  schedulePeptideAiSync,
} from "@/lib/peptideAi";
import {
  PEPTIDE_AI_STATE_LABEL,
  PEPTIDE_AI_STATE_TONE,
  PEPTIDE_AI_WARN_SHARE,
  formatCycleDate,
  formatUsd,
  ordinalDay,
  type PeptideAiState,
} from "@/lib/peptideAiPresentation";

// Usage is read live from Peptide AI on every visit.
export const dynamic = "force-dynamic";


// No state chip here: clients get the message, never the internal reason
// ("Blocked in Peptide AI" is the admin label).
function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <DashboardShell>
      <div className="max-w-2xl space-y-4">
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Peptide AI</h1>
        <div className={cn("rounded-3xl border px-4 py-3", badgeTone.warning)}>
          <p className="font-medium text-sm">{title}</p>
          <p className="mt-1 text-sm opacity-90">{body}</p>
        </div>
      </div>
    </DashboardShell>
  );
}

export default async function PeptideAiPage({ params }: { params: { slug: string } }) {
  const session = getSession();
  if (!session) redirect("/?portal=client");

  const user = await findUser(session.userId);
  if (!user || user.slug !== params.slug) redirect("/?portal=client");

  const policy = isPeptideAiConfigured() ? await getPeptideAiPolicy(user) : null;
  if (!policy || !policy.enabled) {
    // Re-push the off policy, in case the push that switched it off was missed.
    if (policy) schedulePeptideAiSync(user.id);
    return !policy || policy.offReason === "disabled" ? (
      <Unavailable
        title="Peptide AI is currently unavailable on your account."
        body="Please contact your account manager if you'd like access."
      />
    ) : (
      <Unavailable
        title="Peptide AI is paused on your account."
        body="Your chats are kept. Please contact your account manager to turn it back on."
      />
    );
  }

  // Reads usage; pushes the policy only if Peptide AI is out of step with it.
  // Unreachable → the meter says so; launch still works.
  const usage = await readAndReconcilePeptideAi([policy], 5_000)
    .then((m) => m.get(user.id) ?? null)
    .catch((err) => {
      console.error("[peptideAi] portal usage read failed:", err instanceof Error ? err.message : err);
      return null;
    });
  if (usage?.provisioned && usage.status !== "active") {
    return (
      <Unavailable
        title="Peptide AI is unavailable on your account."
        body="Please contact your account manager."
      />
    );
  }

  const cap = policy.capCents;
  const spent = usage?.provisioned ? usage.spentCents : 0;
  const remaining = Math.max(0, cap - spent);
  const share = cap > 0 ? Math.min(1, spent / cap) : 0;
  const reached = spent >= cap;
  const nearly = !reached && share >= PEPTIDE_AI_WARN_SHARE;
  const resets =
    usage?.provisioned && usage.periodEnd
      ? `Resets on ${formatCycleDate(usage.periodEnd)}`
      : `Resets on the ${ordinalDay(policy.anchorDay)} of each month`;
  // The meter's state, from the same numbers the meter shows (this page's
  // budget), so the chip never disagrees with the bar.
  const state: PeptideAiState = !usage
    ? "unknown"
    : !usage.provisioned
      ? "never_opened"
      : reached
        ? "capped"
        : nearly
          ? "near_cap"
          : !usage.lastActiveAt
            ? "not_used"
            : "active";

  return (
    <DashboardShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Peptide AI</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Your research-peptide marketing assistant: ad creatives, copy and landing-page audits.
            It opens in a new tab and signs you in automatically.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div className="flex min-w-0 items-center gap-2">
              <FlaskConical className="size-4 shrink-0 text-muted-foreground" />
              <CardTitle>This month&apos;s AI budget</CardTitle>
            </div>
            {/* No chip when usage couldn't be read — it can still be opened. */}
            {state !== "unknown" && (
              <StatusBadge tone={PEPTIDE_AI_STATE_TONE[state]}>{PEPTIDE_AI_STATE_LABEL[state]}</StatusBadge>
            )}
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
                {usage ? formatUsd(spent) : "—"}{" "}
                <span className="text-base font-normal text-muted-foreground">of {formatUsd(cap)} used</span>
              </p>
              <CardDescription>{resets}</CardDescription>
            </div>

            <Progress
              value={share * 100}
              aria-label="AI budget used"
              className={cn(
                "h-2.5",
                reached ? "[&>div]:bg-red-500" : nearly ? "[&>div]:bg-amber-500" : "[&>div]:bg-chart-1"
              )}
            />

            {!usage ? (
              <p className="text-sm text-muted-foreground">
                Usage can&apos;t be shown right now. You can still open Peptide AI.
              </p>
            ) : reached ? (
              <div role="status" className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
                <p className="font-medium">You&apos;ve hit this month&apos;s limit.</p>
                <p className="mt-1">
                  Peptide AI won&apos;t take new requests until your budget resets
                  {usage.provisioned && usage.periodEnd ? ` on ${formatCycleDate(usage.periodEnd)}` : ""}. Your
                  chats stay saved and you can still open them. Need more this month? Contact your account
                  manager.
                </p>
              </div>
            ) : nearly ? (
              <div role="status" className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.warning)}>
                <p className="font-medium">You&apos;ve used {Math.round(share * 100)}% of this month&apos;s budget.</p>
                <p className="mt-1">{formatUsd(remaining)} left. Unused budget doesn&apos;t carry over.</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {formatUsd(remaining)} left this month. Unused budget doesn&apos;t carry over.
              </p>
            )}

            <a
              href="/api/portal/peptide-ai/launch"
              target="_blank"
              rel="noopener"
              className={buttonVariants({ size: "lg" })}
            >
              Open Peptide AI
              <ExternalLink />
            </a>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
