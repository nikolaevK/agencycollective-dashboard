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
import { updateUserAction } from "@/app/actions/users";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useAdmin } from "@/components/providers/AdminProvider";
import { Badge, StatusBadge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ChipMultiSelect } from "./ChipMultiSelect";
import { ClientPeptideAiCard } from "./ClientPeptideAiCard";
import { TeamPicker } from "./TeamPicker";
import {
  STAGE_TONE,
  HEALTH_TONE,
  MANUAL_BILLING_TONE,
  toneOf,
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
  // Workspace (book) move — unscoped admins only (the server rejects it
  // otherwise); single-workspace setups never render the select.
  const { workspaces, canManage } = useWorkspaces();
  const [workspace, setWorkspace] = useState(client.workspace);
  const admin = useAdmin();
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
  const designTone: BadgeTone = designBoardLive
    ? "success"
    : client.designBoardEnabled
      ? "warning"
      : "neutral";
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
    if (canManage && workspace && workspace !== client.workspace) {
      fd.set("workspace", workspace);
    }
    startTransition(async () => {
      const res = await updateUserAction(fd);
      if (res.error) {
        setError(res.error);
      } else {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        queryClient.invalidateQueries({ queryKey: ["admin-client-trends"] });
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
      <Card>
        <CardHeader>
          <CardTitle>Profile & access</CardTitle>
          <CardDescription>
            Name, email, category, status, logo, AI Analyst and Design Board access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={onEdit}>
              <Pencil />
              Edit profile
            </Button>
            <Button variant="outline" onClick={onManageAccounts}>
              <Link2 />
              Manage Meta accounts
            </Button>
            <Badge
              variant="outline"
              tone={client.analystEnabled ? "success" : "neutral"}
              className="gap-1.5"
            >
              {client.analystEnabled ? <ShieldCheck /> : <ShieldOff />}
              AI Analyst {client.analystEnabled ? "enabled" : "disabled"}
            </Badge>
            <Badge variant="outline" tone={designTone} className="gap-1.5">
              <Frame />
              {designLabel}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <ClientPeptideAiCard userId={client.id} clientStatus={client.status} />

      {/* Payout link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Database className="size-4 text-muted-foreground" />
            Payout-DB link
            {client.isLinked ? (
              <StatusBadge tone="success">Linked</StatusBadge>
            ) : (
              <StatusBadge tone="warning">Not linked</StatusBadge>
            )}
          </CardTitle>
          <CardDescription>
            The brand name this client maps to in the Payout DB. Drives MRR, payment
            history, documents and the re-bill schedule. Currently matched to{" "}
            <span className="font-medium text-foreground">
              {client.matchedBrand ?? "— none —"}
            </span>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid content-start gap-2">
              <Label>Payout brand name</Label>
              {admin.isExternal ? (
                // The payout link is internally managed (it's the only thing
                // that matches billing history for partner-book clients) —
                // read-only for external partner admins; the server rejects
                // edits too.
                <p className="rounded-3xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                  {payoutBrand || "Managed by the agency"}
                </p>
              ) : (
                <Input
                  type="text"
                  value={payoutBrand}
                  onChange={(e) => setPayoutBrand(e.target.value)}
                  placeholder="e.g. Inner Glow"
                />
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label>Date joined</Label>
              <DatePicker
                value={joinedAt}
                onValueChange={setJoinedAt}
                aria-label="Date joined"
                yearNavigation
              />
            </div>
            {canManage && workspaces.length > 1 && (
              <div className="grid content-start gap-2">
                <Label>Workspace</Label>
                <Select value={workspace} onValueChange={setWorkspace}>
                  <SelectTrigger aria-label="Workspace">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((w) => (
                      <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Moving a client changes which team&apos;s Client Directory it appears in.
                </p>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button onClick={saveLink} disabled={isPending}>
              <Save />
              {isPending ? "Saving…" : "Save link"}
            </Button>
            {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>}
          </div>
        </CardContent>
      </Card>

      {/* Roster profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4 text-muted-foreground" />
            Roster profile
          </CardTitle>
          <CardDescription>
            Stage, health, services and team show as chips in the directory — changes
            here save immediately. Book, website and comp terms save with the button below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RosterField label="Stage">
              <ChipMultiSelect
                value={profile.stages}
                options={stageOptions}
                toneOf={(v) => toneOf(STAGE_TONE, v)}
                onChange={(stages) => patchNow({ stages })}
                onCreateOption={addStageOption}
              />
            </RosterField>
            <RosterField label="Client health">
              <ChipMultiSelect
                value={profile.health}
                options={healthOptions}
                toneOf={(v) => toneOf(HEALTH_TONE, v)}
                onChange={(health) => patchNow({ health })}
                onCreateOption={addHealthOption}
              />
            </RosterField>
            <RosterField label="Ad platforms">
              <ChipMultiSelect
                value={profile.adPlatforms}
                options={platformOptions}
                onChange={(adPlatforms) => patchNow({ adPlatforms })}
                onCreateOption={addPlatformOption}
              />
            </RosterField>
            <RosterField label="Services">
              <ChipMultiSelect
                value={profile.services}
                options={SERVICE_OPTIONS}
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
            <RosterField label="Client Success Manager">
              <TeamPicker
                role="csm"
                members={client.team.filter((m) => m.role === "csm")}
                onChange={(members) => saveTeamNow("csm", members)}
              />
            </RosterField>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="text-sm font-medium">Ads</span>
            <AdsSwitch
              platform="Meta"
              running={profile.adsRunning}
              onToggle={() => patchNow({ adsRunning: !profile.adsRunning })}
            />
            <AdsSwitch
              platform="TikTok"
              running={profile.tiktokAdsRunning}
              onToggle={() => patchNow({ tiktokAdsRunning: !profile.tiktokAdsRunning })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid content-start gap-2">
              <Label>Book</Label>
              <Select value={book} onValueChange={(v) => setBook(v as ClientBook)}>
                <SelectTrigger aria-label="Book">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOK_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid content-start gap-2">
              <Label>Website</Label>
              <Input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="clientsite.com"
              />
            </div>
            <div className="grid content-start gap-2">
              <Label>Perf fee</Label>
              <Input
                type="text"
                value={perfFee}
                onChange={(e) => setPerfFee(e.target.value)}
                placeholder={client.derivedPerfFee ? `${client.derivedPerfFee} (auto)` : "e.g. 5%"}
              />
              {client.derivedPerfFee && (
                <p className="text-xs text-muted-foreground">
                  Leave empty to use {client.derivedPerfFee}, derived from this client&apos;s ad accounts.
                </p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label>Rev / threshold</Label>
              <Input
                type="text"
                value={revThreshold}
                onChange={(e) => setRevThreshold(e.target.value)}
                placeholder="e.g. $25K+"
              />
            </div>
            <div className="grid content-start gap-2 sm:col-span-2">
              <Label>Roster notes</Label>
              <Textarea
                value={rosterNotes}
                onChange={(e) => setRosterNotes(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Quick note shown in the directory's Notes column…"
                className="resize-y"
              />
            </div>
          </div>

          {rosterError && <p className="text-sm text-destructive">{rosterError}</p>}

          <div className="flex items-center gap-3">
            <Button onClick={saveRosterFields} disabled={patchProfile.isPending}>
              <Save />
              {patchProfile.isPending ? "Saving…" : "Save roster fields"}
            </Button>
            {rosterSaved && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Manual billing — PepAds only */}
      {profile.book === "pepads" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-4 text-muted-foreground" />
              Manual billing (PepAds)
            </CardTitle>
            <CardDescription>
              This client is on the PepAds book: the computed re-bill schedule and its
              alerts don&apos;t apply. Billing status and the next re-bill date below are
              maintained by hand (also editable inline on the directory row).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <RosterField label="Billing status">
                <ChipMultiSelect
                  value={profile.manualBilling}
                  options={MANUAL_BILLING_OPTIONS}
                  toneOf={(v) => toneOf(MANUAL_BILLING_TONE, v)}
                  onChange={(manualBilling) =>
                    patchNow({
                      manualBilling: manualBilling as ClientProfilePatch["manualBilling"],
                    })
                  }
                />
              </RosterField>
              <div className="grid content-start gap-2">
                <Label>Next re-bill</Label>
                <DatePicker
                  value={manualNextRebill}
                  onValueChange={(v) => {
                    setManualNextRebill(v);
                    patchNow({ manualNextRebill: v || null });
                  }}
                  aria-label="Next re-bill"
                />
              </div>
              <div className="grid content-start gap-2">
                <Label>Monthly MRR ($)</Label>
                <Input
                  type="text"
                  value={manualMrr}
                  onChange={(e) => setManualMrr(e.target.value)}
                  onBlur={() => patchMoney("manualMrrCents", manualMrr)}
                  placeholder="e.g. 7000 or 7k"
                />
              </div>
              <div className="grid content-start gap-2">
                <Label>LTV ($)</Label>
                <Input
                  type="text"
                  value={manualLtv}
                  onChange={(e) => setManualLtv(e.target.value)}
                  onBlur={() => patchMoney("manualLtvCents", manualLtv)}
                  placeholder="e.g. 25000 or 25k"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** On/off switch for one ad platform's running state. */
function AdsSwitch({
  platform,
  running,
  onToggle,
}: {
  platform: string;
  running: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2.5 text-sm"
      title={running ? "Click to pause" : "Click to resume"}
    >
      <Switch checked={running} onCheckedChange={onToggle} />
      <span>
        {platform}:{" "}
        <span className={running ? "font-medium text-foreground" : "text-muted-foreground"}>
          {running ? "Running" : "Paused"}
        </span>
      </span>
    </label>
  );
}

function RosterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
