import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { OfferSpotlight } from "@/components/offers/OfferCard";
import { OfferCatalog } from "@/components/offers/OfferCatalog";
import { OfferPageHero } from "@/components/offers/OfferPageHero";
import { getOfferPage, getOpenRequestsByOffer, listOffers, markCatalogSeen } from "@/lib/portalOffers";

export const dynamic = "force-dynamic";

export default async function MoreFromAgencyPage({ params }: { params: { slug: string } }) {
  const session = getSession();
  if (!session) redirect("/?portal=client");
  await ensureMigrated();
  const user = await findUser(session.userId);
  if (!user || user.slug !== params.slug) redirect("/?portal=client");

  const [offers, open, page] = await Promise.all([
    listOffers({ activeOnly: true }),
    getOpenRequestsByOffer(user.id),
    getOfferPage(),
  ]);
  // Clears the sidebar's "New" pill. Non-critical.
  await markCatalogSeen(user.id).catch((err) => console.error("[portal/more] markCatalogSeen failed:", err));

  const { settings } = page;
  const basePath = `/${params.slug}/portal/more`;
  const featured = offers.find((o) => o.featured) ?? null;
  // The spotlighted service isn't repeated in the grid.
  const grid = featured ? offers.filter((o) => o.id !== featured.id) : offers;

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <OfferPageHero settings={settings} imageUrl={page.heroImageUrl} />

        {offers.length === 0 ? (
          <div className="rounded-xl bg-portal-surface-lowest p-10 text-center text-portal-secondary-text shadow-sm">
            {settings.emptyText}
          </div>
        ) : (
          <>
            {featured && (
              <OfferSpotlight
                offer={featured}
                href={`${basePath}/${featured.slug}`}
                featuredLabel={settings.featuredLabel}
                learnMoreLabel={settings.learnMoreLabel}
                requestedLabel={open.has(featured.id) ? settings.requestedBadge : null}
              />
            )}
            {grid.length > 0 && (
              <OfferCatalog offers={grid} basePath={basePath} requestedIds={Array.from(open.keys())} labels={settings} />
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
