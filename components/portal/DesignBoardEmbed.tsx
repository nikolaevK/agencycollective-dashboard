"use client";

import { useState } from "react";
import { ExternalLink, Hand } from "lucide-react";
import { toFigmaEmbedUrl } from "@/lib/figma";

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
        <div>
          <h1 className="text-2xl font-bold">Design Board</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your latest designs and creative, live from Figma.
          </p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
        >
          <ExternalLink className="h-4 w-4" />
          <span>Open in Figma</span>
        </a>
      </div>

      <div className="relative rounded-xl border border-border overflow-hidden bg-muted/20">
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 border border-border px-3.5 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur">
              <Hand className="h-3.5 w-3.5" />
              Tap to interact
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
