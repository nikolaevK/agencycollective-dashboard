"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { normalizeLinkUrl } from "@/lib/clientAssetRules";
import {
  ACCESS_STATUSES,
  CHANNEL_OPTIONS,
  GOAL_OPTIONS,
  ONBOARDING_SECTIONS,
  REPEAT_OPTIONS,
  REVENUE_OPTIONS,
  SELLS_OPTIONS,
  STORE_OPTIONS,
  TOTAL_QUESTIONS,
  WEBSITE_MANAGER_OPTIONS,
  formatBpsAsPercent,
  formatUsdCents,
  labelOf,
  type OnboardingAnswers,
  type Option,
} from "@/lib/onboardingForm";
import type { OnboardingFormDto } from "@/hooks/useOnboardingForm";
import { BreakEvenCard } from "@/components/onboarding/BreakEvenCard";

/** Admin shape: answers are null until the client submits. */
type AdminOnboardingDto = Omit<OnboardingFormDto, "answers"> & {
  answers: OnboardingAnswers | null;
  answeredCount: number;
};

async function fetchOnboarding(userId: string): Promise<AdminOnboardingDto | null> {
  const res = await fetch(`/api/admin/clients/${encodeURIComponent(userId)}/onboarding-form`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).data as AdminOnboardingDto | null;
}

const CHOICES: Record<string, Option[]> = {
  monthlyRevenue: REVENUE_OPTIONS,
  primaryGoal: GOAL_OPTIONS,
  repeatPurchase: REPEAT_OPTIONS,
  storePlatform: STORE_OPTIONS,
  websiteManager: WEBSITE_MANAGER_OPTIONS,
};
const MULTI: Record<string, Option[]> = { sells: SELLS_OPTIONS, channels: CHANNEL_OPTIONS };
const ACCESS_CHIP: Record<string, string> = {
  using: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  not_using: "bg-muted text-muted-foreground",
  setup: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

function Chip({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", className ?? "bg-primary/10 text-primary")}>
      {children}
    </span>
  );
}

/** One answer, formatted for reading; null = unanswered. */
function renderAnswer(key: string, a: OnboardingAnswers): ReactNode | null {
  if (key.startsWith("access.")) {
    const status = a.access[key.slice("access.".length)];
    return status ? <Chip className={ACCESS_CHIP[status]}>{labelOf(ACCESS_STATUSES, status)}</Chip> : null;
  }
  if (MULTI[key]) {
    const values = a[key as "sells" | "channels"];
    if (values.length === 0) return null;
    return (
      <span className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Chip key={v}>{labelOf(MULTI[key], v)}</Chip>
        ))}
      </span>
    );
  }
  if (CHOICES[key]) {
    const v = a[key as keyof OnboardingAnswers] as string | null;
    return v ? labelOf(CHOICES[key], v) : null;
  }
  const v = a[key as keyof OnboardingAnswers];
  if (key === "processingBps" || key === "refundsBps") return v == null ? null : formatBpsAsPercent(v as number);
  if (typeof v === "number") return <span className="font-mono tabular-nums">{formatUsdCents(v)}</span>;
  if (typeof v !== "string" || !v) return null;
  if (key === "website" || key === "assetsUrl") {
    const href = normalizeLinkUrl(v);
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-primary hover:underline">
        {v}
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    ) : (
      v
    );
  }
  return <span className="whitespace-pre-wrap break-words">{v}</span>;
}

/**
 * Client detail → Onboarding: the questionnaire the client filled in from
 * their portal. Read-only; answers show once the client submits (drafts
 * only show progress).
 */
export function ClientOnboardingTab({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-client-onboarding", userId],
    queryFn: () => fetchOnboarding(userId),
    staleTime: 30_000,
  });

  if (isLoading) return <div className="h-48 w-full animate-pulse rounded-xl bg-muted/50" />;
  if (error) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
        Couldn&apos;t load the onboarding questionnaire.
      </p>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Not started yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          The client hasn&apos;t opened the onboarding questionnaire. It lives in their portal under
          Onboarding → Questionnaire.
        </p>
      </div>
    );
  }

  const answered = data.answeredCount;
  const answers = data.status === "submitted" ? data.answers : null;
  const pct = Math.round((answered / TOTAL_QUESTIONS) * 100);
  const submitted = data.status === "submitted";
  // Edits after submitting save straight through — flag them.
  const editedAfter =
    submitted &&
    data.submittedAt &&
    data.updatedAt &&
    new Date(data.updatedAt).getTime() - new Date(data.submittedAt).getTime() > 60_000;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/50 bg-card p-5 shadow-sm dark:border-white/[0.06]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                submitted ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
              )}
            >
              {submitted ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground">
                {submitted ? `Submitted ${formatDate(data.submittedAt)}` : "In progress — not submitted yet"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {answered} of {TOTAL_QUESTIONS} answered
                {data.updatedAt ? ` · last saved ${formatDate(data.updatedAt)}` : ""}
                {editedAfter ? " · edited after submitting" : ""}
              </p>
            </div>
          </div>
          <span className={cn("text-2xl font-black", submitted ? "text-emerald-600 dark:text-emerald-400" : "text-primary")}>
            {pct}%
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        {!submitted && (
          <p className="mt-3 text-xs text-muted-foreground">
            Answers show here once the client submits the questionnaire from their portal.
          </p>
        )}
      </div>

      {submitted && answers && (
        <>
          <BreakEvenCard costs={answers} />
          {ONBOARDING_SECTIONS.map((section, i) => (
            <section
              key={section.id}
              className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm dark:border-white/[0.06]"
            >
              <div className="border-b border-border/50 px-5 py-3.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                  {i + 1} of {ONBOARDING_SECTIONS.length}
                </p>
                <h3 className="text-sm font-bold text-foreground">{section.title}</h3>
              </div>
              <dl className="divide-y divide-border/40">
                {section.questions.map((q) => {
                  const value = renderAnswer(q.key, answers);
                  return (
                    <div key={q.key} className="grid gap-1 px-5 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6">
                      <dt className="text-xs font-semibold text-muted-foreground sm:text-sm">{q.label}</dt>
                      <dd className={cn("min-w-0 text-sm", value == null ? "text-muted-foreground/50" : "text-foreground")}>
                        {value ?? "—"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
