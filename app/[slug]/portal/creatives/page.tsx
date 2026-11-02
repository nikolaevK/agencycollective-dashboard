import { DashboardShell } from "@/components/layout/DashboardShell";
import { CreativesGallery } from "@/components/assets/CreativesGallery";

export default function AdCreativesPage() {
  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight lg:text-3xl">
            Ad Creatives
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every creative we&apos;ve made for you. Tap one to view it full size or download the
            original.
          </p>
        </div>
        <CreativesGallery apiBase="/api/portal/assets" canUpload={false} />
      </div>
    </DashboardShell>
  );
}
