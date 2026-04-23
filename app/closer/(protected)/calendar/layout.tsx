import { requireCloserRecord } from "@/lib/closerGuards";

export default async function CloserCalendarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCloserRecord({ allow: "closers-only" });
  return children;
}
