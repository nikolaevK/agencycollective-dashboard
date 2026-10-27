import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/session";
import { findUser } from "@/lib/users";
import { ensureMigrated } from "@/lib/db";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { OfferCard } from "@/components/offers/OfferCard";
import { OfferDetail } from "@/components/offers/OfferDetail";
import { getActiveOfferBySlug, getOfferPage, getOpenRequestsByOffer, listOffers } from "@/lib/portalOffers";

export const dynamic = "force-dynamic";

export default async function OfferDetailPage({
  params,
}: {
  params: { slug: string; offerSlug: string };
}) {
  const session = getSession();
  if (!session) redirect("/?portal=client");
  await ensureMigrated();
  const user = await findUser(session.userId);
  if (!user || user.slug !== params.slug) redirect("/?portal=client");

  const basePath = `/${params.slug}/portal/more`;
  const offer = await getActiveOfferBySlug(params.offerSlug);
  // Hidden or removed since the link was shared → back to the catalog.
  if (!offer) redirect(basePath);

  const [open, all, { settings }] = await Promise.all([
    getOpenRequestsByOffer(user.id),
    listOffers({ activeOnly: true }),
    getOfferPage(),
  ]);
  const others = all.filter((o) => o.id !== offer.id).slice(0, 3);

  return (
    <DashboardShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href={basePath}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-portal-secondary-text transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          {settings.navLabel}
        </Link>

        <OfferDetail
          offer={offer}
          settings={settings}
          requestedAt={open.get(offer.id)?.createdAt ?? null}
          defaultEmail={user.email}
        />

        {others.length > 0 && (
          <section className="space-y-4 pt-2">
            <h2 className="text-lg font-bold text-portal-on-surface">{settings.exploreHeading}</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {others.map((o) => (
                <OfferCard
                  key={o.id}
                  offer={o}
                  href={`${basePath}/${o.slug}`}
                  requestedLabel={open.has(o.id) ? settings.requestedBadge : null}
                  learnMoreLabel={settings.learnMoreLabel}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
