import { requireCloserRecord } from "@/lib/closerGuards";

export default async function CloserNewDealLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCloserRecord({ allow: "closers-only" });
  return children;
}
