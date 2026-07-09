"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

/** Lightweight monospace block + copy button — no highlighter dependency. */
export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — user can select manually.
    }
  }

  return (
    <div className={cn("group relative rounded-lg border border-border bg-muted/30", className)}>
      {language && (
        <span className="absolute left-3 top-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          {language}
        </span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className={cn("overflow-x-auto p-3 text-xs leading-relaxed", language && "pt-7")}>
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
