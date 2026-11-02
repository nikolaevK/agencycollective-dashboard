import { DashboardShell } from "@/components/layout/DashboardShell";
import { BrandAssetsPanel } from "@/components/assets/BrandAssetsPanel";

export default function MyBrandPage() {
  return (
    <DashboardShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
            My Brand
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Share your brand book, product photos and asset folders with our team. Everything here
            is visible to your account manager and creative team.
          </p>
        </div>
        <BrandAssetsPanel apiBase="/api/portal/assets" viewer="client" />
      </div>
    </DashboardShell>
  );
}
