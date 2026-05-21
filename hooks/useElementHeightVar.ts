import { useEffect, useLayoutEffect, type RefObject } from "react";

// useLayoutEffect logs a React warning during SSR ("useLayoutEffect does
// nothing on the server"). The calendar pages are `"use client"` but Next.js
// still pre-renders client components on the server. Alias to useEffect on
// the server to silence the warning; behavior is unchanged in the browser.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Mirror an element's height (border-box + margin-bottom) into a CSS
 * variable on `<html>`. Used by the calendar pages to expose the sticky
 * week-nav's live size as `--calendar-nav-h` so the day-header's
 * `sticky top: var(--calendar-nav-h)` always lands flush below the nav,
 * with a guaranteed gap (the nav's margin-bottom) — no chance of pixel
 * overlap sliding the day header behind the higher-z nav.
 *
 * Why both useLayoutEffect AND ResizeObserver:
 *   - useLayoutEffect runs after every React commit, before paint. It
 *     catches layout changes driven by render (filter rows appearing,
 *     data loading, conditional children mounting). Without this, the
 *     ResizeObserver's microtask can lag the React paint by a frame and
 *     the first scroll after the filter row loads lands the day header
 *     behind the nav.
 *   - ResizeObserver catches non-render layout changes: window resize,
 *     browser zoom, font load, container query reflow.
 *
 * Writes go straight to the DOM — never trigger React re-renders.
 * Cost is one DOM read + one style write per render; trivial for a
 * page-level layout.
 *
 * Lifecycle: writes the var on every render, observes for resizes,
 * removes the var on unmount so a different route doesn't read stale.
 */
export function useElementHeightVar(
  ref: RefObject<HTMLElement>,
  cssVar: `--${string}`
): void {
  // Re-measure after every render. React commits the new layout before
  // useLayoutEffect runs, so getBoundingClientRect here reflects the
  // about-to-be-painted size — including any filter rows that just
  // appeared, before the user can see (and scroll past) them.
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    writeVar(el, cssVar);
  });

  // Non-render resize events. Same write, different trigger.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      writeVar(el, cssVar);
    });
    obs.observe(el);
    return () => {
      obs.disconnect();
      document.documentElement.style.removeProperty(cssVar);
    };
  }, [ref, cssVar]);
}

function writeVar(el: HTMLElement, cssVar: string): void {
  // border-box height (getBoundingClientRect) is exactly where the next
  // sticky element should pin: flush against the bottom of the nav, no
  // gap. We deliberately ignore margin-bottom because Tailwind utilities
  // like `space-y-*` zero it out on the nav (via a higher-specificity
  // sibling-margin selector) on some pages and not others, which would
  // make the gap appear on one page and not the other.
  const height = el.getBoundingClientRect().height;
  document.documentElement.style.setProperty(cssVar, `${Math.ceil(height)}px`);
}
