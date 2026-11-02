"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Clock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { Badge, StatusBadge, badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
const ACCESS_TONE: Record<string, BadgeTone> = {
  using: "success",
  not_using: "neutral",
  setup: "warning",
};

/** One answer, formatted for reading; null = unanswered. */
function renderAnswer(key: string, a: OnboardingAnswers): ReactNode | null {
  if (key.startsWith("access.")) {
    const status = a.access[key.slice("access.".length)];
    return status ? (
      <StatusBadge tone={ACCESS_TONE[status] ?? "neutral"}>{labelOf(ACCESS_STATUSES, status)}</StatusBadge>
    ) : null;
  }
  if (MULTI[key]) {
    const values = a[key as "sells" | "channels"];
    if (values.length === 0) return null;
    return (
      <span className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Badge key={v} variant="outline">{labelOf(MULTI[key], v)}</Badge>
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
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all font-medium text-foreground underline-offset-4 hover:underline">
        {v}
        <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
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

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }
  if (error) {
    return (
      <p className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
        Couldn&apos;t load the onboarding questionnaire.
      </p>
    );
  }

  if (!data) {
    return (
      <Card className="flex flex-col items-center px-6 py-12 text-center">
        <ClipboardList className="mb-3 size-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Not started yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          The client hasn&apos;t opened the onboarding questionnaire. It lives in their portal under
          Onboarding → Questionnaire.
        </p>
      </Card>
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
      <Card className="p-4 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {submitted ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-medium leading-snug text-foreground">
                  {submitted ? `Submitted ${formatDate(data.submittedAt)}` : "In progress — not submitted yet"}
                </h3>
                {editedAfter ? <StatusBadge tone="warning">Edited after submitting</StatusBadge> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {answered} of {TOTAL_QUESTIONS} answered
                {data.updatedAt ? ` · last saved ${formatDate(data.updatedAt)}` : ""}
              </p>
            </div>
          </div>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
            {pct}%
          </span>
        </div>
        <Progress value={pct} className="mt-4 h-2 [&>div]:bg-chart-1" />
        {!submitted && (
          <p className="mt-3 text-xs text-muted-foreground">
            Answers show here once the client submits the questionnaire from their portal.
          </p>
        )}
      </Card>

      {submitted && answers && (
        <>
          <BreakEvenCard costs={answers} />
          {ONBOARDING_SECTIONS.map((section, i) => (
            <Card key={section.id}>
              <CardHeader className="space-y-1 border-b py-4 md:py-4">
                <p className="text-xs text-muted-foreground">
                  {i + 1} of {ONBOARDING_SECTIONS.length}
                </p>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-0 md:p-0">
                <dl className="divide-y">
                  {section.questions.map((q) => {
                    const value = renderAnswer(q.key, answers);
                    return (
                      <div key={q.key} className="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6 md:px-6">
                        <dt className="text-xs text-muted-foreground sm:text-sm">{q.label}</dt>
                        <dd className={cn("min-w-0 text-sm", value == null ? "text-muted-foreground/50" : "text-foreground")}>
                          {value ?? "—"}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
