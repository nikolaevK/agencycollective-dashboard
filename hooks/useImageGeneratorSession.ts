"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ALLOWED_MODES,
  DEFAULT_GEMINI_IMAGE_MODEL,
  GEMINI_IMAGE_SIZES,
  resolveGeminiImageModel,
  type GeminiImageSize,
  type GenerateMode,
  type LiveGeminiImageModelId,
} from "@/lib/geminiModels";
import type { GenerateSource } from "@/app/api/generate/protocol";
import { IMAGE_GEN_SESSION_KEY, clearStoredImages } from "@/components/generate/imageStore";

// Per-tab session of the Image Generator: the thread (text + image METADATA),
// the server conversation it continues and the generation settings. Image
// bytes are NOT kept here — sessionStorage holds ~5 MB and one 4K render is
// bigger — they live in IndexedDB (components/generate/imageStore.ts), keyed
// by ImageRef.id. The session records which admin it belongs to: another
// admin signing in to this tab (after the last one's session expired) starts
// empty, and the stored images are cleared.

const SESSION_KEY = IMAGE_GEN_SESSION_KEY;

export type GenerateResolution = GeminiImageSize;

export interface ImageRef {
  id: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface GenerateSettings {
  mode: GenerateMode;
  model: LiveGeminiImageModelId;
  resolution: GenerateResolution;
  /** null = let the model decide (matches the input image, else 1:1). */
  aspectRatio: string | null;
  /** Grounding with Google Search (models that support it). */
  search: boolean;
}

export interface GenerateMessage {
  id: string;
  role: "user" | "assistant";
  text: string | null;
  createdAt?: number;
  // user turns
  settings?: GenerateSettings;
  /** Small data-URL thumbnails of the reference images sent with this turn. */
  refThumbs?: string[];
  /** The earlier image this turn restarted from (branch / expired session / model switch). */
  baseImageId?: string | null;
  // assistant turns
  images?: ImageRef[];
  notice?: string | null;
  sources?: GenerateSource[];
}

export interface ConversationPointer {
  id: string;
  model: LiveGeminiImageModelId;
}

/** A generated image from a pre-IndexedDB session (base64 in sessionStorage). */
export interface LegacyImage {
  id: string;
  mimeType: string;
  base64: string;
}

interface SessionState {
  /** The admin who owns the thread; null = written before sessions recorded it. */
  adminId: string | null;
  messages: GenerateMessage[];
  conversation: ConversationPointer | null;
  settings: GenerateSettings;
}

export const DEFAULT_SETTINGS: GenerateSettings = {
  mode: "multi-turn",
  model: DEFAULT_GEMINI_IMAGE_MODEL,
  // 4K renders are too large to keep in the server's multi-turn history, so
  // every 4K turn restarts from the latest image — 2K keeps the conversation.
  resolution: "2K",
  aspectRatio: null,
  search: true,
};

const EMPTY: SessionState = { adminId: null, messages: [], conversation: null, settings: DEFAULT_SETTINGS };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeSettings(raw: Record<string, unknown>): GenerateSettings {
  const src = isObject(raw.settings) ? raw.settings : raw; // v1 kept settings at the top level
  const mode = (ALLOWED_MODES as readonly unknown[]).includes(src.mode) ? (src.mode as GenerateMode) : DEFAULT_SETTINGS.mode;
  const resolution = (GEMINI_IMAGE_SIZES as readonly unknown[]).includes(src.resolution)
    ? (src.resolution as GenerateResolution)
    : DEFAULT_SETTINGS.resolution;
  return {
    mode,
    model: typeof src.model === "string" ? resolveGeminiImageModel(src.model) : DEFAULT_SETTINGS.model,
    resolution,
    aspectRatio: typeof src.aspectRatio === "string" ? src.aspectRatio : null,
    search: typeof src.search === "boolean" ? src.search : DEFAULT_SETTINGS.search,
  };
}

/**
 * Parse whatever is stored (v1: base64 images inline + top-level settings;
 * v2: image refs + `settings`) into the current shape. v1 images come back
 * separately so the caller can move them into IndexedDB.
 */
export function normalizeSession(raw: unknown): { state: SessionState; legacy: LegacyImage[] } {
  if (!isObject(raw)) return { state: EMPTY, legacy: [] };
  const legacy: LegacyImage[] = [];
  const messages: GenerateMessage[] = [];
  for (const m of Array.isArray(raw.messages) ? raw.messages : []) {
    if (!isObject(m) || typeof m.id !== "string" || (m.role !== "user" && m.role !== "assistant")) continue;
    // Rebuilt field by field: stored values end up in <img src> / <a href>.
    const msg: GenerateMessage = {
      id: m.id,
      role: m.role,
      text: typeof m.text === "string" ? m.text : null,
      createdAt: typeof m.createdAt === "number" ? m.createdAt : undefined,
    };
    if (isObject(m.settings)) msg.settings = normalizeSettings({ settings: m.settings });
    if (Array.isArray(m.refThumbs)) {
      msg.refThumbs = m.refThumbs.filter((t): t is string => typeof t === "string" && t.startsWith("data:image/"));
    }
    if (typeof m.baseImageId === "string") msg.baseImageId = m.baseImageId;
    if (Array.isArray(m.images)) {
      msg.images = m.images.filter(
        (i): i is ImageRef => isObject(i) && typeof i.id === "string" && typeof i.mimeType === "string"
      );
    }
    if (typeof m.notice === "string") msg.notice = m.notice;
    if (Array.isArray(m.sources)) {
      msg.sources = m.sources.filter(
        (src): src is GenerateSource => isObject(src) && typeof src.uri === "string" && /^https?:\/\//i.test(src.uri)
      );
    }
    if (typeof m.imageBase64 === "string" && m.imageBase64) {
      const id = `${m.id}-0`;
      const mimeType = typeof m.mimeType === "string" ? m.mimeType : "image/png";
      legacy.push({ id, mimeType, base64: m.imageBase64 });
      msg.images = [{ id, mimeType, bytes: Math.floor((m.imageBase64.length * 3) / 4) }];
    }
    messages.push(msg);
  }

  const settings = normalizeSettings(raw);
  let conversation: ConversationPointer | null = null;
  if (isObject(raw.conversation) && typeof raw.conversation.id === "string") {
    conversation = { id: raw.conversation.id, model: resolveGeminiImageModel(raw.conversation.model) };
  } else if (typeof raw.conversationId === "string" && raw.conversationId) {
    // v1 didn't record the conversation's model; the server will say if it's gone.
    conversation = { id: raw.conversationId, model: settings.model };
  }
  const adminId = typeof raw.adminId === "string" ? raw.adminId : null;
  return { state: { adminId, messages, conversation, settings }, legacy };
}

interface InitialSession {
  state: SessionState;
  legacy: LegacyImage[];
  /** The tab held another admin's (or an unowned) thread — dropped; its images must go too. */
  foreign: boolean;
}

function readSession(adminId: string): InitialSession {
  const empty: InitialSession = { state: { ...EMPTY, adminId }, legacy: [], foreign: false };
  if (typeof window === "undefined") return empty;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return empty;
    const { state, legacy } = normalizeSession(JSON.parse(raw));
    if (state.adminId !== adminId) {
      // Settings aren't personal — keep them.
      return { state: { ...empty.state, settings: state.settings }, legacy: [], foreign: true };
    }
    return { state, legacy, foreign: false };
  } catch {
    return empty;
  }
}

function writeSession(state: SessionState): void {
  const attempts: SessionState[] = [
    state,
    // Quota: drop the reference thumbnails, then the thread itself.
    { ...state, messages: state.messages.map((m) => ({ ...m, refThumbs: undefined })) },
    { ...state, messages: [] },
  ];
  for (const attempt of attempts) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(attempt));
      return;
    } catch {
      /* try a smaller payload */
    }
  }
}

type Setter<T> = T | ((prev: T) => T);

export function useImageGeneratorSession(adminId: string) {
  // Read sessionStorage once per mount (not once per useState initializer).
  const initial = useRef<InitialSession | null>(null);
  if (initial.current === null) initial.current = readSession(adminId);

  const [messages, setMessagesRaw] = useState<GenerateMessage[]>(initial.current.state.messages);
  const [conversation, setConversationRaw] = useState<ConversationPointer | null>(initial.current.state.conversation);
  const [settings, setSettings] = useState<GenerateSettings>(initial.current.state.settings);

  // Persist on change — not on the initial read, unless a v1 session (base64
  // images inline) has to be rewritten in the slim shape.
  const firstRun = useRef(true);
  const rewriteLegacy = useRef(initial.current.legacy.length > 0);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (!rewriteLegacy.current) return;
    }
    writeSession({ adminId, messages, conversation, settings });
  }, [adminId, messages, conversation, settings]);

  // The dropped thread's images are still in IndexedDB — clear them (and the
  // stored thread) before anything here reads or writes the store.
  const foreign = useRef(initial.current.foreign);
  useEffect(() => {
    if (!foreign.current) return;
    foreign.current = false;
    void clearStoredImages();
  }, []);

  const setMessages = useCallback((val: Setter<GenerateMessage[]>) => setMessagesRaw(val), []);
  const setConversation = useCallback((val: Setter<ConversationPointer | null>) => setConversationRaw(val), []);
  const updateSettings = useCallback((patch: Partial<GenerateSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  /** v1 images to move into IndexedDB — returned once. */
  const takeLegacyImages = useCallback((): LegacyImage[] => {
    const legacy = initial.current?.legacy ?? [];
    if (initial.current) initial.current = { ...initial.current, legacy: [] };
    return legacy;
  }, []);

  const clearSession = useCallback(() => {
    setMessagesRaw([]);
    setConversationRaw(null);
    // settings are intentionally preserved
  }, []);

  return {
    messages,
    setMessages,
    conversation,
    setConversation,
    settings,
    updateSettings,
    takeLegacyImages,
    clearSession,
  };
}
