import type { Metadata } from "next";
import { WelcomeKitRenderer } from "@/components/welcome-kit/WelcomeKitRenderer";
import { getPublishedWelcomeKit } from "@/lib/welcomeKit";

// Public, no-login page. NOT covered by middleware matchers, so it's reachable
// by anyone with the link. Gated only by the admin "publish" toggle.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Welcome Kit — Agency Collective",
  description:
    "How we communicate, operate, and build results together at Agency Collective.",
};

export default async function PublicWelcomeKitPage() {
  const doc = await getPublishedWelcomeKit();

  if (!doc) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-foreground mb-2">
            Welcome Kit unavailable
          </h1>
          <p className="text-sm text-muted-foreground">
            This page hasn&apos;t been published yet. Please check back later.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-background">
      <div className="container mx-auto max-w-7xl p-4 pb-24 md:p-6 md:pb-12">
        <WelcomeKitRenderer doc={doc} variant="public" />
      </div>
    </main>
  );
}
