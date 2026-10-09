import { DashboardShell } from "@/components/layout/DashboardShell";
import { BrandAssetsPanel } from "@/components/assets/BrandAssetsPanel";

export default function MyBrandPage() {
  return (
    <DashboardShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-portal-on-surface md:text-3xl">
            My Brand
          </h1>
          <p className="max-w-2xl text-portal-secondary-text">
            Share your brand book, product photos and asset folders with our team. Everything here
            is visible to your account manager and creative team.
          </p>
        </div>
        <BrandAssetsPanel apiBase="/api/portal/assets" viewer="client" />
      </div>
    </DashboardShell>
  );
}
