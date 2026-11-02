"use client";

import { useState } from "react";
import { ExternalLink, Hand } from "lucide-react";
import { toFigmaEmbedUrl } from "@/lib/figma";
import { Button } from "@/components/ui/button";

/**
 * Renders an admin-supplied Figma board as an embedded canvas inside the client
 * portal. Presentational only — the page resolves the url + gating; this builds
 * the iframe `src` from the raw stored link. Requires figma.com domains in the
 * CSP `frame-src` (see next.config.js).
 *
 * On phones the iframe is a scroll trap (it captures every touch), so below md
 * it starts inert behind a tap-to-interact overlay and at a shorter height.
 */
export function DesignBoardEmbed({ url }: { url: string }) {
  const embedUrl = toFigmaEmbedUrl(url);
  const [interactive, setInteractive] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Design Board</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your latest designs and creative, live from Figma.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink />
            <span>Open in Figma</span>
          </a>
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-[min(calc(var(--radius)*2.6),24px)] bg-muted/20 shadow ring-1 ring-foreground/5 dark:ring-foreground/10">
        <iframe
          title="Figma design board"
          src={embedUrl}
          className={
            interactive
              ? "w-full h-[50vh] md:h-[72vh] md:min-h-[480px] border-0"
              : "w-full h-[50vh] md:h-[72vh] md:min-h-[480px] border-0 pointer-events-none md:pointer-events-auto"
          }
          allowFullScreen
          loading="lazy"
        />
        {!interactive && (
          <button
            type="button"
            onClick={() => setInteractive(true)}
            className="md:hidden absolute inset-0 flex items-end justify-center bg-transparent pb-4"
            aria-label="Tap to interact with the board"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3.5 py-2 text-xs font-medium text-foreground shadow-lg ring-1 ring-foreground/10 backdrop-blur">
              <Hand className="size-3.5" />
              Tap to interact
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
