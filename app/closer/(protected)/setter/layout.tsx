import { requireCloserRecord } from "@/lib/closerGuards";

export default async function SetterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireCloserRecord({ allow: "setters-only" });
  return children;
}
