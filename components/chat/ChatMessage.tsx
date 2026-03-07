"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";

/** react-markdown v10 removed `ordered`/`index` from LiHTMLAttributes — use context instead */
const ListTypeContext = React.createContext<"ul" | "ol">("ul");

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export function ChatMessage({ role, content, isStreaming }: ChatMessageProps) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[72%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground leading-relaxed">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-start">
      {/* Avatar */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <ReactMarkdown
          components={{
            // ── Headings ───────────────────────────────────────────────────
            h1: ({ children }) => (
              <h1 className="text-base font-bold text-foreground mt-1 mb-3">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-1.5 mt-6 mb-3 first:mt-0">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">
                {children}
              </h3>
            ),

            // ── Body text ──────────────────────────────────────────────────
            p: ({ children }) => (
              <p className="text-sm leading-relaxed text-foreground/85 mb-3 last:mb-0">
                {children}
              </p>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-foreground">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="italic text-foreground/75">{children}</em>
            ),

            // ── Lists ──────────────────────────────────────────────────────
            ul: ({ children }) => (
              <ListTypeContext.Provider value="ul">
                <ul className="mb-3 space-y-1.5 list-none ml-0">{children}</ul>
              </ListTypeContext.Provider>
            ),
            ol: ({ children }) => (
              <ListTypeContext.Provider value="ol">
                <ol className="mb-4 space-y-2 list-none ml-0 [counter-reset:li-num]">{children}</ol>
              </ListTypeContext.Provider>
            ),
            li: ({ children }) => {
              // eslint-disable-next-line react-hooks/rules-of-hooks
              const listType = React.useContext(ListTypeContext);
              if (listType === "ol") {
                return (
                  <li className="flex items-start gap-3 [counter-increment:li-num] before:flex before:h-5 before:w-5 before:shrink-0 before:items-center before:justify-center before:rounded-full before:bg-primary/15 before:text-[10px] before:font-bold before:text-primary before:mt-0.5 before:[content:counter(li-num)]">
                    <span className="flex-1 text-sm text-foreground/85 leading-relaxed pt-0.5">
                      {children}
                    </span>
                  </li>
                );
              }
              return (
                <li className="flex items-start gap-2.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60 mt-[7px]" />
                  <span className="flex-1 text-sm text-foreground/85 leading-relaxed">
                    {children}
                  </span>
                </li>
              );
            },

            // ── Tables ─────────────────────────────────────────────────────
            table: ({ children }) => (
              <div className="overflow-x-auto my-4 rounded-xl border border-border">
                <table className="w-full border-collapse text-xs">{children}</table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-muted/60">{children}</thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-border/50">{children}</tbody>
            ),
            tr: ({ children }) => (
              <tr className="even:bg-muted/20 hover:bg-muted/30 transition-colors">
                {children}
              </tr>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 text-xs text-foreground/80 whitespace-nowrap">
                {children}
              </td>
            ),

            // ── Blockquote (callout / insight) ─────────────────────────────
            blockquote: ({ children }) => (
              <blockquote className="flex gap-3 rounded-r-xl border-l-2 border-primary/50 bg-primary/5 px-4 py-3 my-3">
                <div className="text-sm text-foreground/80 leading-relaxed [&>p]:mb-0">
                  {children}
                </div>
              </blockquote>
            ),

            // ── Code ───────────────────────────────────────────────────────
            code: ({ className, children, ...props }) => {
              const isBlock = className?.startsWith("language-");
              return isBlock ? (
                <pre className="rounded-xl bg-muted/70 p-4 overflow-x-auto my-3 border border-border/50">
                  <code
                    className={cn("font-mono text-xs text-foreground", className)}
                    {...props}
                  >
                    {children}
                  </code>
                </pre>
              ) : (
                <code
                  className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground border border-border/40"
                  {...props}
                >
                  {children}
                </code>
              );
            },

            // ── Horizontal rule ────────────────────────────────────────────
            hr: () => <hr className="my-4 border-border/50" />,
          }}
        >
          {content}
        </ReactMarkdown>

        {isStreaming && (
          <span className="inline-block h-4 w-0.5 bg-primary animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>
    </div>
  );
}
