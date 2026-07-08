"use client";

import { useEffect, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Link2,
  Save,
  Database,
  ShieldCheck,
  ShieldOff,
  Frame,
  ClipboardList,
  ReceiptText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { updateUserAction } from "@/app/actions/users";
import { ChipMultiSelect } from "./ChipMultiSelect";
import { TeamPicker } from "./TeamPicker";
import {
  STAGE_CHIP_CLS,
  HEALTH_CHIP_CLS,
  PLATFORM_CHIP_CLS,
  MANUAL_BILLING_CHIP_CLS,
  SERVICE_CHIP_CLS,
  parseMoneyToCents,
} from "./rosterPresentation";
import {
  useClientProfileMutations,
  type ClientProfilePatch,
} from "@/hooks/useClientProfileMutations";
import { useAdPlatformOptions } from "@/hooks/useAdPlatformOptions";
import { useRosterOptions } from "@/hooks/useRosterOptions";
import {
  MANUAL_BILLING_OPTIONS,
  BOOK_OPTIONS,
  SERVICE_OPTIONS,
  type ClientBook,
  type ClientTeamMember,
  type TeamRole,
} from "@/lib/clientProfile";
import type { ClientPublic } from "./types";

export function ClientSettingsTab({
  client,
  onEdit,
  onManageAccounts,
  onChanged,
}: {
  client: ClientPublic;
  onEdit: () => void;
  onManageAccounts: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [payoutBrand, setPayoutBrand] = useState(client.payoutBrand ?? "");
  const [joinedAt, setJoinedAt] = useState(client.joinedAt ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Roster profile (client_profile) — text fields buffered behind a Save
  // button (like the payout link above); chips/team save immediately.
  const profile = client.profile;
  const [book, setBook] = useState<ClientBook>(profile.book);
  const [website, setWebsite] = useState(profile.website ?? "");
  const [perfFee, setPerfFee] = useState(profile.perfFee ?? "");
  const [revThreshold, setRevThreshold] = useState(profile.revThreshold ?? "");
  const [rosterNotes, setRosterNotes] = useState(profile.rosterNotes ?? "");
  const [manualNextRebill, setManualNextRebill] = useState(profile.manualNextRebill ?? "");
  const [rosterSaved, setRosterSaved] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const { patchProfile, putTeam } = useClientProfileMutations();
  const { options: platformOptions, addOption: addPlatformOption } =
    useAdPlatformOptions();
  const { options: stageOptions, addOption: addStageOption } =
    useRosterOptions("stage");
  const { options: healthOptions, addOption: addHealthOption } =
    useRosterOptions("health");
  const [manualMrr, setManualMrr] = useState(
    profile.manualMrrCents != null ? (profile.manualMrrCents / 100).toString() : ""
  );
  const [manualLtv, setManualLtv] = useState(
    profile.manualLtvCents != null ? (profile.manualLtvCents / 100).toString() : ""
  );

  // Failure alerts live in the hook (always fire, with rollback).
  function patchNow(changes: ClientProfilePatch) {
    patchProfile.mutate(
      { userId: client.id, changes },
      { onSuccess: () => onChanged() }
    );
  }

  /** Empty input clears; unparseable input is IGNORED (never clears a saved value). */
  function patchMoney(field: "manualMrrCents" | "manualLtvCents", raw: string) {
    const trimmed = raw.trim();
    const cents = parseMoneyToCents(trimmed || null);
    if (trimmed && cents === null) {
      setRosterError(`"${trimmed}" isn't a valid amount — use e.g. 7000, $7,000 or 7k.`);
      return;
    }
    setRosterError(null);
    patchNow({ [field]: cents } as ClientProfilePatch);
  }

  function saveTeamNow(role: TeamRole, members: ClientTeamMember[]) {
    putTeam.mutate(
      { userId: client.id, role, members },
      { onSuccess: () => onChanged() }
    );
  }

  // Re-sync the buffered inputs whenever their SERVER values change (an edit
  // made inline on the directory row, or by another admin, refetched into the
  // `client` prop). useState initials only run on mount — without this, "Save
  // roster fields" would write the stale mount-time values back over newer
  // edits. Keyed on the server values only, so toggling chips (which bumps the
  // profile but not these fields) doesn't wipe in-progress typing.
  const serverFieldsKey = JSON.stringify([
    profile.book,
    profile.website,
    profile.perfFee,
    profile.revThreshold,
    profile.rosterNotes,
    profile.manualNextRebill,
    profile.manualMrrCents,
    profile.manualLtvCents,
  ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setBook(profile.book);
    setWebsite(profile.website ?? "");
    setPerfFee(profile.perfFee ?? "");
    setRevThreshold(profile.revThreshold ?? "");
    setRosterNotes(profile.rosterNotes ?? "");
    setManualNextRebill(profile.manualNextRebill ?? "");
    setManualMrr(
      profile.manualMrrCents != null ? (profile.manualMrrCents / 100).toString() : ""
    );
    setManualLtv(
      profile.manualLtvCents != null ? (profile.manualLtvCents / 100).toString() : ""
    );
  }, [serverFieldsKey]);

  function saveRosterFields() {
    setRosterError(null);
    setRosterSaved(false);
    patchProfile.mutate(
      {
        userId: client.id,
        changes: {
          book,
          website: website.trim() || null,
          perfFee: perfFee.trim() || null,
          revThreshold: revThreshold.trim() || null,
          rosterNotes: rosterNotes.trim() || null,
          // manualNextRebill is NOT here — its date input saves immediately
          // on change; including it again would re-send a possibly stale copy.
        },
      },
      {
        onSuccess: () => {
          onChanged();
          setRosterSaved(true);
          setTimeout(() => setRosterSaved(false), 2500);
        },
        onError: (err) => setRosterError(err.message),
      }
    );
  }

  const designBoardLive = client.designBoardEnabled && Boolean(client.designBoardUrl);
  const designTone = designBoardLive
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : client.designBoardEnabled
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-red-500/10 text-red-600 dark:text-red-400";
  const designLabel = designBoardLive
    ? "Design Board live"
    : client.designBoardEnabled
      ? "Design Board · no link"
      : "Design Board disabled";

  function saveLink() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("id", client.id);
    fd.set("payoutBrand", payoutBrand.trim());
    fd.set("joinedAt", joinedAt.trim());
    startTransition(async () => {
      const res = await updateUserAction(fd);
      if (res.error) {
        setError(res.error);
      } else {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        queryClient.invalidateQueries({ queryKey: ["admin-rebill-alerts"] });
        queryClient.invalidateQueries({ queryKey: ["client-billing", client.id] });
        onChanged();
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Profile + accounts */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5">
        <h3 className="text-sm font-bold text-foreground mb-1">Profile & access</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Name, email, category, status, logo, AI Analyst and Design Board access.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onEdit}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit profile
          </button>
          <button
            onClick={onManageAccounts}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <Link2 className="h-4 w-4" />
            Manage Meta accounts
          </button>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              client.analystEnabled
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            )}
          >
            {client.analystEnabled ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <ShieldOff className="h-3.5 w-3.5" />
            )}
            AI Analyst {client.analystEnabled ? "enabled" : "disabled"}
          </span>
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", designTone)}>
            <Frame className="h-3.5 w-3.5" />
            {designLabel}
          </span>
        </div>
      </div>

      {/* Payout link */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Payout-DB link</h3>
          {client.isLinked ? (
            <span className="ml-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Linked
            </span>
          ) : (
            <span className="ml-1 inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              Not linked
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          The brand name this client maps to in the Payout DB. Drives MRR, payment
          history, documents and the re-bill schedule. Currently matched to{" "}
          <span className="font-medium text-foreground">
            {client.matchedBrand ?? "— none —"}
          </span>
          .
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Payout brand name
            </label>
            <input
              type="text"
              value={payoutBrand}
              onChange={(e) => setPayoutBrand(e.target.value)}
              placeholder="e.g. Inner Glow"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Date joined
            </label>
            <input
              type="date"
              value={joinedAt}
              onChange={(e) => setJoinedAt(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={saveLink}
            disabled={isPending}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isPending ? "Saving…" : "Save link"}
          </button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>}
        </div>
      </div>

      {/* Roster profile */}
      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Roster profile</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Stage, health, services and team show as chips in the directory — changes
          here save immediately. Book, website and comp terms save with the button below.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <RosterField label="Stage">
            <ChipMultiSelect
              value={profile.stages}
              options={stageOptions}
              colorOf={(v) => STAGE_CHIP_CLS[v]}
              onChange={(stages) => patchNow({ stages })}
              onCreateOption={addStageOption}
            />
          </RosterField>
          <RosterField label="Client health">
            <ChipMultiSelect
              value={profile.health}
              options={healthOptions}
              colorOf={(v) => HEALTH_CHIP_CLS[v]}
              onChange={(health) => patchNow({ health })}
              onCreateOption={addHealthOption}
            />
          </RosterField>
          <RosterField label="Ad platforms">
            <ChipMultiSelect
              value={profile.adPlatforms}
              options={platformOptions}
              colorOf={(v) => PLATFORM_CHIP_CLS[v]}
              onChange={(adPlatforms) => patchNow({ adPlatforms })}
              onCreateOption={addPlatformOption}
            />
          </RosterField>
          <RosterField label="Services">
            <ChipMultiSelect
              value={profile.services}
              options={SERVICE_OPTIONS}
              colorOf={(v) => SERVICE_CHIP_CLS[v]}
              onChange={(services) => patchNow({ services })}
            />
          </RosterField>
          <RosterField label="Lead — Head of Ads">
            <TeamPicker
              role="lead"
              members={client.team.filter((m) => m.role === "lead")}
              onChange={(members) => saveTeamNow("lead", members)}
            />
          </RosterField>
          <RosterField label="Media buyer">
            <TeamPicker
              role="media_buyer"
              members={client.team.filter((m) => m.role === "media_buyer")}
              onChange={(members) => saveTeamNow("media_buyer", members)}
            />
          </RosterField>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Ads
          </span>
          <button
            type="button"
            onClick={() => patchNow({ adsRunning: !profile.adsRunning })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              profile.adsRunning
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {profile.adsRunning ? "Running — click to pause" : "Paused — click to resume"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Book
            </label>
            <select
              value={book}
              onChange={(e) => setBook(e.target.value as ClientBook)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {BOOK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Website
            </label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="clientsite.com"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Perf fee
            </label>
            <input
              type="text"
              value={perfFee}
              onChange={(e) => setPerfFee(e.target.value)}
              placeholder={client.derivedPerfFee ? `${client.derivedPerfFee} (auto)` : "e.g. 5%"}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            {client.derivedPerfFee && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Leave empty to use {client.derivedPerfFee}, derived from this client&apos;s ad accounts.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Rev / threshold
            </label>
            <input
              type="text"
              value={revThreshold}
              onChange={(e) => setRevThreshold(e.target.value)}
              placeholder="e.g. $25K+"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Roster notes
            </label>
            <textarea
              value={rosterNotes}
              onChange={(e) => setRosterNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Quick note shown in the directory's Notes column…"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
            />
          </div>
        </div>

        {rosterError && <p className="text-sm text-destructive">{rosterError}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={saveRosterFields}
            disabled={patchProfile.isPending}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {patchProfile.isPending ? "Saving…" : "Save roster fields"}
          </button>
          {rosterSaved && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>
          )}
        </div>
      </div>

      {/* Manual billing — PepAds only */}
      {profile.book === "pepads" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-bold text-foreground">Manual billing (PepAds)</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            This client is on the PepAds book: the computed re-bill schedule and its
            alerts don&apos;t apply. Billing status and the next re-bill date below are
            maintained by hand (also editable inline on the directory row).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RosterField label="Billing status">
              <ChipMultiSelect
                value={profile.manualBilling}
                options={MANUAL_BILLING_OPTIONS}
                colorOf={(v) => MANUAL_BILLING_CHIP_CLS[v]}
                onChange={(manualBilling) =>
                  patchNow({
                    manualBilling: manualBilling as ClientProfilePatch["manualBilling"],
                  })
                }
              />
            </RosterField>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Next re-bill
              </label>
              <input
                type="date"
                value={manualNextRebill}
                onChange={(e) => {
                  setManualNextRebill(e.target.value);
                  patchNow({ manualNextRebill: e.target.value || null });
                }}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Monthly MRR ($)
              </label>
              <input
                type="text"
                value={manualMrr}
                onChange={(e) => setManualMrr(e.target.value)}
                onBlur={() => patchMoney("manualMrrCents", manualMrr)}
                placeholder="e.g. 7000 or 7k"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                LTV ($)
              </label>
              <input
                type="text"
                value={manualLtv}
                onChange={(e) => setManualLtv(e.target.value)}
                onBlur={() => patchMoney("manualLtvCents", manualLtv)}
                placeholder="e.g. 25000 or 25k"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RosterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}
