/**
 * JSON Editor use cases — pure (no icons, no db): shared by the analyze /
 * generate routes and the client. Icons live in the component.
 */

export type UseCase = "colors" | "object-swap" | "weather" | "camera" | "text-logos";
export type ImageRole = "source" | "reference";

export const ALLOWED_USE_CASES: readonly UseCase[] = [
  "colors",
  "object-swap",
  "weather",
  "camera",
  "text-logos",
];
export const ALLOWED_ROLES: readonly ImageRole[] = ["source", "reference"];

export interface UseCaseMeta {
  id: UseCase;
  label: string;
  description: string;
  /** A one-line example of the kind of edit this use case is for. */
  example: string;
  /** The generation needs a second image (the object to swap in / the camera to copy). */
  requiresReference: boolean;
  /** Label of the second image's uploader (only when requiresReference). */
  referenceLabel?: string;
}

export const USE_CASE_META: readonly UseCaseMeta[] = [
  {
    id: "colors",
    label: "Colors & Materials",
    description: "Change the color or material of specific objects",
    example: "Chair from cream to light blue velvet",
    requiresReference: false,
  },
  {
    id: "object-swap",
    label: "Object Swap",
    description: "Replace an object with one from a reference image",
    example: "Replace the armchair with a different design",
    requiresReference: true,
    referenceLabel: "Reference object",
  },
  {
    id: "weather",
    label: "Weather & Lighting",
    description: "Change time of day, mood and lighting",
    example: "Morning sunlight to a rainy evening",
    requiresReference: false,
  },
  {
    id: "camera",
    label: "Camera Perspective",
    description: "Transfer the camera angle from a reference photo",
    example: "Apply the fisheye lens of another photo",
    requiresReference: true,
    referenceLabel: "Reference camera",
  },
  {
    id: "text-logos",
    label: "Text & Logos",
    description: "Change text content or swap logos",
    example: "Update the headline or replace a brand logo",
    requiresReference: false,
  },
];

export function isUseCase(value: unknown): value is UseCase {
  return typeof value === "string" && (ALLOWED_USE_CASES as readonly string[]).includes(value);
}

export function isImageRole(value: unknown): value is ImageRole {
  return typeof value === "string" && (ALLOWED_ROLES as readonly string[]).includes(value);
}

export function metaForUseCase(id: UseCase): UseCaseMeta {
  // ALLOWED_USE_CASES and USE_CASE_META list the same ids (tested).
  return USE_CASE_META.find((m) => m.id === id)!;
}
