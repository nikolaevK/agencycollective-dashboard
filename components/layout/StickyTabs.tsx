"use client";

import * as React from "react";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * A page's tab bar (the Tabs root) that, on phones, sticks to the top of the
 * admin shell's scrolling <main> — the header + metric cards above it are a
 * screen or two tall there, so a tab switch used to land far from its content.
 * Below md, every tab change (and the first render when `scrollOnMount`)
 * scrolls <main> so the bar sits at its stuck position with the new tab's
 * content right under it, and the active trigger into view inside the bar's
 * horizontal scroller. Desktop: a plain Tabs root. Must be a direct child of
 * the page's content column (sticky stays inside its parent).
 */
export const StickyTabs = React.forwardRef<
  React.ElementRef<typeof Tabs>,
  React.ComponentPropsWithoutRef<typeof Tabs> & {
    /** Read on mount only: also bring the bar up on the first render (a
     *  deep-linked tab). */
    scrollOnMount?: boolean;
  }
>(({ className, value, scrollOnMount = false, ...props }, forwardedRef) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const mounted = React.useRef(false);
  const scrolledMain = React.useRef<HTMLElement | null>(null);
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );

  // Layout effect: the scroll lands before the new tab's first paint.
  useIsoLayoutEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    const bar = ref.current;
    if (!bar || !window.matchMedia("(max-width: 767px)").matches) return;

    const active = bar.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    for (let el = active?.parentElement; active && el && el !== bar; el = el.parentElement) {
      if (el.scrollWidth <= el.clientWidth) continue;
      const box = el.getBoundingClientRect();
      const tab = active.getBoundingClientRect();
      if (tab.left < box.left) el.scrollLeft -= box.left - tab.left + 16;
      else if (tab.right > box.right) el.scrollLeft += tab.right - box.right + 16;
      break;
    }

    if (first && !scrollOnMount) return;
    const main = bar.closest("main");
    if (!main) return;
    // Stuck position = the bar's in-flow offset (sticky off for one forced
    // layout, never painted) minus its sticky `top` (negative where a row
    // above the tabs may scroll away).
    bar.style.position = "static";
    const inFlow = bar.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
    bar.style.position = "";
    const target = inFlow - (parseFloat(getComputedStyle(bar).top) || 0);
    if (Math.abs(main.scrollTop - target) <= 1) return;
    // Chrome's scroll anchoring would put a clamped offset back where it was
    // (deep in the previous tab) once the new content grows — off for this page.
    scrolledMain.current = main;
    main.style.overflowAnchor = "none";
    main.scrollTop = target;
    if (main.scrollTop >= target - 1) return;
    // Clamped: the new tab is still a short loading skeleton. Finish the
    // scroll as its content grows, unless the user scrolls first.
    const finish = () => {
      grow.disconnect();
      clearTimeout(timer);
      main.removeEventListener("touchstart", finish);
      main.removeEventListener("wheel", finish);
    };
    const grow = new ResizeObserver(() => {
      main.scrollTop = target;
      if (main.scrollTop >= target - 1) finish();
    });
    grow.observe(bar.parentElement ?? main);
    const timer = setTimeout(finish, 4000);
    main.addEventListener("touchstart", finish, { passive: true });
    main.addEventListener("wheel", finish, { passive: true });
    return finish;
    // Per tab change only — scrollOnMount is read on mount.
  }, [value]);

  // Hand scroll anchoring back if the bar unmounts with its page still up.
  React.useEffect(
    () => () => {
      if (scrolledMain.current) scrolledMain.current.style.overflowAnchor = "";
    },
    []
  );

  return (
    <Tabs
      ref={setRefs}
      value={value}
      className={cn(
        // -mx-4/px-4: full-bleed over DashboardShell's p-4, so content
        // scrolling under the bar is hidden edge to edge.
        "max-md:sticky max-md:top-0 max-md:z-30 max-md:-mx-4 max-md:bg-background max-md:px-4 max-md:py-2",
        className
      )}
      {...props}
    />
  );
});
StickyTabs.displayName = "StickyTabs";
