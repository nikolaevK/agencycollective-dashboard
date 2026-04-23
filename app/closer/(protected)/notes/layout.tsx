import { requireCloserRecord } from "@/lib/closerGuards";

export default async function CloserNotesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCloserRecord({ allow: "closers-only" });
  return children;
}
