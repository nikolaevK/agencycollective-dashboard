/**
 * Image stripping for copied / exported chat text, loaded lazily: the
 * markdown parser (lib/docChat/stripImages) stays out of the Media Buyers /
 * SOP page chunk and loads with the chat's markdown renderer
 * (preloadDocChatMarkdown).
 *
 * Reply text and pasted messages are never stripped on the way in, and the
 * tool inputs are stripped server-side one string at a time — so Copy and
 * Export run the whole output through it once more (an image definition in
 * one SOP block can complete an image in another once they're joined).
 */

type Strip = (markdown: string) => string;

let strip: Strip | null = null;
let loading: Promise<Strip> | null = null;

/** Start (or join) loading the stripper. */
export function loadImageStripper(): Promise<Strip> {
  loading ??= import("./stripImages").then(
    (m) => (strip = m.stripMarkdownImages),
    (err: unknown) => {
      loading = null; // a failed chunk load can be retried on the next copy
      throw err;
    }
  );
  return loading;
}

/**
 * `markdown` without images. A plain string once the stripper has loaded —
 * so a Copy click still writes the clipboard inside the click (some browsers
 * refuse clipboard writes that happen after an await) — else a promise.
 */
export function withoutImages(markdown: string): string | Promise<string> {
  if (strip) return strip(markdown);
  return loadImageStripper().then((f) => f(markdown));
}
