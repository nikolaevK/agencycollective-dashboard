"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolveIcon } from "@/components/welcome-kit/icons";
import type { SopDoc, SopSection, SopBlock } from "@/lib/sop";
import type { WkVariant } from "@/lib/welcomeKit";

/* ------------------------------------------------------------------ */
/*  Markdown — sanitized by default (no raw HTML)                      */
/* ------------------------------------------------------------------ */

const MD_COMPONENTS = {
  p: (p: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed mb-2 last:mb-0">{p.children}</p>
  ),
  strong: (p: { children?: React.ReactNode }) => <strong className="font-bold">{p.children}</strong>,
  em: (p: { children?: React.ReactNode }) => <em className="italic">{p.children}</em>,
  ul: (p: { children?: React.ReactNode }) => (
    <ul className="list-disc ml-5 space-y-1.5 mb-2 last:mb-0">{p.children}</ul>
  ),
  ol: (p: { children?: React.ReactNode }) => (
    <ol className="list-decimal ml-5 space-y-1.5 mb-2 last:mb-0">{p.children}</ol>
  ),
  li: (p: { children?: React.ReactNode }) => <li className="text-sm">{p.children}</li>,
  a: (p: { children?: React.ReactNode; href?: string }) => (
    <a href={p.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium break-all">
      {p.children}
    </a>
  ),
  h3: (p: { children?: React.ReactNode }) => <h3 className="text-sm font-bold mt-2 mb-1 break-words">{p.children}</h3>,
  h4: (p: { children?: React.ReactNode }) => <h4 className="text-sm font-bold mt-2 mb-1 break-words">{p.children}</h4>,
  // Block code (```fenced```) carries a language-* className; render it as a
  // wrapping pre so it can never force horizontal overflow. Inline code keeps
  // the pill style.
  code: (p: { className?: string; children?: React.ReactNode }) =>
    typeof p.className === "string" && p.className.startsWith("language-") ? (
      <code className="font-mono text-xs">{p.children}</code>
    ) : (
      <code className="px-1 py-0.5 rounded bg-portal-surface-container text-xs font-mono break-all">{p.children}</code>
    ),
  pre: (p: { children?: React.ReactNode }) => (
    <pre className="my-2 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-portal-surface-container p-3 text-xs font-mono leading-relaxed">
      {p.children}
    </pre>
  ),
  blockquote: (p: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 italic my-2">{p.children}</blockquote>
  ),
  table: (p: { children?: React.ReactNode }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{p.children}</table>
    </div>
  ),
  thead: (p: { children?: React.ReactNode }) => <thead className="bg-portal-surface-low">{p.children}</thead>,
  th: (p: { children?: React.ReactNode }) => (
    <th className="border border-portal-surface-container px-3 py-1.5 text-left text-xs font-bold break-words">{p.children}</th>
  ),
  td: (p: { children?: React.ReactNode }) => (
    <td className="border border-portal-surface-container px-3 py-1.5 align-top break-words">{p.children}</td>
  ),
  hr: () => <hr className="my-3 border-portal-surface-container" />,
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
  strong: (p: { children?: React.ReactNode }) => <strong className="font-bold">{p.children}</strong>,
  em: (p: { children?: React.ReactNode }) => <em className="italic">{p.children}</em>,
  del: (p: { children?: React.ReactNode }) => <del className="opacity-70">{p.children}</del>,
  a: (p: { children?: React.ReactNode; href?: string }) => (
    <a href={p.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium break-all">
      {p.children}
    </a>
  ),
  code: (p: { children?: React.ReactNode }) => (
    <code className="px-1 py-0.5 rounded bg-portal-surface-container text-xs font-mono">{p.children}</code>
  ),
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

const VARIANT_STYLES: Record<WkVariant, { box: string; icon: string; text: string }> = {
  info: { box: "bg-primary/5 border border-primary/10", icon: "text-primary", text: "text-portal-on-surface" },
  success: { box: "bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/20", icon: "text-emerald-600", text: "text-portal-on-surface" },
  warning: { box: "bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/20", icon: "text-amber-600", text: "text-portal-on-surface" },
  danger: { box: "bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/20", icon: "text-red-600", text: "text-portal-on-surface" },
  neutral: { box: "bg-portal-surface-low border border-transparent", icon: "text-portal-secondary-dim", text: "text-portal-secondary-text" },
};

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
      return block.body.trim() ? <MD className="text-portal-secondary-text break-words">{block.body}</MD> : null;

    case "callout": {
      const s = VARIANT_STYLES[block.variant];
      const Icon = block.icon ? resolveIcon(block.icon) : null;
      return (
        <div className={`p-4 rounded-lg flex items-start gap-3 ${s.box}`}>
          {Icon && <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.icon}`} />}
          <div className={`min-w-0 ${s.text}`}>
            {block.title && <p className="text-sm font-bold mb-0.5">{block.title}</p>}
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
          {block.caption && <p className="text-xs opacity-70 mt-2 leading-relaxed">{block.caption}</p>}
        </div>
      );

    case "checklist": {
      const Marker = resolveIcon("checkCircle");
      return (
        <div>
          {block.title && (
            <h4 className="text-xs font-bold text-portal-secondary-dim uppercase tracking-widest mb-4">{block.title}</h4>
          )}
          <ul className="space-y-2.5">
            {block.items.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-portal-on-surface">
                {block.marker === "dot" ? (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                ) : (
                  <Marker className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                )}
                <span className="min-w-0 break-words"><MDLine>{item}</MDLine></span>
              </li>
            ))}
          </ul>
          {block.note && <p className="text-xs text-portal-secondary-text mt-4">{block.note}</p>}
        </div>
      );
    }

    case "steps":
      return (
        <div>
          {block.title && (
            <h4 className="text-xs font-bold text-portal-secondary-dim uppercase tracking-widest mb-4">{block.title}</h4>
          )}
          <ol className="space-y-3">
            {block.steps.map((step, i) => (
              <li key={step.id} className="flex items-start gap-3">
                <span
                  className={
                    block.ordered
                      ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white mt-0.5"
                      : "w-2 h-2 rounded-full bg-primary shrink-0 mt-2"
                  }
                >
                  {block.ordered ? i + 1 : ""}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-portal-on-surface break-words"><MDLine>{step.text}</MDLine></div>
                  {step.detail && (
                    <div className="text-xs text-portal-secondary-text mt-0.5 leading-relaxed break-words"><MDLine>{step.detail}</MDLine></div>
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
                <div key={it.id} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h5 className="font-bold text-sm text-portal-on-surface mb-1 break-words"><MDLine>{it.label}</MDLine></h5>
                    {it.desc && <div className="text-sm text-portal-secondary-text leading-relaxed break-words"><MDLine>{it.desc}</MDLine></div>}
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
              <div key={it.id} className="p-5 bg-portal-surface-low rounded-xl flex flex-col items-center text-center gap-2 min-w-0">
                <Icon className="w-6 h-6 text-primary shrink-0" />
                <div className="text-sm font-bold text-portal-on-surface break-words max-w-full"><MDLine>{it.label}</MDLine></div>
                {it.desc && <div className="text-xs text-portal-secondary-text break-words max-w-full"><MDLine>{it.desc}</MDLine></div>}
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
                  <h4 className="font-bold min-w-0 break-words"><MDLine>{col.title}</MDLine></h4>
                </div>
                {col.badge && (
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-3">{col.badge}</p>
                )}
                {col.body && <div className="text-sm text-portal-secondary-text mb-4 leading-relaxed"><MDLine>{col.body}</MDLine></div>}
                {col.bullets.length > 0 && (
                  <ul className="space-y-1.5 text-sm text-portal-on-surface">
                    {col.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-primary shrink-0 mt-2" />
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
          {block.title && (
            <h4 className="text-xs font-bold text-portal-secondary-dim uppercase tracking-widest mb-4">{block.title}</h4>
          )}
          <div className="space-y-2">
            {block.rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 p-3 bg-portal-surface-low rounded-lg">
                <span className="text-sm font-medium text-portal-on-surface min-w-0 break-words"><MDLine>{row.label}</MDLine></span>
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

function Section({ section, index }: { section: SopSection; index: number }) {
  const Icon = resolveIcon(section.icon);
  const eyebrow = section.num || `${String(index + 1).padStart(2, "0")} / Section`;
  return (
    <section className="bg-portal-surface-lowest rounded-xl p-5 md:p-8 shadow-sm overflow-hidden min-w-0">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-lg text-primary shrink-0">
          <Icon className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-portal-outline-variant uppercase tracking-widest break-words">
            {eyebrow}
          </p>
          <h3 className="text-2xl font-bold break-words">{section.title || "Untitled section"}</h3>
        </div>
      </div>
      <div className="space-y-6">
        {section.blocks.map((block) => (
          <Block key={block.id} block={block} />
        ))}
        {section.blocks.length === 0 && (
          <p className="text-sm text-portal-secondary-text italic">No content yet.</p>
        )}
      </div>
    </section>
  );
}

export function SopRenderer({ doc }: { doc: SopDoc }) {
  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl bg-primary/5 p-6 md:p-10 border border-primary/5">
        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-4">
          Standard Operating Procedure
        </span>
        <h1 className="text-2xl md:text-4xl font-extrabold text-portal-on-surface mb-3 leading-tight break-words">
          {doc.title || "Untitled SOP"}
        </h1>
        {doc.summary && <p className="text-portal-secondary-text text-lg leading-relaxed max-w-2xl">{doc.summary}</p>}
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {doc.sections.map((section, i) => (
          <Section key={section.id} section={section} index={i} />
        ))}
        {doc.sections.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            This SOP has no sections yet.
          </div>
        )}
      </div>

      <div className="pt-4 text-center">
        <p className="text-xs text-portal-secondary-text">
          &copy; {new Date().getFullYear()} Agency Collective · Internal SOP
        </p>
      </div>
    </div>
  );
}
