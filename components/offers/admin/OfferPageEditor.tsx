"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { QueryErrorState } from "@/components/shared/QueryErrorState";
import { OfferPageHero } from "../OfferPageHero";
import { OfferCard } from "../OfferCard";
import { OfferRequestPanel } from "../OfferRequestPanel";
import { ImageField, useImageDraft } from "./ImageField";
import { OFFER_PAGE_KEY, useOfferPage, type OfferPageResponse } from "./useOfferPage";
import { CATALOG_KEY, fetchCatalog } from "./OfferCatalogManager";
import {
  HIDEABLE_OFFER_PAGE_FIELDS,
  OFFER_IMAGE_MAX_BYTES,
  OFFER_PAGE_LIMITS,
  type OfferPageOverrides,
  type OfferPageSettings,
} from "@/lib/portalOfferRules";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20";

const GROUPS: { title: string; hint?: string; fields: { key: keyof OfferPageSettings; label: string; long?: boolean }[] }[] = [
  {
    title: "Sidebar & header",
    fields: [
      { key: "navLabel", label: "Tab name (sidebar + back link)" },
      { key: "heroEyebrow", label: "Small label above the title" },
      { key: "heroTitle", label: "Title" },
      { key: "heroTitleHighlight", label: "Title, second line (purple)" },
      { key: "heroSubtitle", label: "Subtitle", long: true },
    ],
  },
  {
    title: "Catalog",
    fields: [
      { key: "featuredLabel", label: "Featured spotlight label" },
      { key: "learnMoreLabel", label: "Card link text" },
      { key: "allFilterLabel", label: "\"All\" category filter" },
      { key: "requestedBadge", label: "Badge on services the client asked about" },
      { key: "emptyText", label: "When nothing is live" },
    ],
  },
  {
    title: "Service page",
    hint: "{service} is replaced with the service's name.",
    fields: [
      { key: "highlightsHeading", label: "Proof points heading" },
      { key: "exploreHeading", label: "Other services heading" },
    ],
  },
  {
    title: "Request panel",
    hint: "{service} is replaced with the service's name.",
    fields: [
      { key: "ctaEyebrow", label: "Small label" },
      { key: "ctaHeading", label: "Heading" },
      { key: "ctaBodyRequest", label: "Text for Request info services", long: true },
      { key: "ctaBodyBooking", label: "Text for Book a call services", long: true },
      { key: "ctaFootnote", label: "Footnote" },
    ],
  },
  {
    title: "Request form (Request info services)",
    fields: [
      { key: "formIntro", label: "Intro", long: true },
      { key: "formEmailLabel", label: "Email field" },
      { key: "formPhoneLabel", label: "Phone field" },
      { key: "formMessageLabel", label: "Message field" },
      { key: "formMessagePlaceholder", label: "Message placeholder" },
      { key: "formSubmit", label: "Send button" },
    ],
  },
  {
    title: "After the client asks",
    fields: [
      { key: "requestSentLabel", label: "Request info: confirmation (the date follows)" },
      { key: "requestSuccess", label: "Request info: follow-up line" },
      { key: "bookingSuccess", label: "Book a call: confirmation" },
      { key: "bookingSuccessBody", label: "Book a call: follow-up line" },
      { key: "bookingLinkLabel", label: "Book a call: link back to the booking page" },
    ],
  },
];

type PageKey = keyof OfferPageSettings;

/**
 * Client Directory → Cross-sell → Page design: every word of the portal page
 * outside the service cards + the header image, with a live preview. Blank
 * fields use the default (shown as the placeholder); optional elements can be
 * hidden. Colors follow the dashboard theme.
 */
export function OfferPageEditor() {
  const { data, isError, refetch } = useOfferPage();
  // The form re-mounts from the fresh server copy after each save/reset.
  const [formKey, setFormKey] = useState(0);
  const [saved, setSaved] = useState(false);
  if (isError) return <QueryErrorState title="Couldn't load the page design" onRetry={() => refetch()} />;
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-muted/60" />;
  return (
    <PageForm
      key={formKey}
      data={data}
      saved={saved}
      onDone={(wasSave) => {
        setSaved(wasSave);
        setFormKey((k) => k + 1);
      }}
    />
  );
}

function PageForm({
  data,
  saved,
  onDone,
}: {
  data: OfferPageResponse;
  saved: boolean;
  onDone: (wasSave: boolean) => void;
}) {
  const qc = useQueryClient();
  const { defaults } = data;
  // Only the admin's changes are filled in; the rest show the default as the placeholder.
  const [draft, setDraft] = useState<OfferPageSettings>(() => {
    const d = { ...defaults };
    for (const k of Object.keys(d) as PageKey[]) d[k] = data.overrides[k] ?? "";
    return d;
  });
  // Optional elements switched off (stored as null). Their typed text is kept, so un-hiding restores it.
  const [hidden, setHidden] = useState<Set<PageKey>>(
    () => new Set(HIDEABLE_OFFER_PAGE_FIELDS.filter((k) => data.overrides[k] === null))
  );
  const hero = useImageDraft(data.heroImageUrl, OFFER_IMAGE_MAX_BYTES.hero);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const { data: catalog } = useQuery({ queryKey: CATALOG_KEY, queryFn: fetchCatalog });
  const sample = catalog?.find((o) => o.active) ?? catalog?.[0] ?? null;

  const previewSettings = Object.fromEntries(
    (Object.keys(defaults) as PageKey[]).map((k) => [k, hidden.has(k) ? "" : draft[k].trim() || defaults[k]])
  ) as unknown as OfferPageSettings;

  const set = (key: PageKey, value: string) => {
    setDirty(true);
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const setHiddenField = (key: PageKey, on: boolean) => {
    setDirty(true);
    setHidden((h) => {
      const next = new Set(h);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  const fieldProps = { draft, defaults, hidden, onChange: set, onHide: setHiddenField };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clients/offers/page", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          Object.fromEntries(
            (Object.keys(draft) as PageKey[]).map((k) => [k, hidden.has(k) ? null : draft[k]])
          ) as OfferPageOverrides
        ),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Save failed (HTTP ${res.status})`);
      const imageError = await hero.commit("page", "hero");
      await qc.invalidateQueries({ queryKey: OFFER_PAGE_KEY });
      if (imageError) throw new Error(`Saved, but: ${imageError}`);
      onDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  async function reset() {
    if (!confirm("Reset all page text to the defaults and remove the header image?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clients/offers/page", { method: "DELETE" });
      if (!res.ok) throw new Error(`Reset failed (HTTP ${res.status})`);
      await qc.invalidateQueries({ queryKey: OFFER_PAGE_KEY });
      onDone(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Leave a field blank to use the default shown in grey. &quot;Hide&quot; removes an optional line altogether.
        </p>
        {GROUPS.slice(0, 1).map((g) => (
          <FieldGroup key={g.title} group={g} {...fieldProps} />
        ))}

        <ImageField
          label="Header image"
          onChange={() => setDirty(true)}
          hint="Optional image on the right of the header (PNG, JPEG or WebP, up to 2 MB), hidden on phones."
          draft={hero}
          wide
        />

        {GROUPS.slice(1).map((g) => (
          <FieldGroup key={g.title} group={g} {...fieldProps} />
        ))}

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to defaults
          </button>
          <div className="flex items-center gap-3">
            {saved && !dirty && <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Saved — live for clients</span>}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save page design
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 self-start xl:sticky xl:top-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Client preview</p>
        <p className="text-sm font-semibold text-foreground">Sidebar: {previewSettings.navLabel}</p>
        <OfferPageHero settings={previewSettings} imageUrl={hero.previewUrl} />
        <div className="grid gap-4 sm:grid-cols-2">
          <OfferCard
            offer={
              sample ?? {
                title: "Your service",
                tagline: "The one-liner from the catalog.",
                category: "Category",
                logoUrl: null,
                coverUrl: null,
                badge: null,
                highlights: [],
              }
            }
            learnMoreLabel={previewSettings.learnMoreLabel}
            requestedLabel={previewSettings.requestedBadge}
          />
          <OfferRequestPanel
            preview
            offer={{
              id: sample?.id ?? "preview",
              title: sample?.title ?? "Your service",
              ctaType: sample?.ctaType ?? "request_info",
              ctaLabel: sample?.ctaLabel ?? null,
              ctaUrl: sample?.ctaUrl ?? null,
              links: sample?.links ?? [],
            }}
            copy={previewSettings}
            requestedAt={null}
            defaultEmail={null}
          />
        </div>
      </div>
    </div>
  );
}

function FieldGroup({
  group,
  draft,
  defaults,
  hidden,
  onChange,
  onHide,
}: {
  group: (typeof GROUPS)[number];
  draft: OfferPageSettings;
  defaults: OfferPageSettings;
  hidden: Set<PageKey>;
  onChange: (key: PageKey, value: string) => void;
  onHide: (key: PageKey, on: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="border-b border-border/50 pb-1">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{group.title}</p>
        {group.hint && <p className="text-xs text-muted-foreground">{group.hint}</p>}
      </div>
      {group.fields.map((f) => {
        const id = `offer-page-${f.key}`;
        const isHidden = hidden.has(f.key);
        const input = {
          id,
          value: isHidden ? "" : draft[f.key],
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(f.key, e.target.value),
          placeholder: isHidden ? "Hidden from clients" : defaults[f.key],
          maxLength: OFFER_PAGE_LIMITS[f.key],
          disabled: isHidden,
          className: cn(inputClass, "disabled:cursor-not-allowed disabled:opacity-60"),
        };
        return (
          <div key={f.key} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={id} className="text-sm font-semibold text-foreground">
                {f.label}
              </label>
              {HIDEABLE_OFFER_PAGE_FIELDS.includes(f.key) && (
                <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <input type="checkbox" checked={isHidden} onChange={(e) => onHide(f.key, e.target.checked)} />
                  Hide
                </label>
              )}
            </div>
            {f.long ? <textarea rows={3} {...input} /> : <input {...input} />}
          </div>
        );
      })}
    </div>
  );
}
