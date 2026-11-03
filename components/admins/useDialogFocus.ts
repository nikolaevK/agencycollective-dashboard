"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard focus for the hand-built Add/Edit Admin forms (InvoiceDrawerShell
 * pattern): focus moves to the panel on open (not the first input — that
 * would pop the keyboard on a phone), Tab / Shift+Tab wrap at the ends so the
 * page behind (e.g. "Edit <other admin>") is unreachable, and focus returns to
 * whatever opened the form on close. Give the panel `tabIndex={-1}`, the ref
 * and `onKeyDown`.
 *
 * The desktop modal and the mobile form are mounted together, one hidden by
 * CSS — only the visible one takes (and later returns) focus.
 */
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const panel = ref.current;
    if (!panel || panel.getClientRects().length === 0) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<T>) {
    const panel = ref.current;
    // Portaled content (the role Select) bubbles here through React but isn't
    // inside the panel — it manages its own focus.
    if (e.key !== "Tab" || e.defaultPrevented || !panel || !panel.contains(e.target as Node)) return;
    // tabIndex ≥ 0 drops the Radix Switch/Checkbox form inputs (tabindex -1).
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.tabIndex >= 0 && el.getClientRects().length > 0
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

  return { ref, onKeyDown };
}
