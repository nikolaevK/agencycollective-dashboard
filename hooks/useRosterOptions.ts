"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STAGE_OPTIONS, HEALTH_OPTIONS } from "@/lib/clientProfile";
import type { RosterOption, RosterOptionKind } from "@/lib/rosterOptions";

// Built-ins are a code constant — only the custom extras come over the wire.
const BUILTIN: Record<RosterOptionKind, RosterOption[]> = {
  stage: STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  health: HEALTH_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
};

async function fetchCustom(kind: RosterOptionKind): Promise<RosterOption[]> {
  const res = await fetch(`/api/admin/roster-options?kind=${kind}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.data ?? []) as RosterOption[];
}

async function mutate(
  method: "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>,
  query?: string
): Promise<RosterOption | null> {
  const res = await fetch(`/api/admin/roster-options${query ?? ""}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return (json?.data?.value ? json.data : null) as RosterOption | null;
}

/**
 * Stage / Client Health options for the roster chips — the sibling of
 * useAdPlatformOptions, parameterized by kind. Returns the merged built-in +
 * admin-managed custom list, a label map, and add/rename/remove helpers that
 * keep the cache in sync. Surfaces errors via the returned promise (callers
 * alert); the query is shared (single fetch per kind) across the page.
 */
export function useRosterOptions(kind: RosterOptionKind) {
  const queryClient = useQueryClient();
  const queryKey = ["roster-options", kind];
  const { data: customOptions = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchCustom(kind),
    staleTime: 5 * 60_000,
  });

  const options = useMemo<RosterOption[]>(
    () => [...BUILTIN[kind], ...customOptions],
    [kind, customOptions]
  );
  const labels = useMemo(
    () => Object.fromEntries(options.map((o) => [o.value, o.label])),
    [options]
  );

  // Functional updater (NOT a captured snapshot): sequential add/rename/remove
  // each derive from the freshest cache, so a rapid second write can't clobber
  // the first — same hazard the roster mutation hook guards against.
  const updateCache = (fn: (prev: RosterOption[]) => RosterOption[]) =>
    queryClient.setQueryData<RosterOption[]>(queryKey, (prev) => fn(prev ?? []));

  /** Add a custom option; returns its stable value, or null on failure. */
  async function addOption(label: string): Promise<string | null> {
    const created = await mutate("POST", { kind, label });
    if (created) updateCache((prev) => [...prev, created]);
    return created?.value ?? null;
  }

  async function renameOption(value: string, label: string): Promise<void> {
    const updated = await mutate("PATCH", { kind, value, label });
    if (updated)
      updateCache((prev) => prev.map((o) => (o.value === value ? updated : o)));
  }

  async function removeOption(value: string): Promise<void> {
    await mutate(
      "DELETE",
      undefined,
      `?kind=${kind}&value=${encodeURIComponent(value)}`
    );
    updateCache((prev) => prev.filter((o) => o.value !== value));
  }

  return {
    options,
    customOptions,
    labels,
    isLoading,
    addOption,
    renameOption,
    removeOption,
  };
}
