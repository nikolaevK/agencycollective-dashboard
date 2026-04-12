"use client";

import React, { useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Sparkles, Download } from "lucide-react";
import { ToolResultRenderer } from "./ToolResultRenderer";
import type { ContentBlock } from "@/types/chat";

const ListTypeContext = React.createContext<"ul" | "ol">("ul");

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  blocks?: ContentBlock[];
  isStreaming?: boolean;
}

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-base font-bold text-foreground mt-1 mb-3">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-1.5 mt-6 mb-3 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-foreground mt-4 mb-2">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed text-foreground/85 mb-3 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic text-foreground/75">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ListTypeContext.Provider value="ul">
      <ul className="mb-3 space-y-1.5 list-none ml-0">{children}</ul>
    </ListTypeContext.Provider>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ListTypeContext.Provider value="ol">
      <ol className="mb-4 space-y-2 list-none ml-0 [counter-reset:li-num]">{children}</ol>
    </ListTypeContext.Provider>
  ),
  li: ({ children }: { children?: React.ReactNode }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const listType = React.useContext(ListTypeContext);
    if (listType === "ol") {
      return (
        <li className="flex items-start gap-3 [counter-increment:li-num] before:flex before:h-5 before:w-5 before:shrink-0 before:items-center before:justify-center before:rounded-full before:bg-primary/15 before:text-[10px] before:font-bold before:text-primary before:mt-0.5 before:[content:counter(li-num)]">
          <span className="flex-1 text-sm text-foreground/85 leading-relaxed pt-0.5">{children}</span>
        </li>
      );
    }
    return (
      <li className="flex items-start gap-2.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60 mt-[7px]" />
        <span className="flex-1 text-sm text-foreground/85 leading-relaxed">{children}</span>
      </li>
    );
  },
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-4 rounded-xl border border-border">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-muted/60">{children}</thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-border/50">{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="even:bg-muted/20 hover:bg-muted/30 transition-colors">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 text-xs text-foreground/80 whitespace-nowrap">{children}</td>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="flex gap-3 rounded-r-xl border-l-2 border-primary/50 bg-primary/5 px-4 py-3 my-3">
      <div className="text-sm text-foreground/80 leading-relaxed [&>p]:mb-0">{children}</div>
    </blockquote>
  ),
  code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
    const isBlock = className?.startsWith("language-");
    return isBlock ? (
      <pre className="rounded-xl bg-muted/70 p-4 overflow-x-auto my-3 border border-border/50">
        <code className={cn("font-mono text-xs text-foreground", className)} {...props}>
          {children}
        </code>
      </pre>
    ) : (
      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground border border-border/40" {...props}>
        {children}
      </code>
    );
  },
  hr: () => <hr className="my-4 border-border/50" />,
};

/**
 * Fix inline markdown tables that are missing newlines between rows.
 * Claude sometimes outputs tables as: `| A | B | |---|---| | 1 | 2 |` all on one line.
 * This inserts newlines before each `|` that starts a new row.
 */
function fixMarkdownTables(text: string): string {
  // Match lines containing multiple pipe-delimited segments that should be table rows
  // Pattern: `| ... | | ... |` (row boundary = `| |` which should be `|\n|`)
  return text.replace(/\|\s*\|(?=\s*[^|\n])/g, "|\n|");
}

export function ChatMessage({ role, content, blocks, isStreaming }: ChatMessageProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleDownload = useCallback(async () => {
    const el = contentRef.current;
    if (!el) return;

    try {
    const [html2canvas, { jsPDF }] = await Promise.all([
      import("html2canvas").then((m) => m.default),
      import("jspdf"),
    ]);

    // Temporarily widen element so tables have room, let browser auto-size columns
    const captureWidth = 1400;
    const origStyles = {
      width: el.style.width,
      maxWidth: el.style.maxWidth,
      overflow: el.style.overflow,
    };
    el.style.width = `${captureWidth}px`;
    el.style.maxWidth = `${captureWidth}px`;
    el.style.overflow = "visible";

    // Force all table cells to wrap text so nothing clips
    const cells = el.querySelectorAll("td, th");
    const origCellStyles: { el: HTMLElement; wordBreak: string; whiteSpace: string; maxWidth: string }[] = [];
    cells.forEach((cell) => {
      const c = cell as HTMLElement;
      origCellStyles.push({ el: c, wordBreak: c.style.wordBreak, whiteSpace: c.style.whiteSpace, maxWidth: c.style.maxWidth });
      c.style.wordBreak = "break-word";
      c.style.whiteSpace = "normal";
      c.style.maxWidth = "300px";
    });

    const tables = el.querySelectorAll("table");
    const origTableStyles: { el: HTMLElement; width: string; fontSize: string; tableLayout: string }[] = [];
    tables.forEach((table) => {
      const t = table as HTMLElement;
      origTableStyles.push({ el: t, width: t.style.width, fontSize: t.style.fontSize, tableLayout: t.style.tableLayout });
      t.style.width = "100%";
      t.style.fontSize = "11px";
      t.style.tableLayout = "auto";
    });

    const canvas = await html2canvas(el, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: captureWidth,
      windowWidth: captureWidth,
    });

    // Restore all original styles
    el.style.width = origStyles.width;
    el.style.maxWidth = origStyles.maxWidth;
    el.style.overflow = origStyles.overflow;
    origCellStyles.forEach(({ el: c, wordBreak, whiteSpace, maxWidth }) => {
      c.style.wordBreak = wordBreak;
      c.style.whiteSpace = whiteSpace;
      c.style.maxWidth = maxWidth;
    });
    origTableStyles.forEach(({ el: t, width, fontSize, tableLayout }) => {
      t.style.width = width;
      t.style.fontSize = fontSize;
      t.style.tableLayout = tableLayout;
    });

    // A4 landscape — 1000px maps well to the printable area
    const margin = 10;
    const pdfWidth = 297;
    const pageHeight = 210;
    const contentWidth = pdfWidth - margin * 2;
    const imgHeight = (canvas.height * contentWidth) / canvas.width;

    const pdf = new jsPDF({ orientation: "l", unit: "mm", format: "a4", compress: true });

    // Header
    pdf.setFontSize(8);
    pdf.setTextColor(124, 58, 237);
    pdf.text("AGENCY COLLECTIVE", margin, 8);
    pdf.setFontSize(14);
    pdf.setTextColor(32, 48, 68);
    pdf.text("AI Analyst Report", margin, 14);
    pdf.setFontSize(8);
    pdf.setTextColor(104, 120, 143);
    pdf.text(`Generated ${new Date().toLocaleDateString()}`, margin, 19);
    pdf.setDrawColor(124, 58, 237);
    pdf.setLineWidth(0.5);
    pdf.line(margin, 21, contentWidth + margin, 21);

    const headerHeight = 26;
    const overlapMm = 8; // repeat 8mm of content on next page to avoid cutting text
    let currentY = 0; // tracks position in the source image (in mm)
    let isFirstPage = true;

    // Paginate with overlap so text at page boundaries is never cut
    while (currentY < imgHeight) {
      const yOffset = isFirstPage ? headerHeight : margin;
      const availableHeight = pageHeight - yOffset - margin;
      const sliceHeight = Math.min(imgHeight - currentY, availableHeight);

      const sourceY = currentY * (canvas.height / imgHeight);
      const sourceH = sliceHeight * (canvas.height / imgHeight);

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sourceH;
      const ctx = pageCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH);
        const pageImg = pageCanvas.toDataURL("image/jpeg", 0.85);
        pdf.addImage(pageImg, "JPEG", margin, yOffset, contentWidth, sliceHeight);
      }

      // Advance by slice height minus overlap (so next page repeats the boundary area)
      const advance = sliceHeight - (currentY + sliceHeight < imgHeight ? overlapMm : 0);
      currentY += advance;
      isFirstPage = false;

      if (currentY < imgHeight) {
        pdf.addPage();
      }
    }

    // Footer on last page
    const lastPageHeight = pdf.internal.pageSize.getHeight();
    pdf.setFontSize(7);
    pdf.setTextColor(104, 120, 143);
    pdf.text("Generated by Agency Collective AI Analyst", margin, lastPageHeight - 6);
    pdf.text(new Date().toLocaleDateString(), contentWidth + margin - 20, lastPageHeight - 6);

    // Open preview in new tab — user can print or save from there
    const pdfBlob = pdf.output("blob");
    const previewUrl = URL.createObjectURL(pdfBlob);
    window.open(previewUrl, "_blank");
    // Clean up blob URL after a delay to allow the tab to load
    setTimeout(() => URL.revokeObjectURL(previewUrl), 60000);
    } catch (err) {
      console.error("[PDF] Generation failed:", err);
      alert("PDF generation failed. Please try again or use a smaller report.");
    }
  }, []);

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] md:max-w-[72%] rounded-2xl rounded-tr-none bg-primary px-4 py-3 text-sm text-primary-foreground leading-relaxed shadow-lg shadow-primary/10">
          {content}
        </div>
      </div>
    );
  }

  // Assistant message
  const hasBlocks = blocks && blocks.length > 0;
  const hasToolUse = blocks?.some((b) => b.type === "tool_use") ?? false;
  const showDownload = hasToolUse && !isStreaming;

  return (
    <div className="flex gap-3 items-start">
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary mt-0.5 text-primary-foreground">
        <Sparkles className="h-3.5 w-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden max-w-[85%] md:max-w-none">
        <div ref={contentRef} className="bg-card rounded-2xl rounded-tl-none p-4 shadow-sm border border-border/50">
          {hasBlocks ? (
            blocks.map((block, i) => {
              if (block.type === "text") {
                if (!block.text) return null;
                return (
                  <ReactMarkdown key={i} components={markdownComponents}>
                    {fixMarkdownTables(block.text)}
                  </ReactMarkdown>
                );
              }
              if (block.type === "tool_use") {
                return (
                  <ToolResultRenderer
                    key={block.id}
                    tool={block}
                    allBlocks={blocks}
                  />
                );
              }
              return null;
            })
          ) : (
            <ReactMarkdown components={markdownComponents}>
              {fixMarkdownTables(content)}
            </ReactMarkdown>
          )}

          {isStreaming && (
            <span className="inline-block h-4 w-0.5 bg-primary animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>

        {/* Download button for responses with charts/metrics/tables */}
        {showDownload && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Download className="h-3 w-3" />
              Download Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
