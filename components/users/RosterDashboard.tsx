"use client";

import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientPublic } from "./types";
import type { ClientFilterState } from "./ClientFilters";
import { useAdPlatformOptions } from "@/hooks/useAdPlatformOptions";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { AdPlatformOptionsModal } from "./AdPlatformOptionsModal";
import { RosterOptionsModal } from "./RosterOptionsModal";
import { SERVICE_OPTIONS, type TeamRole } from "@/lib/clientProfile";

// ---------------------------------------------------------------------------
// Roster dashboard — the prototype's count-group cards: Overview, Media Buyer,
// Head of Ads, Ad Accounts, Services, Stage, Client Health. Counts span BOTH
// books and are computed from the UNFILTERED list so they stay stable while
// filtering (the page pre-excludes inactive/archived clients — they never
// count toward any group). Pills are clickable where a matching filter exists (people →
// team filter; platforms/services/stages/health → toggle that filter value);
// multi-select counts can sum to more than the client total by design.
// ---------------------------------------------------------------------------

// Pills are DERIVED from the option enums (a value added to lib/clientProfile
// can't silently go missing here); only the compact display label and the
// count color are local overrides.
const SHORT_LABEL: Record<string, string> = {
  launched: "Launched",
  warmup: "Warm-up",
  phase3: "Phase 3",
  money: "Making $",
  testing: "Testing",
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google",
  creatives: "Creatives",
  email: "Email/SMS",
  orange: "Orange",
};

const PILL_CLS: Record<string, string> = {
  // stages
  onboarding: "text-slate-600 dark:text-slate-400",
  launched: "text-sky-600 dark:text-sky-400",
  warmup: "text-amber-600 dark:text-amber-400",
  phase3: "text-teal-600 dark:text-teal-400",
  optimizing: "text-violet-600 dark:text-violet-400",
  scaling: "text-emerald-600 dark:text-emerald-400",
  // health
  happy: "text-emerald-600 dark:text-emerald-400",
  mad: "text-red-600 dark:text-red-400",
  money: "text-blue-600 dark:text-blue-400",
  struggling: "text-amber-600 dark:text-amber-400",
  testing: "text-violet-600 dark:text-violet-400",
  // services
  meta: "text-blue-600 dark:text-blue-400",
  tiktok: "text-pink-600 dark:text-pink-400",
  google: "text-emerald-600 dark:text-emerald-400",
  creatives: "text-violet-600 dark:text-violet-400",
  email: "text-orange-600 dark:text-orange-400",
  // platforms
  orange: "text-orange-600 dark:text-orange-400",
  concept: "text-indigo-600 dark:text-indigo-400",
  personal: "text-teal-600 dark:text-teal-400",
};

const FALLBACK_PILL_CLS = "text-muted-foreground";

function toPills(options: ReadonlyArray<{ value: string; label: string }>) {
  return options.map((o) => ({
    value: o.value,
    label: SHORT_LABEL[o.value] ?? o.label,
    cls: PILL_CLS[o.value] ?? FALLBACK_PILL_CLS,
  }));
}

const SERVICE_PILLS = toPills(SERVICE_OPTIONS);

export function RosterDashboard({
  clients,
  filters,
  onFiltersChange,
}: {
  clients: ClientPublic[];
  filters: ClientFilterState;
  onFiltersChange: (next: ClientFilterState) => void;
}) {
  const { options: platformOptions } = useAdPlatformOptions();
  const { options: stageOptions } = useRosterOptions("stage");
  const { options: healthOptions } = useRosterOptions("health");
  const [manageOpen, setManageOpen] = useState<
    "platform" | "stage" | "health" | null
  >(null);
  // Built-in + admin-managed custom options (custom get the fallback color).
  const platformPills = useMemo(() => toPills(platformOptions), [platformOptions]);
  const stagePills = useMemo(() => toPills(stageOptions), [stageOptions]);
  const healthPills = useMemo(() => toPills(healthOptions), [healthOptions]);

  const stats = useMemo(() => {
    const count = (key: "stages" | "health" | "services" | "adPlatforms") => {
      const m = new Map<string, number>();
      for (const c of clients) {
        for (const v of c.profile[key]) m.set(v, (m.get(v) ?? 0) + 1);
      }
      return m;
    };
    const people = (role: TeamRole) => {
      const m = new Map<string, { adminId: string; name: string; count: number }>();
      for (const c of clients) {
        for (const t of c.team) {
          if (t.role !== role) continue;
          const e = m.get(t.adminId) ?? { adminId: t.adminId, name: t.name, count: 0 };
          e.count += 1;
          m.set(t.adminId, e);
        }
      }
      return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    };
    return {
      active: clients.filter((c) => c.status === "active").length,
      top: clients.filter((c) => c.profile.isTop).length,
      running: clients.filter((c) => c.profile.adsRunning).length,
      buyers: people("media_buyer"),
      leads: people("lead"),
      csms: people("csm"),
      stages: count("stages"),
      health: count("health"),
      services: count("services"),
      platforms: count("adPlatforms"),
    };
  }, [clients]);

  const toggleArrayFilter = (
    key: "stages" | "health" | "services" | "platforms",
    value: string
  ) => {
    const arr = filters[key];
    onFiltersChange({
      ...filters,
      [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value],
    });
  };

  const togglePerson = (adminId: string, role: TeamRole) => {
    const same = filters.team?.adminId === adminId && filters.team?.role === role;
    onFiltersChange({ ...filters, team: same ? null : { adminId, role } });
  };

  return (
    <div className="flex flex-wrap items-stretch gap-3">
      <Group label="Overview" dot="bg-slate-400">
        <Pill
          label="Active"
          count={stats.active}
          cls="text-foreground"
          active={filters.status === "active"}
          onClick={() =>
            onFiltersChange({
              ...filters,
              status: filters.status === "active" ? "all" : "active",
            })
          }
        />
        <Pill label="Top" count={stats.top} cls="text-amber-500" />
        <Pill label="Ads on" count={stats.running} cls="text-emerald-600 dark:text-emerald-400" />
      </Group>

      {stats.buyers.length > 0 && (
        <Group label="Media Buyer" dot="bg-blue-500">
          {stats.buyers.map((p) => (
            <Pill
              key={p.adminId}
              label={p.name}
              count={p.count}
              cls="text-blue-600 dark:text-blue-400"
              active={
                filters.team?.adminId === p.adminId && filters.team?.role === "media_buyer"
              }
              onClick={() => togglePerson(p.adminId, "media_buyer")}
            />
          ))}
        </Group>
      )}

      {stats.leads.length > 0 && (
        <Group label="Head of Ads" dot="bg-purple-500">
          {stats.leads.map((p) => (
            <Pill
              key={p.adminId}
              label={p.name}
              count={p.count}
              cls="text-purple-600 dark:text-purple-400"
              active={filters.team?.adminId === p.adminId && filters.team?.role === "lead"}
              onClick={() => togglePerson(p.adminId, "lead")}
            />
          ))}
        </Group>
      )}

      {stats.csms.length > 0 && (
        <Group label="Client Success Manager" dot="bg-violet-500">
          {stats.csms.map((p) => (
            <Pill
              key={p.adminId}
              label={p.name}
              count={p.count}
              cls="text-violet-600 dark:text-violet-400"
              active={filters.team?.adminId === p.adminId && filters.team?.role === "csm"}
              onClick={() => togglePerson(p.adminId, "csm")}
            />
          ))}
        </Group>
      )}

      <Group
        label="Ad Accounts"
        dot="bg-orange-500"
        action={
          <ManageButton
            title="Manage ad platform options"
            onClick={() => setManageOpen("platform")}
          />
        }
      >
        {platformPills.map((p) => (
          <Pill
            key={p.value}
            label={p.label}
            count={stats.platforms.get(p.value) ?? 0}
            cls={p.cls}
            active={filters.platforms.includes(p.value)}
            onClick={() => toggleArrayFilter("platforms", p.value)}
          />
        ))}
      </Group>

      <Group label="Services" dot="bg-teal-500">
        {SERVICE_PILLS.map((p) => (
          <Pill
            key={p.value}
            label={p.label}
            count={stats.services.get(p.value) ?? 0}
            cls={p.cls}
            active={filters.services.includes(p.value)}
            onClick={() => toggleArrayFilter("services", p.value)}
          />
        ))}
      </Group>

      <Group
        label="Stage"
        dot="bg-emerald-500"
        action={
          <ManageButton
            title="Manage stage options"
            onClick={() => setManageOpen("stage")}
          />
        }
      >
        {stagePills.map((p) => (
          <Pill
            key={p.value}
            label={p.label}
            count={stats.stages.get(p.value) ?? 0}
            cls={p.cls}
            active={filters.stages.includes(p.value)}
            onClick={() => toggleArrayFilter("stages", p.value)}
          />
        ))}
      </Group>

      <Group
        label="Client Health"
        dot="bg-red-500"
        action={
          <ManageButton
            title="Manage client health options"
            onClick={() => setManageOpen("health")}
          />
        }
      >
        {healthPills.map((p) => (
          <Pill
            key={p.value}
            label={p.label}
            count={stats.health.get(p.value) ?? 0}
            cls={p.cls}
            active={filters.health.includes(p.value)}
            onClick={() => toggleArrayFilter("health", p.value)}
          />
        ))}
      </Group>

      {manageOpen === "platform" && (
        <AdPlatformOptionsModal onClose={() => setManageOpen(null)} />
      )}
      {(manageOpen === "stage" || manageOpen === "health") && (
        <RosterOptionsModal kind={manageOpen} onClose={() => setManageOpen(null)} />
      )}
    </div>
  );
}

function ManageButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      title={title}
    >
      <Settings2 className="h-3 w-3" />
      Manage
    </button>
  );
}

function Group({
  label,
  dot,
  children,
  action,
}: {
  label: string;
  dot: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={cn("h-2 w-2 rounded-full", dot)} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="flex items-end gap-4 flex-wrap">{children}</div>
    </div>
  );
}

function Pill({
  label,
  count,
  cls,
  active,
  onClick,
}: {
  label: string;
  count: number;
  cls: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className={cn("text-xl font-black leading-none", cls)}>{count}</span>
      <span className="block text-[10px] font-semibold text-muted-foreground uppercase mt-0.5 whitespace-nowrap">
        {label}
      </span>
    </>
  );
  if (!onClick) return <span className="text-left">{body}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-md px-1 py-0.5 -mx-1 transition-all hover:bg-muted/50",
        active && "ring-2 ring-primary/40 bg-primary/[0.04]"
      )}
      title={active ? "Click to clear this filter" : "Click to filter"}
    >
      {body}
    </button>
  );
}
