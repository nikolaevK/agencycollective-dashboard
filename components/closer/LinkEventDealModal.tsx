"use client";

import { X } from "lucide-react";
import { UnifiedDealForm } from "@/components/shared/UnifiedDealForm";
import type { CalendarEvent } from "./CalendarEventList";

interface Props {
  event: CalendarEvent;
  onClose: () => void;
}

export function LinkEventDealModal({ event, onClose }: Props) {
  const eventDate = event.start.slice(0, 10); // YYYY-MM-DD

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Link as Deal</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create a deal from &ldquo;{event.title}&rdquo;
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6">
          <UnifiedDealForm
            mode="create"
            context="calendar-link"
            calendarEvent={{ id: event.id, title: event.title, date: eventDate }}
            initialData={{ clientName: event.title }}
            readOnlyDate
            onSuccess={onClose}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
}
