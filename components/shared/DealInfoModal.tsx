"use client";

import { useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { parseServiceCategory } from "@/lib/serviceCategory";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";

interface DealInfoModalProps {
  title: string;
  type: "notes" | "services";
  content: string | null;
  onClose: () => void;
}

export function DealInfoModal({ title, type, content, onClose }: DealInfoModalProps) {
  const titleId = useId();
  useEscapeKey(onClose);

  // Portaled to <body> so it layers like the shadcn dialogs (z-50) and stays
  // above the mobile bottom nav.
  return createPortal(
    <>
      <div className={dialogOverlayClass} onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            dialogPanelClass,
            "pointer-events-auto relative flex w-full max-h-[calc(100dvh-3rem)] flex-col rounded-b-none sm:max-w-md sm:max-h-[85dvh] sm:rounded-4xl"
          )}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 border-b shrink-0">
            <h3 id={titleId} className="min-w-0 truncate text-base font-semibold tracking-tight">{title}</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close"
              className="size-10 shrink-0 sm:size-8"
            >
              <X />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
            {type === "notes" && (
              <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                {content || "No notes"}
              </p>
            )}
            {type === "services" && (() => {
              const services = parseServiceCategory(content);
              if (services.length === 0) return <p className="text-sm text-muted-foreground">No services recorded</p>;
              return (
                <div className="flex flex-wrap gap-2">
                  {services.map((svc) => (
                    <Badge key={svc} variant="secondary" className="h-7 px-3 text-sm">
                      {svc}
                    </Badge>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
