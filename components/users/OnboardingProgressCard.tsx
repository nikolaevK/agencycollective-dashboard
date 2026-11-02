"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ONBOARDING_SECTIONS,
  TOTAL_STEPS,
  type SectionDef,
} from "@/lib/onboarding-steps";

/* ------------------------------------------------------------------ */
/*  Data fetching                                                      */
/* ------------------------------------------------------------------ */

interface ProgressData {
  completedSteps: Record<string, { completedAt: string | null }>;
}

async function fetchProgress(userId: string): Promise<ProgressData> {
  const res = await fetch(
    `/api/admin/users/${encodeURIComponent(userId)}/onboarding-progress`
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as ProgressData;
}

/* ------------------------------------------------------------------ */
/*  Section row                                                        */
/* ------------------------------------------------------------------ */

function SectionRow({
  section,
  completedSet,
}: {
  section: SectionDef;
  completedSet: Set<string>;
}) {
  const done = section.steps.filter((s) => completedSet.has(s.id)).length;
  const total = section.steps.length;
  const allDone = done === total;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {section.title}
        </p>
        <Badge
          variant="outline"
          tone={allDone ? "success" : "neutral"}
          className={cn("tabular-nums", !allDone && "text-muted-foreground")}
        >
          {done}/{total}
        </Badge>
      </div>

      {/* Steps list */}
      <div className="space-y-1.5">
        {section.steps.map((step) => {
          const isDone = completedSet.has(step.id);
          return (
            <div key={step.id} className="flex items-center gap-2.5">
              {isDone ? (
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="size-4 text-muted-foreground/40 shrink-0" />
              )}
              <span
                className={cn(
                  "text-sm",
                  isDone
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                )}
              >
                {step.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main card                                                          */
/* ------------------------------------------------------------------ */

interface OnboardingProgressCardProps {
  userId: string;
}

export function OnboardingProgressCard({ userId }: OnboardingProgressCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-onboarding-progress", userId],
    queryFn: () => fetchProgress(userId),
    staleTime: 30_000,
  });

  const completedSet = new Set<string>(
    data ? Object.keys(data.completedSteps) : []
  );
  const doneCount = completedSet.size;
  const pct = TOTAL_STEPS === 0 ? 0 : Math.round((doneCount / TOTAL_STEPS) * 100);

  return (
    <Card>
      {/* Header */}
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex min-w-0 items-center gap-3">
          <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <CardTitle>
              Onboarding Progress
            </CardTitle>
            <CardDescription className="text-xs">
              {doneCount} of {TOTAL_STEPS} steps completed
            </CardDescription>
          </div>
        </div>
        <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
          {isLoading ? "\u2014" : `${pct}%`}
        </span>
      </CardHeader>

      {/* Segmented progress bar */}
      <CardContent className="pb-5 md:pb-5">
        <div className="flex gap-1">
          {ONBOARDING_SECTIONS.flatMap((section) =>
            section.steps.map((step) => (
              <div
                key={step.id}
                className={cn(
                  "h-2 flex-1 rounded-full transition-colors",
                  isLoading
                    ? "bg-muted animate-pulse"
                    : completedSet.has(step.id)
                      ? "bg-chart-1"
                      : "bg-muted"
                )}
                title={step.title}
              />
            ))
          )}
        </div>

        {/* Section labels below the bar */}
        <div className="flex mt-1.5">
          {ONBOARDING_SECTIONS.map((section) => {
            const sectionSteps = section.steps.length;
            return (
              <div
                key={section.id}
                className="text-center"
                style={{
                  flex: `${sectionSteps} ${sectionSteps} 0%`,
                }}
              >
                <p className="text-xs text-muted-foreground truncate">
                  {section.title}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>

      {/* Divider */}
      <Separator />

      {/* Step details */}
      {isLoading ? (
        <div className="p-4 md:p-6 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-3 w-40 rounded" />
              <Skeleton className="h-3 w-36 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 md:p-6 space-y-6">
          {ONBOARDING_SECTIONS.map((section) => (
            <SectionRow
              key={section.id}
              section={section}
              completedSet={completedSet}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
