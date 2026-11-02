"use client";

import ReactMarkdown from "react-markdown";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone, badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resolveIcon } from "./icons";
import type {
  WelcomeKitDoc,
  WkSection,
  WkBlock,
  WkVariant,
} from "@/lib/welcomeKit";

/* ------------------------------------------------------------------ */
/*  Markdown — kit-styled, sanitized by default (no raw HTML)           */
/* ------------------------------------------------------------------ */

const MD_COMPONENTS = {
  p: (p: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed mb-2 last:mb-0">{p.children}</p>
  ),
  strong: (p: { children?: React.ReactNode }) => (
    <strong className="font-bold">{p.children}</strong>
  ),
  em: (p: { children?: React.ReactNode }) => <em className="italic">{p.children}</em>,
  ul: (p: { children?: React.ReactNode }) => (
    <ul className="list-disc ml-5 space-y-1.5 mb-2 last:mb-0">{p.children}</ul>
  ),
  ol: (p: { children?: React.ReactNode }) => (
    <ol className="list-decimal ml-5 space-y-1.5 mb-2 last:mb-0">{p.children}</ol>
  ),
  li: (p: { children?: React.ReactNode }) => <li className="text-sm">{p.children}</li>,
  a: (p: { children?: React.ReactNode; href?: string }) => (
    <a
      href={p.href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
    >
      {p.children}
    </a>
  ),
  h3: (p: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-foreground mt-2 mb-1">{p.children}</h3>
  ),
  h4: (p: { children?: React.ReactNode }) => (
    <h4 className="text-sm font-semibold text-foreground mt-2 mb-1">{p.children}</h4>
  ),
  code: (p: { children?: React.ReactNode }) => (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {p.children}
    </code>
  ),
  // pre + table need explicit overflow wrappers — browser defaults
  // (white-space: pre, no scroll container) overflow the section card
  // horizontally on phones.
  pre: (p: { children?: React.ReactNode }) => (
    <pre className="overflow-x-auto rounded-2xl bg-muted/50 p-4 text-xs font-mono text-foreground my-2 [&_code]:bg-transparent [&_code]:p-0">
      {p.children}
    </pre>
  ),
  table: (p: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2 rounded-2xl border">
      <table className="w-full border-collapse text-xs">{p.children}</table>
    </div>
  ),
  th: (p: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 text-left font-medium text-foreground border-b bg-muted/40">
      {p.children}
    </th>
  ),
  td: (p: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 border-b last:border-b-0">{p.children}</td>
  ),
  blockquote: (p: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 pl-3 italic my-2">
      {p.children}
    </blockquote>
  ),
};

function MD({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown components={MD_COMPONENTS}>{children}</ReactMarkdown>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Style maps                                                          */
/* ------------------------------------------------------------------ */

// Callouts use the kit status tones (faint tinted border + fill); the icon
// takes the tone color, the copy stays readable foreground text.
const VARIANT_STYLES: Record<WkVariant, string> = {
  info: badgeTone.info,
  success: badgeTone.success,
  warning: badgeTone.warning,
  danger: badgeTone.danger,
  neutral: "border-transparent bg-muted/50 text-muted-foreground",
};

/** Neutral icon tile (no colored tiles in the kit). */
const ICON_TILE =
  "flex shrink-0 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground ring-1 ring-foreground/5 dark:ring-foreground/10";

// Responsive column classes. Each step never exceeds the chosen count, so
// picking "1 column" stays 1 across all breakpoints (no sm→2→md→1 flip).
const GRID_CARDS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-4",
};

const GRID_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-3",
};

/* ------------------------------------------------------------------ */
/*  Section wrapper (kit Card)                                         */
/* ------------------------------------------------------------------ */

function Section({ section }: { section: WkSection }) {
  const Icon = resolveIcon(section.icon);
  return (
    <section id={section.id} className="scroll-mt-24">
      <Card className="p-5 md:p-8">
        <div className="flex items-center gap-4 mb-6 md:mb-8">
          <div className={cn(ICON_TILE, "size-11")}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            {section.num && (
              <p className="text-xs text-muted-foreground break-words">
                {section.num}
              </p>
            )}
            <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground break-words">{section.title}</h3>
          </div>
        </div>
        <div className="space-y-6">
          {section.blocks.map((block) => (
            <Block key={block.id} block={block} />
          ))}
        </div>
      </Card>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Block renderer                                                     */
/* ------------------------------------------------------------------ */

function Block({ block }: { block: WkBlock }) {
  switch (block.type) {
    case "text":
      return block.body.trim() ? (
        <MD className="text-muted-foreground break-words [&_strong]:text-foreground">{block.body}</MD>
      ) : null;

    case "callout": {
      const Icon = block.icon ? resolveIcon(block.icon) : null;
      const neutral = block.variant === "neutral";
      return (
        <div className={cn("p-4 rounded-2xl border flex items-start gap-3", VARIANT_STYLES[block.variant])}>
          {Icon && <Icon className="size-4 shrink-0 mt-0.5" />}
          <div className={cn("min-w-0", neutral ? "text-muted-foreground" : "text-foreground")}>
            {block.title && (
              <p className="text-sm font-semibold text-foreground mb-0.5">{block.title}</p>
            )}
            {block.body && <MD className="text-sm">{block.body}</MD>}
          </div>
        </div>
      );
    }

    case "stat":
      return (
        <div className="rounded-2xl bg-muted/50 p-6 text-center flex flex-col items-center justify-center ring-1 ring-foreground/5 dark:ring-foreground/10 sm:max-w-xs">
          <p className="text-5xl font-semibold tracking-tight tabular-nums leading-none text-foreground mb-2 break-words max-w-full">{block.value}</p>
          <p className="text-sm font-medium text-foreground break-words max-w-full">{block.label}</p>
          {block.caption && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{block.caption}</p>
          )}
        </div>
      );

    case "checklist": {
      const Marker = resolveIcon("checkCircle");
      return (
        <div>
          {block.title && (
            <h4 className="text-sm font-medium text-foreground mb-3">
              {block.title}
            </h4>
          )}
          <ul className="space-y-2.5">
            {block.items.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm text-foreground"
              >
                {block.marker === "dot" ? (
                  <span className="size-1.5 rounded-full bg-muted-foreground/60 shrink-0 mt-2" />
                ) : (
                  <Marker className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
          {block.note && (
            <p className="text-xs text-muted-foreground mt-4">{block.note}</p>
          )}
        </div>
      );
    }

    case "cards": {
      if (block.layout === "list") {
        return (
          <div className={`grid ${GRID_CARDS[block.columns] ?? "grid-cols-1"} gap-x-6 gap-y-6`}>
            {block.items.map((it) => {
              const Icon = resolveIcon(it.icon);
              return (
                <div key={it.id} className="flex items-start gap-4">
                  <div className={cn(ICON_TILE, "size-10")}>
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h5 className="font-medium text-sm text-foreground mb-1 break-words">
                      {it.label}
                    </h5>
                    {it.desc && (
                      <p className="text-sm text-muted-foreground leading-relaxed break-words">
                        {it.desc}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      return (
        <div className={`grid ${GRID_CARDS[block.columns] ?? GRID_CARDS[3]} gap-4`}>
          {block.items.map((it) => {
            const Icon = resolveIcon(it.icon);
            return (
              <div
                key={it.id}
                className="p-5 bg-muted/40 rounded-2xl flex flex-col items-center text-center gap-2 min-w-0"
              >
                <Icon className="size-5 text-muted-foreground shrink-0" />
                <p className="text-sm font-medium text-foreground break-words max-w-full">{it.label}</p>
                {it.desc && (
                  <p className="text-xs text-muted-foreground break-words max-w-full">{it.desc}</p>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    case "columns": {
      const n = Math.min(3, Math.max(1, block.items.length));
      return (
        <div className={`grid ${GRID_COLUMNS[n] ?? "grid-cols-1"} gap-6`}>
          {block.items.map((col) => {
            const Icon = resolveIcon(col.icon);
            return (
              <div key={col.id} className="p-5 md:p-6 bg-muted/40 rounded-2xl min-w-0">
                <div className="flex items-center gap-3 mb-2 min-w-0">
                  <Icon className="size-4 text-muted-foreground shrink-0" />
                  <h4 className="font-medium text-foreground min-w-0 break-words">{col.title}</h4>
                </div>
                {col.badge && (
                  <span className={cn(badgeVariants({ variant: "outline" }), "mb-3 h-auto max-w-full whitespace-normal break-words bg-background dark:bg-transparent")}>
                    {col.badge}
                  </span>
                )}
                {col.body && (
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {col.body}
                  </p>
                )}
                {col.bullets.length > 0 && (
                  <ul className="space-y-1.5 text-sm text-foreground">
                    {col.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="size-1 rounded-full bg-muted-foreground/60 shrink-0 mt-2" />
                        <span className="min-w-0 break-words">{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    case "rows":
      return (
        <div>
          {block.title && (
            <h4 className="text-sm font-medium text-foreground mb-3">
              {block.title}
            </h4>
          )}
          <div className="space-y-2">
            {block.rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 rounded-2xl"
              >
                <span className="text-sm font-medium text-foreground min-w-0 break-words">
                  {row.label}
                </span>
                {row.value && (
                  <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
                    {row.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  TOC                                                                 */
/* ------------------------------------------------------------------ */

function parseNum(num: string): { lead: string; label: string } {
  const idx = num.indexOf("/");
  if (idx === -1) return { lead: "", label: num.trim() };
  return { lead: num.slice(0, idx).trim(), label: num.slice(idx + 1).trim() };
}

/* ------------------------------------------------------------------ */
/*  Main renderer                                                       */
/* ------------------------------------------------------------------ */

interface Props {
  doc: WelcomeKitDoc;
  /** portal = inside a client portal; public = standalone share page;
   *  preview = inside the admin builder. */
  variant?: "portal" | "public" | "preview";
  /** Client slug — used to default the CTA button to the onboarding page. */
  slug?: string;
}

export function WelcomeKitRenderer({ doc, variant = "portal", slug }: Props) {
  const { hero, sections, cta } = doc;

  const showPdf = cta.showPdf && Boolean(cta.pdfUrl);

  // CTA primary button href + visibility per surface.
  const portalFallbackHref = slug ? `/${slug}/portal/onboarding` : "";
  const ctaHref =
    cta.buttonUrl || (variant === "portal" ? portalFallbackHref : "");
  const showCtaButton =
    Boolean(cta.buttonLabel) &&
    (variant === "preview" ? true : Boolean(ctaHref));

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <Card className="relative p-6 md:p-12">
        <div className="relative z-10 max-w-2xl">
          {hero.badge && (
            <span className="mb-4 inline-flex max-w-full rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground break-words">
              {hero.badge}
            </span>
          )}
          <h1 className="text-2xl md:text-4xl font-semibold tracking-tight text-foreground mb-4 leading-tight break-words">
            {/* Two-tone title: the highlight (and what follows it) reads in
                full foreground, the lead-in steps back. */}
            {hero.titleLead && (
              <span className={hero.titleHighlight ? "text-muted-foreground" : undefined}>
                {hero.titleLead}
              </span>
            )}
            {hero.titleLead && (hero.titleHighlight || hero.titleTail) && <br />}
            {hero.titleHighlight && <span>{hero.titleHighlight}</span>}
            {hero.titleTail && ` ${hero.titleTail}`}
          </h1>
          {hero.subtitle && (
            <p className="text-muted-foreground text-base md:text-lg leading-relaxed">
              {hero.subtitle}
            </p>
          )}
        </div>
      </Card>

      {/* ── Bento grid: TOC + sections ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* TOC */}
        <div className="md:col-span-3 space-y-4">
          <Card className="p-6 sticky top-24">
            <h3 className="text-sm font-medium text-foreground mb-4">
              Contents
            </h3>
            <nav className="space-y-3">
              {sections.map((s, i) => {
                const { lead, label } = parseNum(s.num);
                const displayLead = lead || String(i + 1).padStart(2, "0");
                const displayLabel = label || s.title || "Untitled section";
                return (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="flex items-center gap-3 text-muted-foreground hover:text-foreground transition-colors text-sm group"
                  >
                    <span className="text-[11px] font-medium tabular-nums text-muted-foreground/70 group-hover:text-foreground w-4 text-right shrink-0">
                      {displayLead}
                    </span>
                    <span className="min-w-0 break-words">{displayLabel}</span>
                  </a>
                );
              })}
            </nav>
            {showPdf && (
              <div className="mt-6 pt-6 border-t">
                <a
                  href={cta.pdfUrl}
                  download
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full")}
                >
                  <Download />
                  Download PDF version
                </a>
              </div>
            )}
          </Card>
        </div>

        {/* Sections */}
        <div className="md:col-span-9 space-y-6">
          {sections.map((section) => (
            <Section key={section.id} section={section} />
          ))}

          {/* ── CTA ── */}
          {cta.enabled && (
            <Card className="p-6 md:p-12 text-center relative">
              <div className="relative z-10">
                {cta.title && (
                  <h3 className="text-2xl font-semibold tracking-tight text-foreground mb-3">{cta.title}</h3>
                )}
                {cta.body && (
                  <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                    {cta.body}
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-3">
                  {showCtaButton && (
                    <a
                      href={ctaHref || "#"}
                      className={buttonVariants({ size: "lg" })}
                    >
                      {cta.buttonLabel}
                    </a>
                  )}
                  {showPdf && (
                    <a
                      href={cta.pdfUrl}
                      download
                      className={buttonVariants({ variant: "outline", size: "lg" })}
                    >
                      <Download />
                      Download PDF
                    </a>
                  )}
                </div>
              </div>
              <svg
                className="absolute inset-0 w-full h-full text-foreground opacity-[0.06] pointer-events-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern
                    id="wk-dot-pattern"
                    x="0"
                    y="0"
                    width="10"
                    height="10"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="5" cy="5" r="1" fill="currentColor" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#wk-dot-pattern)" />
              </svg>
            </Card>
          )}

          {/* ── Footer ── */}
          <div className="mt-10 pt-8 border-t text-center">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Agency Collective. Confidential Client
              Resource.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
