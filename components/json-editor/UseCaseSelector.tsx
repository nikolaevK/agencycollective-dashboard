"use client";

import { Palette, ArrowLeftRight, CloudSun, Camera, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UseCase } from "@/lib/jsonEditorPrompts";

const USE_CASES: {
  id: UseCase;
  label: string;
  description: string;
  icon: typeof Palette;
  example: string;
  requiresReference: boolean;
}[] = [
  {
    id: "colors",
    label: "Colors & Materials",
    description: "Change color or material of specific objects",
    icon: Palette,
    example: "Chair from cream to light blue velvet",
    requiresReference: false,
  },
  {
    id: "object-swap",
    label: "Object Swap",
    description: "Replace an object with a reference image",
    icon: ArrowLeftRight,
    example: "Replace armchair with a different design",
    requiresReference: true,
  },
  {
    id: "weather",
    label: "Weather & Lighting",
    description: "Change time of day, mood, lighting",
    icon: CloudSun,
    example: "Morning sunlight to rainy evening",
    requiresReference: false,
  },
  {
    id: "camera",
    label: "Camera Perspective",
    description: "Transfer camera angle from a reference",
    icon: Camera,
    example: "Apply fisheye lens from another photo",
    requiresReference: true,
  },
  {
    id: "text-logos",
    label: "Text & Logos",
    description: "Change text content or swap logos",
    icon: Type,
    example: "Update text or replace brand logo",
    requiresReference: false,
  },
];

export { USE_CASES };

interface UseCaseSelectorProps {
  selected: UseCase | null;
  onSelect: (useCase: UseCase) => void;
  disabled?: boolean;
}

export function UseCaseSelector({ selected, onSelect, disabled }: UseCaseSelectorProps) {
  return (
    <div className="grid gap-2">
      {USE_CASES.map((uc) => {
        const Icon = uc.icon;
        const isSelected = selected === uc.id;
        return (
          <button
            key={uc.id}
            onClick={() => onSelect(uc.id)}
            disabled={disabled}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              "hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed",
              isSelected
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border"
            )}
          >
            <div
              className={cn(
                "mt-0.5 rounded-md p-1.5",
                isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{uc.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{uc.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
