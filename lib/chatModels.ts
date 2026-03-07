import { Zap, Bot, Brain } from "lucide-react";

export const CHAT_MODELS = [
  {
    id: "claude-haiku-4-5-20251001",
    label: "Haiku",
    description: "Fastest responses",
    icon: Zap,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet",
    description: "Balanced performance",
    icon: Bot,
  },
  {
    id: "claude-opus-4-6",
    label: "Opus",
    description: "Most capable",
    icon: Brain,
  },
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

export const ALLOWED_MODELS: readonly ChatModelId[] = CHAT_MODELS.map((m) => m.id);
