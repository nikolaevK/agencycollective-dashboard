"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, Maximize2, Minimize2, X } from "lucide-react";
import { InvoiceLivePreview } from "@/components/invoice/InvoiceLivePreview";
import { InvoicePreviewDialog } from "@/components/invoice/InvoicePreviewDialog";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass } from "@/components/ui/dialog";
import { sheetPanelClass } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/use-confirm";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import type { InvoiceData } from "@/types/invoice";
import { cn } from "@/lib/utils";

// Per-viewer layout preferences (a convenience only — absent storage just
// means the drawer opens collapsed with the preview on).
const EXPANDED_KEY = "ac:invoiceDrawer:expanded";
const PREVIEW_KEY = "ac:invoiceDrawer:preview";

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  subtitle?: ReactNode;
  /** Extra header content (status chips) next to the title. */
  badges?: ReactNode;
  onClose: () => void;
  /** Unsaved edits: closing via backdrop / × / Escape asks first. */
  dirty?: boolean;
  /** Closing is blocked while true (a send is in flight). */
  busy?: boolean;
  /** Invoice shown in the side-by-side live preview when expanded. */
  preview?: InvoiceData | null;
  /** Collapsed width. */
  size?: "md" | "lg";
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Shared frame for the invoice drawers (deal invoice review, client re-bill,
 * ad-account). Collapsed it's the familiar right-side drawer; expanded it
 * goes near full-width with the live invoice preview beside the form, so long
 * line items are comfortable to edit and you see exactly what will be sent.
 */
export function InvoiceDrawerShell({
  title,
  subtitle,
  badges,
  onClose,
  dirty = false,
  busy = false,
  preview,
  size = "md",
  footer,
  children,
}: Props) {
  const titleId = useId();
  const { confirm, dialog } = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [fullPreview, setFullPreview] = useState(false);

  useEffect(() => {
    setExpanded(readPref(EXPANDED_KEY, false));
    setShowPreview(readPref(PREVIEW_KEY, true));
  }, []);

  function toggleExpanded() {
    setExpanded((v) => {
      writePref(EXPANDED_KEY, !v);
      return !v;
    });
  }
  function togglePreview() {
    setShowPreview((v) => {
      writePref(PREVIEW_KEY, !v);
      return !v;
    });
  }

  async function requestClose() {
    if (busy) return;
    if (dirty && !(await confirm({ title: "Discard unsaved changes to this invoice?", destructive: true }))) return;
    onClose();
  }

  // Nested layers (full-screen preview, pickers, contract editor) mount later,
  // so they sit above this on the Escape stack and close first. (Radix
  // popovers/selects/confirm dialogs inside handle Escape themselves and mark
  // it handled, so it never reaches this layer.)
  useEscapeKey(() => {
    void requestClose();
  });

  // Keyboard focus belongs to the drawer while it's open: it moves in on open
  // (the panel itself — not the first input, which would pop the keyboard on
  // a phone), Tab wraps at the ends, and focus returns to whatever opened the
  // drawer on close. A Tab wrap rather than a focusin fence, so Radix popovers
  // portaled to <body> and the full-screen preview keep their own focus.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function trapTab(e: KeyboardEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    // Portaled content bubbles here through React but isn't inside the panel.
    if (e.key !== "Tab" || !panel || !panel.contains(e.target as Node)) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0
    );
    if (items.length === 0) return e.preventDefault();
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const sideBySide = expanded && showPreview && !!preview;

  // Rendered into <body> so the Radix popovers, selects and confirm dialogs
  // used inside (portaled to <body> when they open, i.e. after this) stack
  // above the drawer, and the drawer stacks above the app chrome (sidebar,
  // mobile bottom nav) — at the shared z-50 of the shadcn overlays, later in
  // the DOM wins. React events still bubble through the component tree.
  const drawer = (
    <>
      <div className={dialogOverlayClass} onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={cn(
          sheetPanelClass,
          "fixed bottom-0 right-0 top-0 z-50 w-full overflow-hidden border-l outline-none transition-[max-width] duration-200",
          expanded ? "max-w-[min(1440px,100vw)] lg:max-w-[min(1440px,96vw)]" : size === "lg" ? "max-w-2xl" : "max-w-xl"
        )}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={titleId} className="text-base font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              {badges}
            </div>
            {subtitle && <div className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* Icon-only on phones — below lg there's no side preview, and
                some drawers (deal-draft review) have no footer Preview. */}
            {preview && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFullPreview(true)}
                className="px-2.5 text-muted-foreground"
                title="Full-screen preview"
                aria-label="Preview invoice"
              >
                <Eye />
                <span className="hidden sm:inline">Preview</span>
              </Button>
            )}
            {expanded && preview && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={togglePreview}
                className="hidden text-muted-foreground lg:inline-flex"
                title={showPreview ? "Hide side preview" : "Show side preview"}
                aria-label={showPreview ? "Hide side preview" : "Show side preview"}
                aria-pressed={showPreview}
              >
                {showPreview ? <EyeOff /> : <Eye />}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleExpanded}
              className="hidden text-muted-foreground sm:inline-flex"
              title={expanded ? "Collapse" : "Expand"}
              aria-label={expanded ? "Collapse drawer" : "Expand drawer"}
              aria-pressed={expanded}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={requestClose}
              disabled={busy}
              className="text-muted-foreground"
              aria-label="Close"
            >
              <X />
            </Button>
          </div>
        </div>

        {/* Body: form (+ live preview when expanded) */}
        <div className={cn("min-h-0 flex-1", sideBySide ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]" : "flex flex-col")}>
          <div className={cn("min-h-0 overflow-y-auto overscroll-contain", sideBySide ? "h-full" : "flex-1")}>
            <div className={cn("px-5 py-4", expanded && !sideBySide && "mx-auto max-w-5xl")}>{children}</div>
          </div>
          {sideBySide && (
            // leading-normal: the preview inherits a unitless line-height (as
            // on the Invoice page), not the panel's text-sm 1.25rem.
            <div className="hidden min-h-0 flex-col border-l bg-muted/50 leading-normal lg:flex">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
                <p className="text-xs font-medium text-muted-foreground">Live preview</p>
                <Button type="button" variant="ghost" size="xs" onClick={() => setFullPreview(true)}>
                  <Maximize2 />
                  Full screen
                </Button>
              </div>
              {/* Stable gutter: the preview scales to this pane's width, so a
                  scrollbar that comes and goes as the scaled page crosses the
                  pane height would flip the width and loop forever (the
                  flicker). The reserved gutter keeps the width constant. */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable]">
                <div className="mx-auto max-w-[760px] overflow-hidden rounded-sm shadow-lg ring-1 ring-black/5">
                  <InvoiceLivePreview data={preview!} />
                </div>
              </div>
            </div>
          )}
        </div>

        {footer && <div className="shrink-0 border-t px-5 py-3">{footer}</div>}
      </div>

      {fullPreview && preview && (
        <InvoicePreviewDialog data={preview} title={title} onClose={() => setFullPreview(false)} />
      )}
      {dialog}
    </>
  );

  return typeof document === "undefined" ? drawer : createPortal(drawer, document.body);
}
