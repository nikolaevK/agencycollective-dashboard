"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { OnboardingAnswers, OnboardingStatus } from "@/lib/onboardingForm";

/** GET/PUT shape of /api/portal/onboarding-form. */
export interface OnboardingFormDto {
  status: OnboardingStatus;
  answers: OnboardingAnswers;
  submittedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const ONBOARDING_FORM_URL = "/api/portal/onboarding-form";

/** A failed save, with the HTTP status (0 = network error) so callers can
 *  tell "retry later" apart from "signed out". */
export class OnboardingSaveError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

/**
 * Cache key scoped to the portal slug: the cache outlives a session, so a
 * different client signing in on the same tab must never be served (and
 * autosave over) the previous client's answers.
 */
export function useOnboardingFormKey() {
  const slug = usePathname()?.split("/")[1] ?? "";
  return useMemo(() => ["portal-onboarding-form", slug] as const, [slug]);
}

/**
 * The client's questionnaire. The form owns its state once loaded and pushes
 * every save back into this cache, so the query never needs to refetch while
 * the page is open (staleTime: Infinity).
 */
export function useOnboardingForm() {
  return useQuery({
    queryKey: useOnboardingFormKey(),
    queryFn: async (): Promise<OnboardingFormDto> => {
      const res = await fetch(ONBOARDING_FORM_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()).data as OnboardingFormDto;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export async function putOnboardingForm(
  answers: OnboardingAnswers,
  submit: boolean
): Promise<OnboardingFormDto> {
  let res: Response;
  try {
    res = await fetch(ONBOARDING_FORM_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, submit }),
    });
  } catch {
    throw new OnboardingSaveError("Couldn't reach the server — check your connection.", 0);
  }
  if (!res.ok) {
    if (res.status === 401) {
      throw new OnboardingSaveError("Your session has expired — log in again to keep saving.", 401);
    }
    let message = `Couldn't save (HTTP ${res.status})`;
    try {
      const json = await res.json();
      if (json?.error) message = String(json.error);
    } catch {
      // keep the generic message
    }
    throw new OnboardingSaveError(message, res.status);
  }
  return (await res.json()).data as OnboardingFormDto;
}
