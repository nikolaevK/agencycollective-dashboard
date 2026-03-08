"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { GEMINI_IMAGE_MODELS, type GeminiImageModelId, type GenerateMode } from "@/lib/geminiModels";

const SESSION_KEY = "ac-image-gen";
const MAX_STORED_MESSAGES = 40;
const KEEP_IMAGES_COUNT = 4; // keep imageBase64 on the last N assistant messages

export interface GenerateMessage {
  id: string;
  role: "user" | "assistant";
  text: string | null;
  imageBase64: string | null;
  mimeType: string | null;
}

interface SessionState {
  messages: GenerateMessage[];
  conversationId: string | null;
  mode: GenerateMode;
  model: GeminiImageModelId;
}

const DEFAULTS: SessionState = {
  messages: [],
  conversationId: null,
  mode: "multi-turn",
  model: GEMINI_IMAGE_MODELS[0].id,
};

function readSession(): SessionState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : DEFAULTS.messages,
      conversationId: parsed.conversationId ?? DEFAULTS.conversationId,
      mode: parsed.mode ?? DEFAULTS.mode,
      model: parsed.model ?? DEFAULTS.model,
    };
  } catch {
    return DEFAULTS;
  }
}

function tryWrite(data: SessionState): void {
  if (typeof window === "undefined") return;

  // Tier 1: full data, capped to MAX_STORED_MESSAGES
  const tier1: SessionState = {
    ...data,
    messages: data.messages.slice(-MAX_STORED_MESSAGES),
  };

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(tier1));
    return;
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "QuotaExceededError")) throw e;
  }

  // Tier 2: strip imageBase64 from all but last KEEP_IMAGES_COUNT assistant messages
  const assistantIndices: number[] = [];
  tier1.messages.forEach((m, i) => { if (m.role === "assistant") assistantIndices.push(i); });
  const keepSet = new Set(assistantIndices.slice(-KEEP_IMAGES_COUNT));
  const tier2Messages = tier1.messages.map((m, i) =>
    m.role === "assistant" && !keepSet.has(i) ? { ...m, imageBase64: null } : m
  );
  console.warn("[ImageGenSession] QuotaExceeded tier1 → stripping old images");
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...tier1, messages: tier2Messages }));
    return;
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "QuotaExceededError")) throw e;
  }

  // Tier 3: strip ALL imageBase64
  console.warn("[ImageGenSession] QuotaExceeded tier2 → stripping all images");
  const tier3Messages = tier1.messages.map((m) =>
    m.role === "assistant" ? { ...m, imageBase64: null } : m
  );
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...tier1, messages: tier3Messages }));
    return;
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "QuotaExceededError")) throw e;
  }

  // Tier 4: settings only, no messages
  console.warn("[ImageGenSession] QuotaExceeded tier3 → storing settings only");
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ messages: [], conversationId: data.conversationId, mode: data.mode, model: data.model })
    );
    return;
  } catch {
    // Tier 5: silent fail
    console.warn("[ImageGenSession] QuotaExceeded tier4 → silent fail");
  }
}

type Setter<T> = T | ((prev: T) => T);

export function useImageGeneratorSession() {
  const isMounted = useRef(false);

  const [messages, setMessagesRaw] = useState<GenerateMessage[]>(() => readSession().messages);
  const [conversationId, setConversationIdRaw] = useState<string | null>(() => readSession().conversationId);
  const [mode, setModeRaw] = useState<GenerateMode>(() => readSession().mode);
  const [model, setModelRaw] = useState<GeminiImageModelId>(() => readSession().model);

  // Persist to sessionStorage on every state change (except the initial mount read)
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    tryWrite({ messages, conversationId, mode, model });
  }, [messages, conversationId, mode, model]);

  const setMessages = useCallback((val: Setter<GenerateMessage[]>) => {
    setMessagesRaw(val);
  }, []);

  const setConversationId = useCallback((val: Setter<string | null>) => {
    setConversationIdRaw(val);
  }, []);

  const setMode = useCallback((val: Setter<GenerateMode>) => {
    setModeRaw(val);
  }, []);

  const setModel = useCallback((val: Setter<GeminiImageModelId>) => {
    setModelRaw(val);
  }, []);

  const clearSession = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_KEY);
    setMessagesRaw(DEFAULTS.messages);
    setConversationIdRaw(DEFAULTS.conversationId);
    setModeRaw(DEFAULTS.mode);
    setModelRaw(DEFAULTS.model);
  }, []);

  return {
    messages,
    setMessages,
    conversationId,
    setConversationId,
    mode,
    setMode,
    model,
    setModel,
    clearSession,
  };
}
