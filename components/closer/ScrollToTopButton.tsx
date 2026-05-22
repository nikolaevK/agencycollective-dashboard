"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Floating "scroll to top" affordance for long-scroll pages (calendar).
// Auto-shows once the user has scrolled past `threshold` and fades out
// when near the top. Click smoothly scrolls the nearest scrollable
// ancestor back to 0.
//
// Why nearest-ancestor and not window.scrollTo: the calendar pages
// scroll inside a `<main className="overflow-y-auto">` container rather
// than on the document. `window.scrollY` would always be 0 in that
// layout. We use the button's own DOM position to discover the right
// scroll container at mount, then attach scroll listeners to that
// element directly.

interface Props {
  /** Show the button once the container has scrolled past this many px. */
  threshold?: number;
  /** Additional Tailwind classes appended to the button. */
  className?: string;
}

function findScrollContainer(start: Element): HTMLElement {
  // position:fixed doesn't break the parentElement chain — walking up
  // still hits the layout ancestors. Pick the first one whose computed
  // overflow-y allows scrolling. Fall back to <html> if none found
  // (e.g., on a page that uses window-level scrolling).
  let el: Element | null = start.parentElement;
  while (el) {
    const overflowY = window.getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return el as HTMLElement;
    }
    el = el.parentElement;
  }
  return document.documentElement;
}

export function ScrollToTopButton({ threshold = 400, className }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  // Resolve the scroll container once we have a DOM node.
  useEffect(() => {
    if (!buttonRef.current) return;
    setScrollEl(findScrollContainer(buttonRef.current));
  }, []);

  // Track scroll position on that container. Passive listener so it
  // doesn't block scroll performance. Initial sync covers the case where
  // the user navigates back to a page that's already scrolled down.
  useEffect(() => {
    if (!scrollEl) return;
    const update = () => setVisible(scrollEl.scrollTop > threshold);
    update();
    scrollEl.addEventListener("scroll", update, { passive: true });
    return () => scrollEl.removeEventListener("scroll", update);
  }, [scrollEl, threshold]);

  const scrollToTop = useCallback(() => {
    scrollEl?.scrollTo({ top: 0, behavior: "smooth" });
  }, [scrollEl]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      // fixed + bottom-20 sm:bottom-6: clears the mobile bottom-nav
      // (~64–80px tall) and sits comfortably in the corner on desktop.
      // pointer-events-none while hidden so it doesn't intercept clicks
      // when invisible.
      className={cn(
        "fixed right-4 sm:right-6 bottom-20 sm:bottom-6 z-30",
        "flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-lg",
        "transition-all duration-200 hover:bg-accent",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
        className
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
