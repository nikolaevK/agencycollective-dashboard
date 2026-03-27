"use client";

import { X } from "lucide-react";
import { parseServiceCategory } from "@/lib/serviceCategory";

interface DealInfoModalProps {
  title: string;
  type: "notes" | "services";
  content: string | null;
  onClose: () => void;
}

export function DealInfoModal({ title, type, content, onClose }: DealInfoModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">
          {type === "notes" && (
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
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
