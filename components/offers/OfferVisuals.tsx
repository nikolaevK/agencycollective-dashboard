import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OfferHighlight } from "@/lib/portalOfferRules";

/**
 * Shared look of a "More from Agency Collective" service — used by the portal
 * catalog/detail pages AND the admin previews, so what an admin previews is
 * exactly what clients see. Styled like the rest of the portal (Welcome Kit):
 * white surface cards, lavender tiles, the primary purple for emphasis.
 */

function initials(title: string): string {
  const words = title.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const LOGO_SIZES = {
  sm: { box: "h-10 min-w-10 max-w-[8rem]", initials: "w-10 text-xs" },
  md: { box: "h-12 min-w-12 max-w-[10rem]", initials: "w-12 text-sm" },
  lg: { box: "h-16 min-w-16 max-w-[13rem]", initials: "w-16 text-base" },
} as const;

/**
 * The service's logo on a white tile that grows with wide wordmarks (square
 * icons stay square); its initials on a lavender tile when there's none.
 */
export function OfferLogo({
  title,
  logoUrl,
  size = "md",
  className,
}: {
  title: string;
  logoUrl: string | null;
  size?: keyof typeof LOGO_SIZES;
  className?: string;
}) {
  const s = LOGO_SIZES[size];
  return logoUrl ? (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white px-2 ring-1 ring-border/60",
        s.box,
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt="" className="max-h-[72%] w-auto max-w-full object-contain" />
    </div>
  ) : (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg bg-violet-100 font-black tracking-tight text-primary dark:bg-violet-900/30",
        s.box,
        s.initials,
        className
      )}
    >
      {initials(title)}
    </div>
  );
}

/** Small pill — the service's badge ("New", "Popular", …) or a label like "Featured". */
export function OfferPill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Proof points: number tiles when a point has a number, check rows otherwise. */
export function OfferHighlights({ highlights }: { highlights: OfferHighlight[] }) {
  if (highlights.length === 0) return null;
  const stats = highlights.filter((h) => h.stat);
  const points = highlights.filter((h) => !h.stat);
  return (
    <div className="space-y-4">
      {stats.length > 0 && <OfferStats stats={stats} />}
      {points.length > 0 && (
        <ul className="space-y-2.5">
          {points.map((h, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-portal-on-surface">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="leading-relaxed">{h.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Number tiles (the Welcome Kit callout look). */
export function OfferStats({ stats, compact }: { stats: OfferHighlight[]; compact?: boolean }) {
  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3")}>
      {stats.map((h, i) => (
        <div key={i} className={cn("rounded-lg border border-primary/10 bg-primary/5", compact ? "p-3" : "p-4")}>
          <p className={cn("font-black leading-tight text-primary", compact ? "text-lg" : "text-2xl")}>{h.stat}</p>
          <p className={cn("mt-1 leading-snug text-portal-secondary-text", compact ? "line-clamp-2 text-[11px]" : "text-sm")}>
            {h.text}
          </p>
        </div>
      ))}
    </div>
  );
}
