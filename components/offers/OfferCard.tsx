import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { OfferLogo, OfferPill, OfferStats } from "./OfferVisuals";
import type { PortalOffer } from "@/lib/portalOffers";

export type OfferCardData = Pick<
  PortalOffer,
  "title" | "tagline" | "category" | "logoUrl" | "coverUrl" | "badge" | "highlights"
>;

function RequestedPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </span>
  );
}

/** Catalog card — a portal surface card. Without `href` it renders static (the admin preview). */
export function OfferCard({
  offer,
  href,
  requestedLabel,
  learnMoreLabel,
}: {
  offer: OfferCardData;
  href?: string;
  /** Set when the client has an open request: the badge text. */
  requestedLabel?: string | null;
  learnMoreLabel: string;
}) {
  const lead = offer.highlights.find((h) => h.stat);
  const body = (
    <>
      {offer.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={offer.coverUrl} alt="" className="mb-5 aspect-[16/9] w-full rounded-lg object-cover" />
      )}
      <div className="flex items-start justify-between gap-3">
        <OfferLogo title={offer.title || "?"} logoUrl={offer.logoUrl} />
        {offer.badge && <OfferPill>{offer.badge}</OfferPill>}
      </div>
      {offer.category && (
        <p className="mt-5 text-[10px] font-bold uppercase tracking-widest text-portal-outline-variant">
          {offer.category}
        </p>
      )}
      <h3 className={cn("text-lg font-bold text-portal-on-surface", !offer.category && "mt-5")}>
        {offer.title || "Untitled"}
      </h3>
      {offer.tagline && (
        <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-portal-secondary-text">{offer.tagline}</p>
      )}
      {lead && (
        <p className="mt-3 text-sm">
          <span className="font-black text-primary">{lead.stat}</span>{" "}
          <span className="text-portal-secondary-text">{lead.text}</span>
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary">
          {learnMoreLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
        {requestedLabel && <RequestedPill label={requestedLabel} />}
      </div>
    </>
  );
  const className = cn(
    "group flex h-full flex-col rounded-xl border border-transparent bg-portal-surface-lowest p-6 shadow-sm",
    href && "transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** The featured service, full width at the top of the catalog. */
export function OfferSpotlight({
  offer,
  href,
  featuredLabel,
  learnMoreLabel,
  requestedLabel,
}: {
  offer: OfferCardData;
  href: string;
  featuredLabel: string;
  learnMoreLabel: string;
  requestedLabel?: string | null;
}) {
  const stats = offer.highlights.filter((h) => h.stat).slice(0, 3);
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-transparent bg-portal-surface-lowest p-6 shadow-sm transition-all hover:border-primary/20 hover:shadow-md md:p-8"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-5">
          <OfferLogo title={offer.title} logoUrl={offer.logoUrl} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <OfferPill>
                <Sparkles className="h-3 w-3" />
                {featuredLabel}
              </OfferPill>
              {offer.badge && <OfferPill>{offer.badge}</OfferPill>}
              {offer.category && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-portal-outline-variant">
                  {offer.category}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-2xl font-extrabold text-portal-on-surface md:text-3xl">{offer.title}</h2>
            {offer.tagline && <p className="mt-1 max-w-xl text-portal-secondary-text">{offer.tagline}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm">
                {learnMoreLabel}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
              {requestedLabel && <RequestedPill label={requestedLabel} />}
            </div>
          </div>
        </div>
        {offer.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={offer.coverUrl} alt="" className="w-full rounded-lg object-cover lg:w-80" />
        ) : (
          stats.length > 0 && (
            <div className="w-full lg:w-[22rem]">
              <OfferStats stats={stats} compact />
            </div>
          )
        )}
      </div>
    </Link>
  );
}
