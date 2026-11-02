import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/** "Open the page this card summarizes" link for a card header. */
export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      // Padding (offset by a negative margin) gives a ~32px tap target.
      className="-my-2 inline-flex shrink-0 items-center gap-0.5 rounded-full py-2 text-xs font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/30"
    >
      {children}
      <ArrowUpRight className="size-3.5" />
    </Link>
  );
}
