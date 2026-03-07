import { ImageIcon, Layers, Zap } from "lucide-react";

export const GEMINI_IMAGE_MODELS = [
  {
    id: "gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
    description: "Fast image generation",
    icon: Zap,
  },
  {
    id: "gemini-2.0-flash-preview-image-generation",
    label: "Flash Image",
    description: "Stable image generation",
    icon: ImageIcon,
  },
  {
    id: "imagen-3.0-generate-002",
    label: "Imagen 3",
    description: "Highest quality",
    icon: Layers,
  },
] as const;

export type GeminiImageModelId = (typeof GEMINI_IMAGE_MODELS)[number]["id"];
export const ALLOWED_GEMINI_MODELS: readonly GeminiImageModelId[] =
  GEMINI_IMAGE_MODELS.map((m) => m.id);

export type GenerateMode = "multi-turn" | "single-turn";
export const ALLOWED_MODES: readonly GenerateMode[] = ["multi-turn", "single-turn"];
