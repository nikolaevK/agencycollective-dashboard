"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { badgeTone, badgeVariants } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { resolveIcon } from "@/components/welcome-kit/icons";
import type { SopDoc, SopSection, SopBlock } from "@/lib/sop";
import type { WkVariant } from "@/lib/welcomeKit";

// Also the /sop-print page's content: every surface here is a token (the print
// page drops the `dark` class, so the PDF is always the light paper look), soft
// shadows are dropped on paper, and small blocks avoid splitting across pages.

/* ------------------------------------------------------------------ */
/*  Markdown — sanitized by default (no raw HTML)                      */
/* ------------------------------------------------------------------ */

const LINK_CLS = "font-medium text-foreground underline underline-offset-4 hover:text-foreground/80 [overflow-wrap:anywhere]";

const MD_COMPONENTS = {
  p: (p: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed mb-2 last:mb-0">{p.children}</p>
  ),
  strong: (p: { children?: React.ReactNode }) => <strong className="font-semibold">{p.children}</strong>,
  em: (p: { children?: React.ReactNode }) => <em className="italic">{p.children}</em>,
  ul: (p: { children?: React.ReactNode }) => (
    <ul className="list-disc ml-5 space-y-1.5 mb-2 last:mb-0">{p.children}</ul>
  ),
  ol: (p: { children?: React.ReactNode }) => (
    <ol className="list-decimal ml-5 space-y-1.5 mb-2 last:mb-0">{p.children}</ol>
  ),
  li: (p: { children?: React.ReactNode }) => <li className="text-sm">{p.children}</li>,
  a: (p: { children?: React.ReactNode; href?: string }) => (
    <a href={p.href} target="_blank" rel="noopener noreferrer" className={LINK_CLS}>
      {p.children}
    </a>
  ),
  h3: (p: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-foreground mt-2 mb-1 break-words">{p.children}</h3>
  ),
  h4: (p: { children?: React.ReactNode }) => (
    <h4 className="text-sm font-semibold text-foreground mt-2 mb-1 break-words">{p.children}</h4>
  ),
  // Block code (```fenced```) carries a language-* className; render it as a
  // wrapping pre so it can never force horizontal overflow. Inline code keeps
  // the pill style.
  code: (p: { className?: string; children?: React.ReactNode }) =>
    typeof p.className === "string" && p.className.startsWith("language-") ? (
      <code className="font-mono text-xs">{p.children}</code>
    ) : (
      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground [overflow-wrap:anywhere]">{p.children}</code>
    ),
  pre: (p: { children?: React.ReactNode }) => (
    <pre className="my-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-muted/50 p-3 text-xs font-mono leading-relaxed text-foreground">
      {p.children}
    </pre>
  ),
  blockquote: (p: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 pl-3 italic my-2">{p.children}</blockquote>
  ),
  table: (p: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto rounded-2xl border">
      <table className="w-full border-collapse text-sm [&_tr:last-child>td]:border-b-0">{p.children}</table>
    </div>
  ),
  thead: (p: { children?: React.ReactNode }) => <thead className="bg-muted/40">{p.children}</thead>,
  th: (p: { children?: React.ReactNode }) => (
    <th className="border-b px-3 py-1.5 text-left text-xs font-medium text-foreground break-words">{p.children}</th>
  ),
  td: (p: { children?: React.ReactNode }) => (
    <td className="border-b px-3 py-1.5 align-top break-words">{p.children}</td>
  ),
  hr: () => <hr className="my-3 border-border" />,
  // Never load an image URL from SOP content (imported / hand-edited markdown
  // could carry a tracking or exfiltration URL) — its alt text stays as text.
  img: ({ alt }: { alt?: string }) => (alt ? <span>{alt}</span> : null),
};

function MD({ children, className }: { children: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{children}</ReactMarkdown>
    </div>
  );
}

// Inline markdown (bold/italic/links/code) for short single-string fields like
// step text and checklist items — no block <p> wrapper or margins.
const MD_INLINE_COMPONENTS = {
  p: (p: { children?: React.ReactNode }) => <>{p.children}</>,
  strong: (p: { children?: React.ReactNode }) => <strong className="font-semibold">{p.children}</strong>,
  em: (p: { children?: React.ReactNode }) => <em className="italic">{p.children}</em>,
  del: (p: { children?: React.ReactNode }) => <del className="opacity-70">{p.children}</del>,
  a: (p: { children?: React.ReactNode; href?: string }) => (
    <a href={p.href} target="_blank" rel="noopener noreferrer" className={LINK_CLS}>
      {p.children}
    </a>
  ),
  code: (p: { children?: React.ReactNode }) => (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{p.children}</code>
  ),
  img: ({ alt }: { alt?: string }) => (alt ? <span>{alt}</span> : null),
};

/** Render a short string with inline markdown only (bold/italic/links/code). */
function MDLine({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_INLINE_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}

/* ------------------------------------------------------------------ */
/*  Style maps (shared with the Welcome Kit look)                      */
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

/** Section headings inside a block (checklist / steps / rows titles). */
const BLOCK_TITLE = "text-sm font-medium text-foreground mb-3";

/** Kit card on screen; on paper a hairline outline without the soft shadow. */
const PAPER = "print:shadow-none";
const KEEP = "print:break-inside-avoid";

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
/*  Block renderer                                                     */
/* ------------------------------------------------------------------ */

function Block({ block }: { block: SopBlock }) {
  switch (block.type) {
    case "text":
      return block.body.trim() ? (
        <MD className="text-muted-foreground break-words [&_strong]:text-foreground">{block.body}</MD>
      ) : null;

    case "callout": {
      const Icon = block.icon ? resolveIcon(block.icon) : null;
      const neutral = block.variant === "neutral";
      return (
        <div className={cn("p-4 rounded-2xl border flex items-start gap-3", VARIANT_STYLES[block.variant], KEEP)}>
          {Icon && <Icon className="size-4 shrink-0 mt-0.5" />}
          <div className={cn("min-w-0", neutral ? "text-muted-foreground" : "text-foreground")}>
            {block.title && <p className="text-sm font-semibold text-foreground mb-0.5">{block.title}</p>}
            {block.body && <MD className="text-sm">{block.body}</MD>}
          </div>
        </div>
      );
    }

    case "stat":
      return (
        <div className={cn("rounded-2xl bg-muted/50 p-6 text-center flex flex-col items-center justify-center ring-1 ring-foreground/5 dark:ring-foreground/10 sm:max-w-xs", KEEP)}>
          <p className="text-5xl font-semibold tracking-tight tabular-nums leading-none text-foreground mb-2 break-words max-w-full">{block.value}</p>
          <p className="text-sm font-medium text-foreground break-words max-w-full">{block.label}</p>
          {block.caption && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{block.caption}</p>}
        </div>
      );

    case "checklist": {
      const Marker = resolveIcon("checkCircle");
      return (
        <div>
          {block.title && <h4 className={BLOCK_TITLE}>{block.title}</h4>}
          <ul className="space-y-2.5">
            {block.items.map((item, i) => (
              <li key={i} className={cn("flex items-start gap-3 text-sm text-foreground", KEEP)}>
                {block.marker === "dot" ? (
                  <span className="size-1.5 rounded-full bg-muted-foreground/60 shrink-0 mt-2" />
                ) : (
                  <Marker className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <span className="min-w-0 break-words"><MDLine>{item}</MDLine></span>
              </li>
            ))}
          </ul>
          {block.note && <p className="text-xs text-muted-foreground mt-4">{block.note}</p>}
        </div>
      );
    }

    case "steps":
      return (
        <div>
          {block.title && <h4 className={BLOCK_TITLE}>{block.title}</h4>}
          <ol className="space-y-3">
            {block.steps.map((step, i) => (
              <li key={step.id} className={cn("flex items-start gap-3", KEEP)}>
                <span
                  className={
                    block.ordered
                      ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium tabular-nums text-primary-foreground mt-0.5"
                      : "size-1.5 rounded-full bg-muted-foreground/60 shrink-0 mt-2"
                  }
                >
                  {block.ordered ? i + 1 : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground break-words"><MDLine>{step.text}</MDLine></div>
                  {step.detail && (
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words"><MDLine>{step.detail}</MDLine></div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      );

    case "cards": {
      if (block.layout === "list") {
        return (
          <div className={`grid ${GRID_CARDS[block.columns] ?? "grid-cols-1"} gap-x-6 gap-y-6`}>
            {block.items.map((it) => {
              const Icon = resolveIcon(it.icon);
              return (
                <div key={it.id} className={cn("flex items-start gap-4", KEEP)}>
                  <div className={cn(ICON_TILE, "size-10")}>
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h5 className="font-medium text-sm text-foreground mb-1 break-words"><MDLine>{it.label}</MDLine></h5>
                    {it.desc && <div className="text-sm text-muted-foreground leading-relaxed break-words"><MDLine>{it.desc}</MDLine></div>}
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
              <div key={it.id} className={cn("p-5 bg-muted/40 rounded-2xl flex flex-col items-center text-center gap-2 min-w-0", KEEP)}>
                <Icon className="size-5 text-muted-foreground shrink-0" />
                <div className="text-sm font-medium text-foreground break-words max-w-full"><MDLine>{it.label}</MDLine></div>
                {it.desc && <div className="text-xs text-muted-foreground break-words max-w-full"><MDLine>{it.desc}</MDLine></div>}
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
              <div key={col.id} className={cn("p-5 md:p-6 bg-muted/40 rounded-2xl min-w-0", KEEP)}>
                <div className="flex items-center gap-3 mb-2 min-w-0">
                  <Icon className="size-4 text-muted-foreground shrink-0" />
                  <h4 className="font-medium text-foreground min-w-0 break-words"><MDLine>{col.title}</MDLine></h4>
                </div>
                {col.badge && (
                  <span className={cn(badgeVariants({ variant: "outline" }), "mb-3 h-auto max-w-full whitespace-normal break-words bg-background dark:bg-transparent")}>
                    {col.badge}
                  </span>
                )}
                {col.body && <div className="text-sm text-muted-foreground mb-4 leading-relaxed"><MDLine>{col.body}</MDLine></div>}
                {col.bullets.length > 0 && (
                  <ul className="space-y-1.5 text-sm text-foreground">
                    {col.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="size-1 rounded-full bg-muted-foreground/60 shrink-0 mt-2" />
                        <span className="min-w-0 break-words"><MDLine>{b}</MDLine></span>
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
          {block.title && <h4 className={BLOCK_TITLE}>{block.title}</h4>}
          <div className="space-y-2">
            {block.rows.map((row) => (
              <div key={row.id} className={cn("flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 rounded-2xl", KEEP)}>
                <span className="text-sm font-medium text-foreground min-w-0 break-words"><MDLine>{row.label}</MDLine></span>
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

function Section({ section, index }: { section: SopSection; index: number }) {
  const Icon = resolveIcon(section.icon);
  const eyebrow = section.num || `${String(index + 1).padStart(2, "0")} / Section`;
  return (
    <Card className={cn("p-5 md:p-8 min-w-0", PAPER)}>
      <section>
        <div className="flex items-center gap-4 mb-6 md:mb-8 print:break-after-avoid">
          <div className={cn(ICON_TILE, "size-11")}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground break-words">{eyebrow}</p>
            <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground break-words">
              {section.title || "Untitled section"}
            </h3>
          </div>
        </div>
        <div className="space-y-6">
          {section.blocks.map((block) => (
            <Block key={block.id} block={block} />
          ))}
          {section.blocks.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No content yet.</p>
          )}
        </div>
      </section>
    </Card>
  );
}

export function SopRenderer({ doc }: { doc: SopDoc }) {
  return (
    // The clip box is inset (-m-1 p-1) so it never shaves the cards' ring + shadow.
    <div className="-m-1 space-y-6 max-w-[calc(100%+0.5rem)] min-w-0 overflow-x-hidden p-1">
      {/* Header */}
      <Card className={cn("p-6 md:p-10", PAPER, KEEP)}>
        <span className="mb-4 inline-flex max-w-full rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Standard Operating Procedure
        </span>
        <h1 className="text-2xl md:text-4xl font-semibold tracking-tight text-foreground mb-3 leading-tight break-words">
          {doc.title || "Untitled SOP"}
        </h1>
        {doc.summary && <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-2xl">{doc.summary}</p>}
      </Card>

      {/* Sections */}
      <div className="space-y-6">
        {doc.sections.map((section, i) => (
          <Section key={section.id} section={section} index={i} />
        ))}
        {doc.sections.length === 0 && (
          <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            This SOP has no sections yet.
          </div>
        )}
      </div>

      <div className="pt-4 text-center">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Agency Collective · Internal SOP
        </p>
      </div>
    </div>
  );
}
