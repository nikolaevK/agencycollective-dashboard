import { DashboardShell } from "@/components/layout/DashboardShell";
import { WelcomeKitRenderer } from "@/components/welcome-kit/WelcomeKitRenderer";
import { getWelcomeKitDoc } from "@/lib/welcomeKit";

// Render fresh so admin edits in the builder show up immediately.
export const dynamic = "force-dynamic";

export default async function WelcomeKitPage({
  params,
}: {
  params: { slug: string };
}) {
  const doc = await getWelcomeKitDoc();
  return (
    <DashboardShell>
      <WelcomeKitRenderer doc={doc} variant="portal" slug={params.slug} />
    </DashboardShell>
  );
}
