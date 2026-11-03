"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

/** Lightweight monospace block + copy button — no highlighter dependency.
 *  Tokens only (muted surface, foreground text), so it reads in both themes. */
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
    <div className={cn("min-w-0 overflow-hidden rounded-2xl border bg-muted/50", className)}>
      <div className="flex h-9 items-center justify-between gap-2 border-b pl-4 pr-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {language ?? ""}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={handleCopy}
          title="Copy"
          aria-label={copied ? "Copied" : "Copy code"}
          className="text-muted-foreground"
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-foreground">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}
