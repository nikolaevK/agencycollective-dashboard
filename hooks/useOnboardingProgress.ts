"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toggleOnboardingStepAction } from "@/app/actions/onboarding";

interface OnboardingProgressData {
  completedSteps: Record<string, { completedAt: string | null }>;
}

async function fetchProgress(): Promise<OnboardingProgressData> {
  const res = await fetch("/api/user/onboarding-progress");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as OnboardingProgressData;
}

const QUERY_KEY = ["onboarding-progress"];

export function useOnboardingProgress() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchProgress,
    staleTime: 30 * 1000,
  });
}

export function useToggleOnboardingStep() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (stepId: string) => {
      const result = await toggleOnboardingStepAction(stepId);
      if (result.error) throw new Error(result.error);
      return { stepId, completed: result.completed! };
    },
    onMutate: async (stepId: string) => {
      await qc.cancelQueries({ queryKey: QUERY_KEY });
      const prev = qc.getQueryData<OnboardingProgressData>(QUERY_KEY);

      qc.setQueryData<OnboardingProgressData>(QUERY_KEY, (old) => {
        if (!old) return old;
        const next = { ...old, completedSteps: { ...old.completedSteps } };
        if (next.completedSteps[stepId]) {
          delete next.completedSteps[stepId];
        } else {
          next.completedSteps[stepId] = { completedAt: new Date().toISOString() };
        }
        return next;
      });

      return { prev };
    },
    onError: (_err, _stepId, context) => {
      if (context?.prev) {
        qc.setQueryData(QUERY_KEY, context.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
