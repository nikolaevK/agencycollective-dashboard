import { DashboardShell } from "@/components/layout/DashboardShell";
import { Handshake } from "lucide-react";

export default function ClosersPage() {
  return (
    <DashboardShell>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="p-4 rounded-2xl bg-primary/10 mb-6">
          <Handshake className="h-10 w-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Closers</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          Closer performance tracking and management coming soon.
        </p>
      </div>
    </DashboardShell>
  );
}
