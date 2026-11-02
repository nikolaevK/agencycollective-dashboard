"use client";

import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BadgeDot, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ClientPublic } from "./types";
import type { ClientFilterState } from "./ClientFilters";
import { useAdPlatformOptions } from "@/hooks/useAdPlatformOptions";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import { AdPlatformOptionsModal } from "./AdPlatformOptionsModal";
import { RosterOptionsModal } from "./RosterOptionsModal";
import { SERVICE_OPTIONS, type TeamRole } from "@/lib/clientProfile";
import { HEALTH_TONE, STAGE_TONE, toneOf } from "./rosterPresentation";

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
// can't silently go missing here); only the compact display label is a local
// override. Stage / health pills carry their status tone as a dot.
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

function toPills(
  options: ReadonlyArray<{ value: string; label: string }>,
  tones?: Record<string, BadgeTone>
) {
  return options.map((o) => ({
    value: o.value,
    label: SHORT_LABEL[o.value] ?? o.label,
    tone: tones ? toneOf(tones, o.value) : undefined,
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
  // Built-in + admin-managed custom options (custom get the neutral tone).
  const platformPills = useMemo(() => toPills(platformOptions), [platformOptions]);
  const stagePills = useMemo(() => toPills(stageOptions, STAGE_TONE), [stageOptions]);
  const healthPills = useMemo(() => toPills(healthOptions, HEALTH_TONE), [healthOptions]);

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
      <Group label="Overview">
        <Pill
          label="Active"
          count={stats.active}
          active={filters.status === "active"}
          onClick={() =>
            onFiltersChange({
              ...filters,
              status: filters.status === "active" ? "all" : "active",
            })
          }
        />
        <Pill label="Top" count={stats.top} />
        <Pill label="Ads on" count={stats.running} />
      </Group>

      {stats.buyers.length > 0 && (
        <Group label="Media Buyer">
          {stats.buyers.map((p) => (
            <Pill
              key={p.adminId}
              label={p.name}
              count={p.count}
              active={
                filters.team?.adminId === p.adminId && filters.team?.role === "media_buyer"
              }
              onClick={() => togglePerson(p.adminId, "media_buyer")}
            />
          ))}
        </Group>
      )}

      {stats.leads.length > 0 && (
        <Group label="Head of Ads">
          {stats.leads.map((p) => (
            <Pill
              key={p.adminId}
              label={p.name}
              count={p.count}
              active={filters.team?.adminId === p.adminId && filters.team?.role === "lead"}
              onClick={() => togglePerson(p.adminId, "lead")}
            />
          ))}
        </Group>
      )}

      {stats.csms.length > 0 && (
        <Group label="Client Success Manager">
          {stats.csms.map((p) => (
            <Pill
              key={p.adminId}
              label={p.name}
              count={p.count}
              active={filters.team?.adminId === p.adminId && filters.team?.role === "csm"}
              onClick={() => togglePerson(p.adminId, "csm")}
            />
          ))}
        </Group>
      )}

      <Group
        label="Ad Accounts"
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
            tone={p.tone}
            active={filters.platforms.includes(p.value)}
            onClick={() => toggleArrayFilter("platforms", p.value)}
          />
        ))}
      </Group>

      <Group label="Services">
        {SERVICE_PILLS.map((p) => (
          <Pill
            key={p.value}
            label={p.label}
            count={stats.services.get(p.value) ?? 0}
            tone={p.tone}
            active={filters.services.includes(p.value)}
            onClick={() => toggleArrayFilter("services", p.value)}
          />
        ))}
      </Group>

      <Group
        label="Stage"
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
            tone={p.tone}
            active={filters.stages.includes(p.value)}
            onClick={() => toggleArrayFilter("stages", p.value)}
          />
        ))}
      </Group>

      <Group
        label="Client Health"
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
            tone={p.tone}
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
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={onClick}
      className="-my-1 -mr-1.5 text-muted-foreground"
      title={title}
      aria-label={title}
    >
      <Settings2 />
      Manage
    </Button>
  );
}

function Group({
  label,
  children,
  action,
}: {
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 px-4 pb-1 pt-3 md:px-4 md:pb-1 md:pt-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        {action && <span className="ml-auto">{action}</span>}
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-1 px-2 pb-2 pt-0 md:px-2 md:pb-2 md:pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

function Pill({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  /** Stage / health status tone, shown as a dot before the label. */
  tone?: BadgeTone;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="block text-xl font-semibold leading-none tracking-tight tabular-nums">
        {count}
      </span>
      <span className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
        {tone && <BadgeDot tone={tone} />}
        {label}
      </span>
    </>
  );
  if (!onClick) return <span className="px-2 py-1.5 text-left">{body}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/30",
        active && "bg-muted ring-1 ring-foreground/10 hover:bg-muted"
      )}
      title={active ? "Click to clear this filter" : "Click to filter"}
    >
      {body}
    </button>
  );
}
