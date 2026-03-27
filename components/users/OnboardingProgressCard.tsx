"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
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
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {section.title}
        </p>
        <span
          className={cn(
            "text-xs font-bold",
            allDone ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
          )}
        >
          {done}/{total}
        </span>
      </div>

      {/* Steps list */}
      <div className="space-y-1.5">
        {section.steps.map((step) => {
          const isDone = completedSet.has(step.id);
          return (
            <div key={step.id} className="flex items-center gap-2.5">
              {isDone ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
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
    <div className="bg-card rounded-xl border border-border/50 dark:border-white/[0.06] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Onboarding Progress
            </h3>
            <p className="text-xs text-muted-foreground">
              {doneCount} of {TOTAL_STEPS} steps completed
            </p>
          </div>
        </div>
        <span
          className={cn(
            "text-2xl font-black",
            pct === 100
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-primary"
          )}
        >
          {isLoading ? "\u2014" : `${pct}%`}
        </span>
      </div>

      {/* Segmented progress bar */}
      <div className="px-6 pb-5">
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
                      ? "bg-emerald-500"
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
                <p className="text-[10px] text-muted-foreground font-medium truncate">
                  {section.title}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border/50" />

      {/* Step details */}
      {isLoading ? (
        <div className="p-6 space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-36 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {ONBOARDING_SECTIONS.map((section) => (
            <SectionRow
              key={section.id}
              section={section}
              completedSet={completedSet}
            />
          ))}
        </div>
      )}
    </div>
  );
}
