"use client";

import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Chat markdown, kit-styled. Loaded lazily by ChatMessage (react-markdown +
 * remark-gfm stay out of the first paint of every chat surface). Safe by
 * default: no raw HTML, and no images — the model's text can echo a
 * prompt-injected page, and an <img> would fetch its URL (with whatever data
 * it put in the query) on render. GFM so a markdown table the model writes
 * anyway renders as a table instead of pipe-text.
 */

type P = { children?: ReactNode };

const components: Components = {
  h1: ({ children }: P) => <h3 className="mb-2 mt-4 text-base font-semibold tracking-tight first:mt-0">{children}</h3>,
  h2: ({ children }: P) => <h4 className="mb-2 mt-5 text-sm font-semibold tracking-tight first:mt-0">{children}</h4>,
  h3: ({ children }: P) => <h5 className="mb-1.5 mt-4 text-sm font-medium first:mt-0">{children}</h5>,
  h4: ({ children }: P) => <h6 className="mb-1 mt-3 text-sm font-medium first:mt-0">{children}</h6>,
  p: ({ children }: P) => <p className="mb-3 text-sm leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }: P) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }: P) => <em className="italic">{children}</em>,
  ul: ({ children }: P) => <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-relaxed marker:text-muted-foreground last:mb-0">{children}</ul>,
  ol: ({ children }: P) => (
    <ol className="mb-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed marker:font-medium marker:text-muted-foreground last:mb-0">
      {children}
    </ol>
  ),
  li: ({ children }: P) => <li className="pl-1">{children}</li>,
  a: ({ children, href }: P & { href?: string }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">
      {children}
    </a>
  ),
  table: ({ children }: P) => (
    <div className="my-3 overflow-x-auto rounded-2xl ring-1 ring-foreground/10">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: P) => <thead className="bg-muted/50">{children}</thead>,
  tr: ({ children }: P) => <tr className="border-b last:border-0">{children}</tr>,
  th: ({ children }: P) => <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">{children}</th>,
  td: ({ children }: P) => <td className="px-3 py-2 align-top">{children}</td>,
  blockquote: ({ children }: P) => (
    <blockquote className="my-3 border-l-2 pl-3 text-sm text-muted-foreground [&>p]:mb-0">{children}</blockquote>
  ),
  code: ({ className, children }: P & { className?: string }) => {
    const isBlock = className?.startsWith("language-");
    return isBlock ? (
      <code className={cn("block font-mono text-xs", className)}>{children}</code>
    ) : (
      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.8em]">{children}</code>
    );
  },
  pre: ({ children }: P) => <pre className="my-3 overflow-x-auto rounded-2xl bg-muted p-3">{children}</pre>,
  hr: () => <hr className="my-4 border-border" />,
  // Never load a model-written image URL — its alt text stays as plain text.
  img: ({ alt }: { alt?: string }) => (alt ? <span>{alt}</span> : null),
};

const REMARK_PLUGINS = [remarkGfm];

/**
 * Repairs a markdown table the model wrote on ONE line (`| A | B | |---|---| | 1 | 2 |`)
 * by breaking rows apart — only on lines that also contain the separator row,
 * so ordinary multi-line tables (and their empty cells) are left alone.
 */
export function fixInlineTables(text: string): string {
  return text
    .split("\n")
    .map((line) => (/\|\s*:?-{3,}/.test(line) && /\|[^|\n]*\|\s*\|\s*:?-{3,}/.test(line) ? line.replace(/\|\s*\|(?=\s*[^|\s])/g, "|\n|") : line))
    .join("\n");
}

/** Memoized by text: while a reply streams only its growing last block re-parses. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="min-w-0 break-words text-foreground/90">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {fixInlineTables(text)}
      </ReactMarkdown>
    </div>
  );
});

export default Markdown;
