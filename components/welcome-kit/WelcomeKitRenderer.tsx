"use client";

import ReactMarkdown from "react-markdown";
import { Download } from "lucide-react";
import { resolveIcon } from "./icons";
import type {
  WelcomeKitDoc,
  WkSection,
  WkBlock,
  WkVariant,
} from "@/lib/welcomeKit";

/* ------------------------------------------------------------------ */
/*  Markdown — portal-styled, sanitized by default (no raw HTML)        */
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
      className="text-primary hover:underline font-medium"
    >
      {p.children}
    </a>
  ),
  h3: (p: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-bold mt-2 mb-1">{p.children}</h3>
  ),
  h4: (p: { children?: React.ReactNode }) => (
    <h4 className="text-sm font-bold mt-2 mb-1">{p.children}</h4>
  ),
  code: (p: { children?: React.ReactNode }) => (
    <code className="px-1 py-0.5 rounded bg-portal-surface-container text-xs font-mono">
      {p.children}
    </code>
  ),
  // pre + table need explicit overflow wrappers — browser defaults
  // (white-space: pre, no scroll container) overflow the section card
  // horizontally on phones.
  pre: (p: { children?: React.ReactNode }) => (
    <pre className="overflow-x-auto rounded-lg bg-portal-surface-container p-3 text-xs font-mono my-2 [&_code]:bg-transparent [&_code]:p-0">
      {p.children}
    </pre>
  ),
  table: (p: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-2 rounded-lg border border-border/50">
      <table className="w-full border-collapse text-xs">{p.children}</table>
    </div>
  ),
  th: (p: { children?: React.ReactNode }) => (
    <th className="px-2.5 py-1.5 text-left font-semibold border-b border-border/50">
      {p.children}
    </th>
  ),
  td: (p: { children?: React.ReactNode }) => (
    <td className="px-2.5 py-1.5 border-b border-border/30 last:border-b-0">{p.children}</td>
  ),
  blockquote: (p: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 italic my-2">
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

const VARIANT_STYLES: Record<WkVariant, { box: string; icon: string; text: string }> = {
  info: {
    box: "bg-primary/5 border border-primary/10",
    icon: "text-primary",
    text: "text-portal-on-surface",
  },
  success: {
    box: "bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/20",
    icon: "text-emerald-600",
    text: "text-portal-on-surface",
  },
  warning: {
    box: "bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/20",
    icon: "text-amber-600",
    text: "text-portal-on-surface",
  },
  danger: {
    box: "bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/20",
    icon: "text-red-600",
    text: "text-portal-on-surface",
  },
  neutral: {
    box: "bg-portal-surface-low border border-transparent",
    icon: "text-portal-secondary-dim",
    text: "text-portal-secondary-text",
  },
};

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
/*  Section wrapper (matches the original portal design)               */
/* ------------------------------------------------------------------ */

function Section({ section }: { section: WkSection }) {
  const Icon = resolveIcon(section.icon);
  return (
    <section
      id={section.id}
      className="bg-portal-surface-lowest rounded-xl p-5 md:p-8 shadow-sm scroll-mt-24"
    >
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-primary shrink-0">
          <Icon className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          {section.num && (
            <p className="text-[10px] font-bold text-portal-outline-variant uppercase tracking-widest break-words">
              {section.num}
            </p>
          )}
          <h3 className="text-2xl font-bold break-words">{section.title}</h3>
        </div>
      </div>
      <div className="space-y-6">
        {section.blocks.map((block) => (
          <Block key={block.id} block={block} />
        ))}
      </div>
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
        <MD className="text-portal-secondary-text break-words">{block.body}</MD>
      ) : null;

    case "callout": {
      const s = VARIANT_STYLES[block.variant];
      const Icon = block.icon ? resolveIcon(block.icon) : null;
      return (
        <div className={`p-4 rounded-lg flex items-start gap-3 ${s.box}`}>
          {Icon && <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.icon}`} />}
          <div className={`min-w-0 ${s.text}`}>
            {block.title && (
              <p className="text-sm font-bold mb-0.5">{block.title}</p>
            )}
            {block.body && <MD className="text-sm">{block.body}</MD>}
          </div>
        </div>
      );
    }

    case "stat":
      return (
        <div className="bg-primary p-6 rounded-xl text-white text-center flex flex-col items-center justify-center sm:max-w-xs">
          <p className="text-5xl font-black leading-none mb-1 break-words max-w-full">{block.value}</p>
          <p className="text-sm font-bold break-words max-w-full">{block.label}</p>
          {block.caption && (
            <p className="text-xs opacity-70 mt-2 leading-relaxed">{block.caption}</p>
          )}
        </div>
      );

    case "checklist": {
      const Marker = resolveIcon("checkCircle");
      return (
        <div>
          {block.title && (
            <h4 className="text-xs font-bold text-portal-secondary-dim uppercase tracking-widest mb-4">
              {block.title}
            </h4>
          )}
          <ul className="space-y-2.5">
            {block.items.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm text-portal-on-surface"
              >
                {block.marker === "dot" ? (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                ) : (
                  <Marker className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                )}
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {block.note && (
            <p className="text-xs text-portal-secondary-text mt-4">{block.note}</p>
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
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h5 className="font-bold text-sm text-portal-on-surface mb-1 break-words">
                      {it.label}
                    </h5>
                    {it.desc && (
                      <p className="text-sm text-portal-secondary-text leading-relaxed break-words">
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
                className="p-5 bg-portal-surface-low rounded-xl flex flex-col items-center text-center gap-2 min-w-0"
              >
                <Icon className="w-6 h-6 text-primary shrink-0" />
                <p className="text-sm font-bold text-portal-on-surface break-words max-w-full">{it.label}</p>
                {it.desc && (
                  <p className="text-xs text-portal-secondary-text break-words max-w-full">{it.desc}</p>
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
              <div key={col.id} className="p-6 bg-portal-surface-low rounded-xl min-w-0">
                <div className="flex items-center gap-3 mb-1 min-w-0">
                  <Icon className="w-5 h-5 text-primary shrink-0" />
                  <h4 className="font-bold min-w-0 break-words">{col.title}</h4>
                </div>
                {col.badge && (
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3">
                    {col.badge}
                  </p>
                )}
                {col.body && (
                  <p className="text-sm text-portal-secondary-text mb-4 leading-relaxed">
                    {col.body}
                  </p>
                )}
                {col.bullets.length > 0 && (
                  <ul className="space-y-1.5 text-sm text-portal-on-surface">
                    {col.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-primary shrink-0 mt-2" />
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
            <h4 className="text-xs font-bold text-portal-secondary-dim uppercase tracking-widest mb-4">
              {block.title}
            </h4>
          )}
          <div className="space-y-2">
            {block.rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 p-3 bg-portal-surface-low rounded-lg"
              >
                <span className="text-sm font-medium text-portal-on-surface min-w-0 break-words">
                  {row.label}
                </span>
                {row.value && (
                  <span className="text-[10px] font-bold text-portal-secondary-dim uppercase tracking-wider shrink-0">
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
      <div className="relative overflow-hidden rounded-xl bg-primary/5 p-6 md:p-12 border border-primary/5 mb-12">
        <div className="relative z-10 max-w-2xl">
          {hero.badge && (
            <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
              {hero.badge}
            </span>
          )}
          <h1 className="text-2xl md:text-4xl font-extrabold text-portal-on-surface mb-4 leading-tight break-words">
            {hero.titleLead}
            {hero.titleLead && (hero.titleHighlight || hero.titleTail) && <br />}
            {hero.titleHighlight && (
              <span className="text-primary">{hero.titleHighlight}</span>
            )}
            {hero.titleTail && ` ${hero.titleTail}`}
          </h1>
          {hero.subtitle && (
            <p className="text-portal-secondary-text text-lg leading-relaxed">
              {hero.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* ── Bento grid: TOC + sections ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* TOC */}
        <div className="md:col-span-3 space-y-4">
          <div className="bg-portal-surface-lowest rounded-xl p-6 shadow-sm sticky top-24">
            <h3 className="text-sm font-bold text-portal-on-surface uppercase tracking-wider mb-6">
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
                    className="flex items-center gap-3 text-portal-secondary-text hover:text-primary transition-colors text-sm group"
                  >
                    <span className="text-[10px] font-bold text-portal-outline-variant group-hover:text-primary w-4 text-right shrink-0">
                      {displayLead}
                    </span>
                    <span className="min-w-0 break-words">{displayLabel}</span>
                  </a>
                );
              })}
            </nav>
            {showPdf && (
              <div className="mt-8 pt-6 border-t border-portal-surface-container">
                <a
                  href={cta.pdfUrl}
                  download
                  className="flex items-center gap-2 text-primary text-xs font-bold hover:underline"
                >
                  <Download className="w-4 h-4" />
                  DOWNLOAD PDF VERSION
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Sections */}
        <div className="md:col-span-9 space-y-8">
          {sections.map((section) => (
            <Section key={section.id} section={section} />
          ))}

          {/* ── CTA ── */}
          {cta.enabled && (
            <div className="bg-primary p-6 md:p-12 rounded-xl text-center relative overflow-hidden">
              <div className="relative z-10">
                {cta.title && (
                  <h3 className="text-2xl font-bold text-white mb-4">{cta.title}</h3>
                )}
                {cta.body && (
                  <p className="text-white/80 font-medium mb-8 max-w-lg mx-auto">
                    {cta.body}
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-4">
                  {showCtaButton && (
                    <a
                      href={ctaHref || "#"}
                      className="px-8 py-3 bg-white text-primary font-bold rounded-full hover:bg-primary/5 transition-colors"
                    >
                      {cta.buttonLabel}
                    </a>
                  )}
                  {showPdf && (
                    <a
                      href={cta.pdfUrl}
                      download
                      className="px-8 py-3 border border-white/30 text-white font-bold rounded-full hover:bg-white/10 transition-colors inline-flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </a>
                  )}
                </div>
              </div>
              <svg
                className="absolute inset-0 w-full h-full opacity-10 pointer-events-none"
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
            </div>
          )}

          {/* ── Footer ── */}
          <div className="mt-16 pt-8 border-t border-portal-surface-container text-center">
            <p className="text-xs text-portal-secondary-text">
              &copy; {new Date().getFullYear()} Agency Collective. Confidential Client
              Resource.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
