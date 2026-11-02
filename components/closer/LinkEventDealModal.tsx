"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UnifiedDealForm } from "@/components/shared/UnifiedDealForm";
import { Button } from "@/components/ui/button";
import { dialogOverlayClass, dialogPanelClass } from "@/components/ui/dialog";
import type { CalendarEvent } from "./CalendarEventList";

interface Props {
  event: CalendarEvent;
  onClose: () => void;
}

export function LinkEventDealModal({ event, onClose }: Props) {
  const eventDate = event.start.slice(0, 10); // YYYY-MM-DD

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className={dialogOverlayClass} onClick={onClose} />
      <div className={cn(dialogPanelClass, "relative z-50 w-full max-w-lg mx-4 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain")}>
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-4 border-b sm:px-6">
          <div className="min-w-0">
            <h3 className="text-base font-medium">Link as Deal</h3>
            <p className="text-xs text-muted-foreground mt-0.5 [overflow-wrap:anywhere]">
              Create a deal from &ldquo;{event.title}&rdquo;
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="-mr-2 shrink-0">
            <span className="sr-only">Close</span>
            <X />
          </Button>
        </div>

        {/* Form */}
        <div className="p-4 sm:p-6">
          <UnifiedDealForm
            key={event.id}
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
