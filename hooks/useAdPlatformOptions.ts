"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AD_PLATFORM_OPTIONS } from "@/lib/clientProfile";
import type { PlatformOption } from "@/lib/adPlatformOptions";

const QUERY_KEY = ["ad-platform-options"];

// Built-ins are a code constant — only the custom extras come over the wire.
const BUILTIN: PlatformOption[] = AD_PLATFORM_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

async function fetchCustom(): Promise<PlatformOption[]> {
  const res = await fetch("/api/admin/ad-platform-options");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.data ?? []) as PlatformOption[];
}

async function mutate(
  method: "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>,
  query?: string
): Promise<PlatformOption | null> {
  const res = await fetch(`/api/admin/ad-platform-options${query ?? ""}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return (json?.data?.value ? json.data : null) as PlatformOption | null;
}

/**
 * Ad-platform options for the roster "Ad Platforms" chips. Returns the merged
 * built-in + admin-managed custom list, a label map, and add/rename/remove
 * helpers that keep the cache in sync. Surfaces errors via the returned
 * promise (callers alert); the query is shared (single fetch) across the page.
 */
export function useAdPlatformOptions() {
  const queryClient = useQueryClient();
  const { data: customOptions = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchCustom,
    staleTime: 5 * 60_000,
  });

  const options = useMemo<PlatformOption[]>(
    () => [...BUILTIN, ...customOptions],
    [customOptions]
  );
  const platformLabels = useMemo(
    () => Object.fromEntries(options.map((o) => [o.value, o.label])),
    [options]
  );

  // Functional updater (NOT a captured snapshot): sequential add/rename/remove
  // each derive from the freshest cache, so a rapid second write can't clobber
  // the first — same hazard the roster mutation hook guards against.
  const updateCache = (fn: (prev: PlatformOption[]) => PlatformOption[]) =>
    queryClient.setQueryData<PlatformOption[]>(QUERY_KEY, (prev) => fn(prev ?? []));

  /** Add a custom option; returns its stable value, or null on failure. */
  async function addOption(label: string): Promise<string | null> {
    const created = await mutate("POST", { label });
    if (created) updateCache((prev) => [...prev, created]);
    return created?.value ?? null;
  }

  async function renameOption(value: string, label: string): Promise<void> {
    const updated = await mutate("PATCH", { value, label });
    if (updated)
      updateCache((prev) => prev.map((o) => (o.value === value ? updated : o)));
  }

  async function removeOption(value: string): Promise<void> {
    await mutate("DELETE", undefined, `?value=${encodeURIComponent(value)}`);
    updateCache((prev) => prev.filter((o) => o.value !== value));
  }

  return {
    options,
    customOptions,
    platformLabels,
    isLoading,
    addOption,
    renameOption,
    removeOption,
  };
}
