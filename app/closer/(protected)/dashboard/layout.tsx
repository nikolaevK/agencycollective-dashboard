import { requireCloserRecord } from "@/lib/closerGuards";

export default async function CloserDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCloserRecord({ allow: "closers-only" });
  return children;
}
