"use client";

import { ArrowLeftRight, Camera, Check, CloudSun, Palette, Type, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { USE_CASE_META, type UseCase } from "@/lib/jsonEditor/useCases";

const ICONS: Record<UseCase, LucideIcon> = {
  colors: Palette,
  "object-swap": ArrowLeftRight,
  weather: CloudSun,
  camera: Camera,
  "text-logos": Type,
};

interface UseCaseSelectorProps {
  selected: UseCase | null;
  onSelect: (useCase: UseCase) => void;
  disabled?: boolean;
}

/** The five edit types — one pressed at a time. */
export function UseCaseSelector({ selected, onSelect, disabled }: UseCaseSelectorProps) {
  return (
    <div role="group" aria-label="Use case" className="grid gap-1.5">
      {USE_CASE_META.map((uc) => {
        const Icon = ICONS[uc.id];
        const isSelected = selected === uc.id;
        return (
          <button
            key={uc.id}
            type="button"
            onClick={() => onSelect(uc.id)}
            disabled={disabled}
            aria-pressed={isSelected}
            title={`e.g. ${uc.example}`}
            className={cn(
              "flex items-start gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition-colors",
              "focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50",
              isSelected ? "bg-muted ring-1 ring-foreground/10" : "hover:bg-muted/60"
            )}
          >
            <Icon
              aria-hidden
              className={cn("mt-0.5 size-4 shrink-0", isSelected ? "text-foreground" : "text-muted-foreground")}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-snug">{uc.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{uc.description}</span>
            </span>
            {isSelected && <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground" />}
          </button>
        );
      })}
    </div>
  );
}
