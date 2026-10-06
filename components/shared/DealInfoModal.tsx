"use client";

import { useId } from "react";
import { X } from "lucide-react";
import { parseServiceCategory } from "@/lib/serviceCategory";
import { useEscapeKey } from "@/hooks/useEscapeKey";

interface DealInfoModalProps {
  title: string;
  type: "notes" | "services";
  content: string | null;
  onClose: () => void;
}

export function DealInfoModal({ title, type, content, onClose }: DealInfoModalProps) {
  const titleId = useId();
  useEscapeKey(onClose);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex w-full max-h-[calc(100dvh-3rem)] flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:max-w-md sm:max-h-[85dvh] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b border-border shrink-0">
          <h3 id={titleId} className="min-w-0 truncate text-base sm:text-lg font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
          {type === "notes" && (
            <p className="text-sm text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
              {content || "No notes"}
            </p>
          )}
          {type === "services" && (() => {
            const services = parseServiceCategory(content);
            if (services.length === 0) return <p className="text-sm text-muted-foreground">No services recorded</p>;
            return (
              <div className="flex flex-wrap gap-2">
                {services.map((svc) => (
                  <span
                    key={svc}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 text-sm font-medium text-foreground"
                  >
                    {svc}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
