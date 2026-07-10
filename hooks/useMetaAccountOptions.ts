"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MetaAccountOption, MetaOptionKind } from "@/lib/metaAccountOptions";

const BASE = "/api/admin/meta-accounts/options";

type AllOptions = Record<MetaOptionKind, MetaAccountOption[]>;

// One request fetches BOTH kinds — the two hook instances on the directory
// page share this query, so a page load costs one options round-trip, not two.
async function fetchAllOptions(): Promise<AllOptions> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.data ?? { stage: [], status: [] }) as AllOptions;
}

async function mutate(
  method: "POST" | "PATCH" | "DELETE",
  body?: Record<string, unknown>,
  query?: string
): Promise<unknown> {
  const res = await fetch(`${BASE}${query ?? ""}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json?.data ?? null;
}

/**
 * Fully DB-driven Stage / Status vocabulary for the Meta Accounts Directory —
 * unlike the roster options there are NO in-code built-ins; the entire list
 * comes over the wire and every entry is editable. Returns the options, a
 * label/color lookup, and add/update/reorder/remove helpers that keep the
 * cache in sync. The query is shared (one fetch per kind) across the page.
 */
export function useMetaAccountOptions(kind: MetaOptionKind) {
  const queryClient = useQueryClient();
  const queryKey = ["meta-account-options"];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: fetchAllOptions,
    staleTime: 5 * 60_000,
  });
  const options = useMemo(() => data?.[kind] ?? [], [data, kind]);

  const labels = useMemo(
    () => Object.fromEntries(options.map((o) => [o.value, o.label])),
    [options]
  );
  const colors = useMemo(
    () => Object.fromEntries(options.map((o) => [o.value, o.color])),
    [options]
  );

  // Functional updater (not a captured snapshot) so rapid sequential writes
  // each derive from the freshest cache and can't clobber one another. Only
  // this hook's kind is rewritten; the other kind's slice is untouched.
  const updateCache = (fn: (prev: MetaAccountOption[]) => MetaAccountOption[]) =>
    queryClient.setQueryData<AllOptions>(queryKey, (prev) => {
      const base = prev ?? { stage: [], status: [] };
      return { ...base, [kind]: fn(base[kind] ?? []) };
    });

  async function addOption(label: string, color?: string): Promise<string | null> {
    const created = (await mutate("POST", { kind, label, color })) as MetaAccountOption | null;
    if (created) updateCache((prev) => [...prev, created]);
    return created?.value ?? null;
  }

  async function updateOption(
    value: string,
    changes: { label?: string; color?: string }
  ): Promise<void> {
    const updated = (await mutate("PATCH", { kind, value, ...changes })) as MetaAccountOption | null;
    if (updated) updateCache((prev) => prev.map((o) => (o.value === value ? updated : o)));
  }

  async function reorderOptions(orderedValues: string[]): Promise<void> {
    // Optimistic: reflect the new order immediately, then reconcile.
    updateCache((prev) => {
      const byValue = new Map(prev.map((o) => [o.value, o]));
      return orderedValues.map((v) => byValue.get(v)).filter(Boolean) as MetaAccountOption[];
    });
    const fresh = (await mutate("PATCH", { kind, action: "reorder", order: orderedValues })) as
      | MetaAccountOption[]
      | null;
    if (Array.isArray(fresh)) updateCache(() => fresh);
  }

  async function removeOption(value: string): Promise<void> {
    await mutate("DELETE", undefined, `?kind=${kind}&value=${encodeURIComponent(value)}`);
    updateCache((prev) => prev.filter((o) => o.value !== value));
  }

  return { options, labels, colors, isLoading, addOption, updateOption, reorderOptions, removeOption };
}
