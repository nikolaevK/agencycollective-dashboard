"use client";

import { useState } from "react";
import { Eye, Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { OfferCard } from "../OfferCard";
import { OfferDetail } from "../OfferDetail";
import { OfferRequestPanel } from "../OfferRequestPanel";
import { ImageField, useImageDraft } from "./ImageField";
import {
  DEFAULT_OFFER_PAGE,
  OFFER_IMAGE_MAX_BYTES,
  ctaLabelOf,
  type OfferCtaType,
  type OfferFields,
  type OfferPageSettings,
} from "@/lib/portalOfferRules";
import type { PortalOffer } from "@/lib/portalOffers";

const MAX_HIGHLIGHTS = 6;
const MAX_LINKS = 4;
const BADGE_SUGGESTIONS = ["New", "Popular", "Limited time", "Exclusive"];

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

// The accent color is no longer used by the design (everything follows the dashboard theme).
type Draft = Omit<OfferFields, "highlights" | "ctaLabel" | "ctaUrl" | "badge" | "accent"> & {
  highlights: { stat: string; text: string }[];
  badge: string;
  ctaLabel: string;
  ctaUrl: string;
};

function toDraft(o: PortalOffer | null): Draft {
  return {
    title: o?.title ?? "",
    tagline: o?.tagline ?? "",
    category: o?.category ?? "",
    body: o?.body ?? "",
    highlights: (o?.highlights ?? []).map((h) => ({ stat: h.stat ?? "", text: h.text })),
    badge: o?.badge ?? "",
    links: o?.links ?? [],
    ctaType: o?.ctaType ?? "request_info",
    ctaLabel: o?.ctaLabel ?? "",
    ctaUrl: o?.ctaUrl ?? "",
    featured: o?.featured ?? false,
    active: o?.active ?? false,
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-b border-border/50 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

/** Create/edit one catalog service, with a live preview of what clients see. */
export function OfferEditorDialog({
  offer,
  categories,
  page,
  onClose,
  onSaved,
}: {
  offer: PortalOffer | null;
  categories: string[];
  page: OfferPageSettings | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(offer));
  // What was last saved — closing with anything else asks first.
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(toDraft(offer)));
  const [pagePreview, setPagePreview] = useState(false);
  // A new service that saved but whose image upload failed: later saves edit it, never re-create it.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const savedId = offer?.id ?? createdId;
  const logo = useImageDraft(offer?.logoUrl ?? null, OFFER_IMAGE_MAX_BYTES.logo);
  const cover = useImageDraft(offer?.coverUrl ?? null, OFFER_IMAGE_MAX_BYTES.cover);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labels = page ?? DEFAULT_OFFER_PAGE;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setHighlight = (i: number, patch: Partial<{ stat: string; text: string }>) =>
    set(
      "highlights",
      draft.highlights.map((h, j) => (j === i ? { ...h, ...patch } : h))
    );
  const setLink = (i: number, patch: Partial<{ label: string; url: string }>) =>
    set(
      "links",
      draft.links.map((l, j) => (j === i ? { ...l, ...patch } : l))
    );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(savedId ? `/api/admin/clients/offers/${savedId}` : "/api/admin/clients/offers", {
        method: savedId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          highlights: draft.highlights.filter((h) => h.text.trim()),
          // The booking link belongs to Book a call only (its field is hidden otherwise).
          ctaUrl: draft.ctaType === "book_call" ? draft.ctaUrl : "",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Save failed (HTTP ${res.status})`);
      const id = (json.data as PortalOffer).id;
      setCreatedId(id);
      setSavedJson(JSON.stringify(draft));

      const imageErrors = (await Promise.all([logo.commit(id, "logo"), cover.commit(id, "cover")])).filter(Boolean);
      onSaved();
      if (imageErrors.length > 0) throw new Error(`Saved, but: ${imageErrors.join("; ")}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const dirty = JSON.stringify(draft) !== savedJson || logo.dirty || cover.dirty;
  function requestClose() {
    if (saving) return;
    if (dirty && !confirm("Discard your unsaved changes to this service?")) return;
    onClose();
  }

  const previewHighlights = draft.highlights
    .filter((h) => h.text.trim())
    .map((h) => ({ stat: h.stat.trim() || null, text: h.text }));
  const previewPanelOffer = {
    id: offer?.id ?? "preview",
    title: draft.title || "this service",
    ctaType: draft.ctaType,
    ctaLabel: draft.ctaLabel.trim() || null,
    ctaUrl: draft.ctaUrl || null,
    links: draft.links.filter((l) => l.label.trim() && l.url.trim()),
  };

  return (
    <Dialog open onOpenChange={(o) => !o && requestClose()}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{offer ? `Edit ${offer.title}` : "New service"}</DialogTitle>
          <DialogDescription>Shown to clients in their portal under {labels.navLabel}.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-5">
            <SectionTitle>Card</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title">
                <input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={80} className={inputClass} />
              </Field>
              <Field label="Category" hint="Clients can filter by it.">
                <input
                  value={draft.category}
                  onChange={(e) => set("category", e.target.value)}
                  maxLength={40}
                  list="offer-categories"
                  className={inputClass}
                />
                <datalist id="offer-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Field label="One-liner" hint="The pitch on the card.">
              <input value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={160} className={inputClass} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Badge" hint='Optional pill on the card, e.g. "New".'>
                <input
                  value={draft.badge}
                  onChange={(e) => set("badge", e.target.value)}
                  maxLength={24}
                  list="offer-badges"
                  className={inputClass}
                />
                <datalist id="offer-badges">
                  {BADGE_SUGGESTIONS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ImageField label="Logo" hint="PNG, JPEG or WebP, up to 1 MB. Square works best." draft={logo} />
              <ImageField
                label="Cover image"
                hint="Optional wide image (e.g. a product screenshot) shown on the card and the service page. Up to 2 MB."
                draft={cover}
                wide
              />
            </div>

            <SectionTitle>Service page</SectionTitle>
            <Field label="Full pitch" hint="Markdown: **bold**, - bullet lists, ## headings.">
              <textarea value={draft.body} onChange={(e) => set("body", e.target.value)} rows={6} maxLength={8000} className={inputClass} />
            </Field>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Proof points</p>
              <p className="text-xs text-muted-foreground">
                A number (e.g. &quot;$40M+&quot;) makes it a stat tile; leave it blank for a check-mark line.
              </p>
              {draft.highlights.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={h.stat}
                    onChange={(e) => setHighlight(i, { stat: e.target.value })}
                    placeholder="Stat"
                    maxLength={24}
                    className={cn(inputClass, "w-28 shrink-0")}
                  />
                  <input
                    value={h.text}
                    onChange={(e) => setHighlight(i, { text: e.target.value })}
                    placeholder="What it means"
                    maxLength={140}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => set("highlights", draft.highlights.filter((_, j) => j !== i))}
                    className="rounded-lg p-2 text-muted-foreground hover:text-red-600"
                    aria-label="Remove proof point"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {draft.highlights.length < MAX_HIGHLIGHTS && (
                <button
                  type="button"
                  onClick={() => set("highlights", [...draft.highlights, { stat: "", text: "" }])}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  <Plus className="h-4 w-4" />
                  Add proof point
                </button>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Links</p>
              <p className="text-xs text-muted-foreground">
                Extra buttons under the main one — website, pricing, a deck (https). Clicks are tracked per client.
              </p>
              {draft.links.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={l.label}
                    onChange={(e) => setLink(i, { label: e.target.value })}
                    placeholder="Label"
                    maxLength={40}
                    className={cn(inputClass, "w-40 shrink-0")}
                  />
                  <input
                    value={l.url}
                    onChange={(e) => setLink(i, { url: e.target.value })}
                    placeholder="https://"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => set("links", draft.links.filter((_, j) => j !== i))}
                    className="rounded-lg p-2 text-muted-foreground hover:text-red-600"
                    aria-label="Remove link"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {draft.links.length < MAX_LINKS && (
                <button
                  type="button"
                  onClick={() => set("links", [...draft.links, { label: "", url: "" }])}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  <Plus className="h-4 w-4" />
                  Add link
                </button>
              )}
            </div>

            <SectionTitle>Main button</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                <select
                  value={draft.ctaType}
                  onChange={(e) => set("ctaType", e.target.value as OfferCtaType)}
                  className={inputClass}
                >
                  <option value="request_info">Request info (short form)</option>
                  <option value="book_call">Book a call (opens a booking link)</option>
                </select>
              </Field>
              <Field label="Button text" hint="Optional.">
                <input
                  value={draft.ctaLabel}
                  onChange={(e) => set("ctaLabel", e.target.value)}
                  placeholder={ctaLabelOf({ ctaType: draft.ctaType, ctaLabel: null })}
                  maxLength={40}
                  className={inputClass}
                />
              </Field>
            </div>
            {draft.ctaType === "book_call" && (
              <Field label="Booking link" hint="Your calendar page (https). The lead is recorded before it opens.">
                <input
                  value={draft.ctaUrl}
                  onChange={(e) => set("ctaUrl", e.target.value)}
                  placeholder="https://"
                  className={inputClass}
                />
              </Field>
            )}

            <SectionTitle>Visibility</SectionTitle>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <input type="checkbox" checked={draft.active} onChange={(e) => set("active", e.target.checked)} />
                Live in client portals
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <input type="checkbox" checked={draft.featured} onChange={(e) => set("featured", e.target.checked)} />
                Featured (the one spotlight at the top — takes over from the current one once this is live)
              </label>
            </div>
          </div>

          <div className="space-y-4 self-start md:sticky md:top-0">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Client preview</p>
            <OfferCard
              offer={{
                title: draft.title,
                tagline: draft.tagline,
                category: draft.category,
                logoUrl: logo.previewUrl,
                coverUrl: cover.previewUrl,
                badge: draft.badge.trim() || null,
                highlights: previewHighlights,
              }}
              learnMoreLabel={labels.learnMoreLabel}
            />
            <OfferRequestPanel preview offer={previewPanelOffer} copy={labels} requestedAt={null} defaultEmail={null} />
            <button
              type="button"
              onClick={() => setPagePreview(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted/50"
            >
              <Eye className="h-4 w-4" />
              Preview the service page
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !draft.title.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </DialogContent>

      {/* The full service page as clients will see it (unsaved edits included). */}
      <Dialog open={pagePreview} onOpenChange={setPagePreview}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Service page preview</DialogTitle>
            <DialogDescription>What clients see when they open {draft.title || "this service"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            <OfferDetail
              preview
              offer={{
                ...previewPanelOffer,
                title: draft.title || "Untitled",
                tagline: draft.tagline,
                category: draft.category,
                badge: draft.badge.trim() || null,
                logoUrl: logo.previewUrl,
                coverUrl: cover.previewUrl,
                highlights: previewHighlights,
                body: draft.body.trim(),
              }}
              settings={labels}
              requestedAt={null}
              defaultEmail={null}
            />
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
