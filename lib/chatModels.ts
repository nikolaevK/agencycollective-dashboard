import { Brain } from "lucide-react";

export const CHAT_MODELS = [
  {
    id: "claude-opus-4-6",
    label: "Opus",
    description: "Most capable",
    icon: Brain,
  },
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

export const ALLOWED_MODELS: readonly ChatModelId[] = CHAT_MODELS.map((m) => m.id);

/** Default model — derived from the list so it can never drift from CHAT_MODELS. */
export const DEFAULT_MODEL: ChatModelId = CHAT_MODELS[0].id;
