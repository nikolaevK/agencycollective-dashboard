"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children inside a same-origin iframe so the app's responsive
 * (viewport-based) Tailwind breakpoints evaluate against the iframe's width,
 * not the parent window. This is what makes the builder's "Mobile" preview
 * actually show the phone layout — a plain narrow <div> can't, because media
 * queries always read the real viewport.
 *
 * The parent document's <style>/<link rel=stylesheet> tags are cloned into the
 * iframe head, and the <html>/<body> classes (theme + font) are mirrored.
 */
export function PreviewFrame({
  width,
  children,
}: {
  width: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [body, setBody] = useState<HTMLElement | null>(null);

  const sync = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (!doc) return;
    // Clone parent stylesheets into the iframe (idempotent — rebuilt each call).
    doc.head.innerHTML = "";
    document
      .querySelectorAll('style, link[rel="stylesheet"]')
      .forEach((node) => doc.head.appendChild(node.cloneNode(true)));
    // Mirror theme (`dark`) + font classes so it matches the real app.
    doc.documentElement.className = document.documentElement.className;
    doc.body.className = document.body.className;
    doc.body.style.margin = "0";
    doc.body.style.background = "transparent";
    if (body !== doc.body) setBody(doc.body);
  }, [body]);

  useEffect(() => {
    sync();
  }, [sync]);

  return (
    <>
      <iframe
        ref={ref}
        title="Mobile preview"
        onLoad={sync}
        style={{ width }}
        className="block h-full max-w-full border-0 bg-background"
      />
      {body ? createPortal(children, body) : null}
    </>
  );
}
