import { redirect } from "next/navigation";
import { ExternalLink, FlaskConical } from "lucide-react";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { cn } from "@/lib/utils";
import {
  getPeptideAiPolicy,
  isPeptideAiConfigured,
  readAndReconcilePeptideAi,
  schedulePeptideAiSync,
} from "@/lib/peptideAi";
import {
  PEPTIDE_AI_WARN_SHARE,
  formatCycleDate,
  formatUsd,
  ordinalDay,
} from "@/lib/peptideAiPresentation";

// Usage is read live from Peptide AI on every visit.
export const dynamic = "force-dynamic";

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <DashboardShell>
      <div className="max-w-2xl space-y-3">
        <h1 className="text-2xl font-bold">Peptide AI</h1>
        <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="font-semibold text-sm">{title}</p>
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

  return (
    <DashboardShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-portal-on-surface md:text-3xl">
            <FlaskConical className="h-6 w-6 text-primary" />
            Peptide AI
          </h1>
          <p className="max-w-2xl text-portal-secondary-text">
            Your research-peptide marketing assistant: ad creatives, copy and landing-page audits.
            It opens in a new tab and signs you in automatically.
          </p>
        </div>

        <div className="space-y-5 rounded-xl border border-border/50 bg-card p-6 shadow-[0_4px_24px_rgba(32,48,68,0.04)] dark:border-white/[0.06] dark:shadow-none">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                This month&apos;s AI budget
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                {usage ? formatUsd(spent) : "—"}{" "}
                <span className="text-base font-medium text-muted-foreground">of {formatUsd(cap)} used</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground">{resets}</p>
          </div>

          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="AI budget used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(share * 100)}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all",
                reached ? "bg-red-500" : nearly ? "bg-amber-500" : "bg-primary"
              )}
              style={{ width: `${share * 100}%` }}
            />
          </div>

          {!usage ? (
            <p className="text-sm text-muted-foreground">
              Usage can&apos;t be shown right now. You can still open Peptide AI.
            </p>
          ) : reached ? (
            <div role="status" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-800 dark:text-red-300">
              <p className="font-semibold">You&apos;ve hit this month&apos;s limit.</p>
              <p className="mt-1">
                Peptide AI won&apos;t take new requests until your budget resets
                {usage.provisioned && usage.periodEnd ? ` on ${formatCycleDate(usage.periodEnd)}` : ""}. Your
                chats stay saved and you can still open them. Need more this month? Contact your account
                manager.
              </p>
            </div>
          ) : nearly ? (
            <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
              <p className="font-semibold">You&apos;ve used {Math.round(share * 100)}% of this month&apos;s budget.</p>
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
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.99]"
          >
            Open Peptide AI
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </DashboardShell>
  );
}
