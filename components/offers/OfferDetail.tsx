import { Award } from "lucide-react";
import { OfferBody } from "./OfferBody";
import { OfferHighlights, OfferLogo, OfferPill } from "./OfferVisuals";
import { OfferRequestPanel, type OfferPanelCopy } from "./OfferRequestPanel";
import { withService, type OfferPageSettings } from "@/lib/portalOfferRules";
import type { PortalOffer } from "@/lib/portalOffers";

export type OfferDetailData = Pick<
  PortalOffer,
  | "id"
  | "title"
  | "tagline"
  | "category"
  | "badge"
  | "logoUrl"
  | "coverUrl"
  | "highlights"
  | "body"
  | "ctaType"
  | "ctaLabel"
  | "ctaUrl"
  | "links"
>;

/**
 * A service's page: hero, pitch, proof points and the request panel. The
 * portal renders it AND the admin editor previews it, so the preview is
 * exactly what clients see (`preview` tracks and files nothing).
 */
export function OfferDetail({
  offer,
  settings,
  requestedAt,
  defaultEmail,
  preview = false,
}: {
  offer: OfferDetailData;
  settings: OfferPanelCopy & Pick<OfferPageSettings, "highlightsHeading">;
  requestedAt: string | null;
  defaultEmail: string | null;
  preview?: boolean;
}) {
  // Up to three numbers headline the hero; every other proof point is listed below.
  const heroStats = offer.highlights.filter((h) => h.stat).slice(0, 3);
  const otherPoints = offer.highlights.filter((h) => !heroStats.includes(h));
  const hasDetails = Boolean(offer.body) || otherPoints.length > 0;

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-primary/5 bg-primary/5 p-6 md:p-12">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
            <OfferLogo title={offer.title} logoUrl={offer.logoUrl} size="lg" className="shadow-sm" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {offer.category && <OfferPill>{offer.category}</OfferPill>}
                {offer.badge && <OfferPill>{offer.badge}</OfferPill>}
              </div>
              <h1 className="mt-3 break-words text-2xl font-extrabold leading-tight text-portal-on-surface md:text-4xl">
                {offer.title}
              </h1>
              {offer.tagline && (
                <p className="mt-3 max-w-2xl text-lg leading-relaxed text-portal-secondary-text">{offer.tagline}</p>
              )}
            </div>
          </div>
          {offer.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.coverUrl}
              alt=""
              className="w-full rounded-xl object-cover shadow-sm lg:max-h-60 lg:w-96"
            />
          )}
        </div>
        {heroStats.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {heroStats.map((h, i) => (
              <div key={i} className="rounded-lg bg-portal-surface-lowest p-4 shadow-sm">
                <p className="text-2xl font-black text-primary">{h.stat}</p>
                <p className="mt-1 text-sm leading-snug text-portal-secondary-text">{h.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className={hasDetails ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" : "max-w-xl"}>
        {hasDetails && (
          <div className="space-y-6">
            {offer.body && (
              <article className="rounded-xl bg-portal-surface-lowest p-5 shadow-sm md:p-8">
                <OfferBody body={offer.body} />
              </article>
            )}
            {otherPoints.length > 0 && (
              <section className="rounded-xl bg-portal-surface-lowest p-5 shadow-sm md:p-8">
                <div className="mb-6 flex items-center gap-4">
                  <div className="shrink-0 rounded-lg bg-violet-100 p-3 text-primary dark:bg-violet-900/30">
                    <Award className="h-6 w-6" />
                  </div>
                  <h2 className="break-words text-xl font-bold text-portal-on-surface">
                    {withService(settings.highlightsHeading, offer.title)}
                  </h2>
                </div>
                <OfferHighlights highlights={otherPoints} />
              </section>
            )}
          </div>
        )}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <OfferRequestPanel
            offer={offer}
            copy={settings}
            requestedAt={requestedAt}
            defaultEmail={defaultEmail}
            preview={preview}
          />
        </aside>
      </div>
    </>
  );
}
