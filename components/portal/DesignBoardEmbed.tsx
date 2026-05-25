import { ExternalLink } from "lucide-react";
import { toFigmaEmbedUrl } from "@/lib/figma";

/**
 * Renders an admin-supplied Figma board as an embedded canvas inside the client
 * portal. Presentational only — the page resolves the url + gating; this builds
 * the iframe `src` from the raw stored link. Requires figma.com domains in the
 * CSP `frame-src` (see next.config.js).
 */
export function DesignBoardEmbed({ url }: { url: string }) {
  const embedUrl = toFigmaEmbedUrl(url);

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
          <span className="hidden sm:inline">Open in Figma</span>
        </a>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-muted/20">
        <iframe
          title="Figma design board"
          src={embedUrl}
          className="w-full h-[72vh] min-h-[480px] border-0"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </div>
  );
}
