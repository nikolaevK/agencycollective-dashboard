import type { OfferPageSettings } from "@/lib/portalOfferRules";

/**
 * Header of the portal catalog — the Welcome Kit hero look (lavender panel,
 * pill label, title with a primary-colored second line). Every word comes
 * from the admin Page design; the optional image sits on the right.
 */
export function OfferPageHero({
  settings,
  imageUrl,
}: {
  settings: Pick<OfferPageSettings, "heroEyebrow" | "heroTitle" | "heroTitleHighlight" | "heroSubtitle">;
  imageUrl: string | null;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-primary/5 bg-primary/5 p-6 md:p-12">
      <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="relative z-10 max-w-2xl">
          {settings.heroEyebrow && (
            <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
              {settings.heroEyebrow}
            </span>
          )}
          <h1 className="mb-4 break-words text-2xl font-extrabold leading-tight text-portal-on-surface md:text-4xl">
            {settings.heroTitle}
            {settings.heroTitle && settings.heroTitleHighlight && <br />}
            {settings.heroTitleHighlight && <span className="text-primary">{settings.heroTitleHighlight}</span>}
          </h1>
          {settings.heroSubtitle && (
            <p className="text-lg leading-relaxed text-portal-secondary-text">{settings.heroSubtitle}</p>
          )}
        </div>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            className="hidden max-h-56 w-full max-w-sm shrink-0 rounded-xl object-cover shadow-sm md:block"
          />
        )}
      </div>
    </section>
  );
}
