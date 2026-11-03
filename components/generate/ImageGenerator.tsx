"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type DragEvent } from "react";
import dynamic from "next/dynamic";
import { CircleAlert, Info, MessageSquarePlus, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { clampImageSize, geminiImageModelInfo, isAspectRatioFor, type GenerateMode } from "@/lib/geminiModels";
import {
  useImageGeneratorSession,
  type GenerateMessage,
  type GenerateSettings,
  type ImageRef,
} from "@/hooks/useImageGeneratorSession";
import type { GenerateResult } from "@/app/api/generate/protocol";
import { useAdmin } from "@/components/providers/AdminProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { StatusBadge, badgeTone, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/use-confirm";
import { GenerateSettingsCard } from "./GenerateSettingsCard";
import { ImageThread, type ImageActions, type PendingTurn } from "./ImageThread";
import { PromptComposer, type ComposerAttachment } from "./PromptComposer";
import {
  GenerateRequestError,
  base64ToBlob,
  base64ToBytes,
  formatBytes,
  formatLabel,
  imageFileName,
  readBlobImageSize,
  readGenerateResponse,
} from "./generateClient";
import { ImagePrepError, MAX_REFERENCE_IMAGES, describeImage, perImageBudget, prepareForUpload, toPng } from "./imagePrep";
import { deleteImages, getImages, pruneImages, putImage } from "./imageStore";

// Lazy: the Dialog only loads the first time an image is opened full size.
const ImageLightbox = dynamic(() => import("./ImageLightbox").then((m) => m.ImageLightbox), { ssr: false });

/** Same cap as app/api/generate/route.ts. */
const MAX_PROMPT_CHARS = 4_000;
/** Thread length kept (older turns and their images are dropped). */
const MAX_MESSAGES = 60;
/** IndexedDB images no open thread references are dropped after this. */
const IMAGE_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_STORED_IMAGES = 80;

interface Attachment extends ComposerAttachment {
  blob: Blob;
}

/** IndexedDB refused an image this page session — the user was told once. */
let storageWarned = false;

/** Codes where pressing Retry can plausibly work. */
const RETRYABLE_CODES = new Set([
  "upstream_unavailable",
  "upstream_rate_limited",
  "rate_limited",
  "conversation_busy",
  "no_image",
  "incomplete",
  "internal",
  "http",
]);

function newId(): string {
  return crypto.randomUUID();
}

function imageIdsOf(messages: readonly GenerateMessage[]): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    for (const img of m.images ?? []) ids.push(img.id);
    if (m.baseImageId) ids.push(m.baseImageId);
  }
  return ids;
}

/** What a turn will actually use: size/ratio/search narrowed to the model. */
function effectiveSettings(s: GenerateSettings): GenerateSettings {
  return {
    ...s,
    resolution: clampImageSize(s.model, s.resolution),
    aspectRatio: isAspectRatioFor(s.model, s.aspectRatio) ? s.aspectRatio : null,
    search: geminiImageModelInfo(s.model).search && s.search,
  };
}

/**
 * After this failure the server's history may hold a turn the thread never
 * showed: the result line was lost (dropped / timed-out stream, a late Stop)
 * or broke here. Failures the server reported, and local ones before
 * sending, leave it untouched.
 */
function outcomeUnknown(err: unknown, aborted: boolean): boolean {
  if (aborted) return true;
  if (err instanceof ImagePrepError) return false;
  return !(err instanceof GenerateRequestError) || err.code === "incomplete";
}

function describeFailure(err: unknown): { message: string; retry: boolean } {
  if (err instanceof GenerateRequestError) return { message: err.message, retry: RETRYABLE_CODES.has(err.code) };
  if (err instanceof ImagePrepError) return { message: err.message, retry: false };
  if (err instanceof TypeError) {
    return { message: "Couldn't reach the server. Check your connection and try again.", retry: true };
  }
  return { message: "Something went wrong. Try again.", retry: true };
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

/** `active` = this tool's Creative Studio tab is showing (panels stay mounted while hidden). */
export function ImageGenerator({ active = true }: { active?: boolean } = {}) {
  const { adminId } = useAdmin();
  const { messages, setMessages, conversation, setConversation, settings, updateSettings, takeLegacyImages, clearSession } =
    useImageGeneratorSession(adminId);
  const { toast } = useToast();
  const { confirm, dialog } = useConfirm();

  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  /** "Continue from this image": the next multi-turn message branches from it. */
  const [baseImageId, setBaseImageId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  /** `prompt`: the failed turn, for Retry (the composer may hold something newer). */
  const [error, setError] = useState<{ message: string; retry: boolean; prompt?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());
  // Kept after closing so the dialog can animate out with its image.
  const [lightbox, setLightbox] = useState<{ image: ImageRef; prompt: string | null } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Bumped when image bytes arrive outside a messages change (urlFor answers more ids).
  const [imagesVersion, rerender] = useReducer((n: number) => n + 1, 0);

  // Image bytes by ImageRef.id, and object URLs drawn from them on demand.
  const blobsRef = useRef(new Map<string, Blob>());
  const urlsRef = useRef(new Map<string, string>());
  const abortRef = useRef<AbortController | null>(null);
  // Desktop: the thread scrolls (scrollRef). Below lg the whole panel scrolls
  // (rootRef) with the composer stuck to its bottom — a nested thread scroller
  // left only a sliver for images under the page header on phones.
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const inputRef = useRef(input);
  inputRef.current = input;
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const isPending = pending !== null;

  const urlFor = useCallback((id: string): string | null => {
    const existing = urlsRef.current.get(id);
    if (existing) return existing;
    const blob = blobsRef.current.get(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlsRef.current.set(id, url);
    return url;
  }, []);

  /** Drop images from memory (revoking their URLs) and from IndexedDB. */
  const forgetImages = useCallback((ids: readonly string[]) => {
    if (!ids.length) return;
    for (const id of ids) {
      const url = urlsRef.current.get(id);
      if (url) URL.revokeObjectURL(url);
      urlsRef.current.delete(id);
      blobsRef.current.delete(id);
    }
    void deleteImages(ids);
  }, []);

  // Object URLs pin their blobs until revoked — release them when the panel
  // unmounts, and abort a generation still running (the server stops too).
  useEffect(() => {
    const urls = urlsRef.current;
    rerender(); // after a StrictMode remount the URLs below were revoked — draw fresh ones
    return () => {
      abortRef.current?.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  // Load this thread's images from IndexedDB (moving any from an older
  // session format there first), then prune what no thread uses any more.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const legacy of takeLegacyImages()) {
        try {
          const blob = new Blob([base64ToBytes(legacy.base64)], { type: legacy.mimeType });
          blobsRef.current.set(legacy.id, blob);
          await putImage(legacy.id, blob);
        } catch {
          /* unreadable legacy image — shown as missing */
        }
      }
      const wanted = imageIdsOf(messagesRef.current).filter((id) => !blobsRef.current.has(id));
      const found = await getImages(wanted);
      if (cancelled) return;
      found.forEach((blob, id) => blobsRef.current.set(id, blob));
      const gone = wanted.filter((id) => !found.has(id));
      if (gone.length) setMissing(new Set(gone));
      rerender();
      void pruneImages(new Set(imageIdsOf(messagesRef.current)), IMAGE_RETENTION_MS, MAX_STORED_IMAGES);
    })();
    return () => {
      cancelled = true;
    };
  }, [takeLegacyImages]);

  // Keep the thread bounded: drop the oldest turns (and images nothing else uses).
  useEffect(() => {
    if (isPending || messages.length <= MAX_MESSAGES) return;
    let cut = messages.length - MAX_MESSAGES;
    if (messages[cut]?.role === "assistant") cut++; // never keep a reply without its prompt
    const kept = messages.slice(cut);
    const keptIds = new Set(imageIdsOf(kept));
    forgetImages(imageIdsOf(messages.slice(0, cut)).filter((id) => !keptIds.has(id)));
    setMessages(kept);
  }, [messages, isPending, forgetImages, setMessages]);

  const latestImageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const imgs = messages[i].images;
      if (messages[i].role === "assistant" && imgs?.length) return imgs[imgs.length - 1].id;
    }
    return null;
  }, [messages]);

  // ── Scrolling, focus (both inert while the tab is hidden) ──────────────────
  const scrollToBottom = useCallback(() => {
    for (const el of [scrollRef.current, rootRef.current]) {
      if (el && el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    }
  }, []);

  const trackStick = useCallback((e: { currentTarget: HTMLElement }) => {
    const el = e.currentTarget;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  }, []);

  useEffect(() => {
    if (!active) return;
    stickToBottom.current = true;
    // Nothing to follow yet — below lg the whole panel scrolls, and jumping to
    // its bottom would push the settings out of view on first open.
    if (messages.length === 0 && !isPending) return;
    scrollToBottom();
  }, [messages.length, isPending, active, scrollToBottom]);

  useEffect(() => {
    if (!active) return;
    // Desktop only — on touch devices focusing would pop the keyboard open.
    if (window.matchMedia?.("(pointer: fine)").matches) textareaRef.current?.focus({ preventScroll: true });
  }, [active]);

  // ── Thread reset ────────────────────────────────────────────────────────────
  const resetThread = useCallback(() => {
    forgetImages(imageIdsOf(messagesRef.current));
    clearSession();
    setAttachments([]);
    setBaseImageId(null);
    setError(null);
    setNotice(null);
    setMissing(new Set());
  }, [clearSession, forgetImages]);

  const handleNewConversation = useCallback(async () => {
    if (messagesRef.current.length > 0) {
      const ok = await confirm({
        title: "Start a new conversation?",
        description:
          "This clears the thread and its images from this browser. Download anything you want to keep first.",
        confirmText: "Clear and start over",
        destructive: true,
      });
      if (!ok) return;
    }
    resetThread();
    textareaRef.current?.focus();
  }, [confirm, resetThread]);

  const handleModeChange = useCallback(
    async (mode: GenerateMode) => {
      if (mode === settings.mode) return;
      if (messagesRef.current.length > 0) {
        const ok = await confirm({
          title: `Switch to ${mode === "multi-turn" ? "multi-turn" : "single-turn"}?`,
          description: "Switching modes clears the current conversation and its images.",
          confirmText: "Switch and clear",
          destructive: true,
        });
        if (!ok) return;
      }
      resetThread();
      updateSettings({ mode });
    },
    [confirm, resetThread, settings.mode, updateSettings]
  );

  // ── Reference images ────────────────────────────────────────────────────────
  const addAttachments = useCallback(async (items: { blob: Blob; name: string }[]) => {
    const room = MAX_REFERENCE_IMAGES - attachmentsRef.current.length;
    if (room <= 0) {
      setError({ message: `Up to ${MAX_REFERENCE_IMAGES} reference images per message.`, retry: false });
      return;
    }
    const problems: string[] = [];
    const added: Attachment[] = [];
    for (const item of items.slice(0, room)) {
      try {
        const d = await describeImage(item.blob, item.name);
        added.push({ id: newId(), name: item.name, thumb: d.thumb, width: d.width, height: d.height, blob: item.blob });
      } catch (err) {
        problems.push(err instanceof ImagePrepError ? err.message : `Couldn't read "${item.name}".`);
      }
    }
    if (items.length > room) {
      problems.push(`Only ${MAX_REFERENCE_IMAGES} reference images per message — the rest were skipped.`);
    }
    if (added.length) setAttachments((prev) => [...prev, ...added].slice(0, MAX_REFERENCE_IMAGES));
    if (problems.length) setError({ message: problems.join(" "), retry: false });
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/") || f.type === "");
      if (!images.length) {
        if (files.length) setError({ message: "Only image files can be attached.", retry: false });
        return;
      }
      void addAttachments(images.map((f) => ({ blob: f, name: f.name || "image" })));
    },
    [addAttachments]
  );

  // ── Generate ────────────────────────────────────────────────────────────────
  /**
   * The newest generated image this browser still has (memory, else
   * IndexedDB) — a turn that restarts continues from it when the latest one
   * is gone.
   */
  const newestStoredImage = useCallback(async (): Promise<string | null> => {
    const ids: string[] = [];
    for (const m of messagesRef.current) {
      if (m.role === "assistant") for (const img of m.images ?? []) ids.push(img.id);
    }
    ids.reverse();
    const absent = ids.filter((id) => !blobsRef.current.has(id));
    const found = absent.length ? await getImages(absent) : new Map<string, Blob>();
    found.forEach((blob, id) => blobsRef.current.set(id, blob));
    if (found.size) rerender();
    return ids.find((id) => blobsRef.current.has(id)) ?? null;
  }, []);

  /** `retryPrompt`: re-send a failed turn (the composer is left as it is). */
  const submit = useCallback(
    async (retryPrompt?: string) => {
      const prompt = (retryPrompt ?? input).trim();
      if (!prompt || isPending || prompt.length > MAX_PROMPT_CHARS) return;

      const turn = effectiveSettings(settings);
      const sent = attachments;
      // Multi-turn continuity: an explicit branch, else the live server
      // conversation (same model), else restart from the latest image.
      let conversationId: string | null = null;
      let baseId: string | null = null;
      if (turn.mode === "multi-turn") {
        if (baseImageId) baseId = baseImageId;
        else if (conversation && conversation.model === turn.model) conversationId = conversation.id;
        else if (latestImageId) baseId = latestImageId;
      }

      const userMsg: GenerateMessage = {
        id: newId(),
        role: "user",
        text: prompt,
        createdAt: Date.now(),
        settings: turn,
        refThumbs: sent.map((a) => a.thumb),
        baseImageId: baseId,
      };
      setError(null);
      setNotice(null);
      setMessages((prev) => [...prev, userMsg]);
      if (retryPrompt === undefined) {
        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setPending({ startedAt: Date.now(), stage: sent.length || baseId ? "preparing" : "generating", settings: turn });

      let restartNote: string | null = null;
      const restartFrom = (id: string | null) => {
        baseId = id;
        setMessages((prev) => prev.map((m) => (m.id === userMsg.id ? { ...m, baseImageId: id } : m)));
      };
      const run = async (convId: string | null, base: string | null): Promise<GenerateResult> => {
        // All images of one request share Vercel's 4.5 MB body cap.
        const budget = perImageBudget(sent.length + (base ? 1 : 0));
        const form = new FormData();
        form.set("prompt", prompt);
        form.set("model", turn.model);
        form.set("mode", turn.mode);
        form.set("resolution", turn.resolution);
        if (turn.aspectRatio) form.set("aspectRatio", turn.aspectRatio);
        form.set("search", turn.search ? "1" : "0");
        if (convId) form.set("conversationId", convId);
        if (base) {
          const blob = blobsRef.current.get(base);
          if (blob) {
            const prepared = await prepareForUpload(blob, budget, "image");
            form.append("baseImage", prepared.blob, "base-image");
          } else {
            restartNote = "The image to continue from is no longer stored in this browser, so this started fresh.";
          }
        }
        for (const a of sent) {
          const prepared = await prepareForUpload(a.blob, budget, a.name);
          form.append("image", prepared.blob, a.name);
        }
        setPending((p) => p && { ...p, stage: "generating" });
        const res = await fetch("/api/generate", { method: "POST", body: form, signal: controller.signal });
        return readGenerateResponse(res, (event) => {
          if (event.type === "status") setPending((p) => p && { ...p, stage: event.stage });
        });
      };

      try {
        // Restarting from the latest image, but its bytes are gone: use the
        // newest one this browser still has (none → run() starts fresh).
        if (baseId && baseId === latestImageId && !blobsRef.current.has(baseId)) {
          const id = await newestStoredImage();
          if (id && id !== baseId) {
            restartNote = "The latest image is no longer stored in this browser, so this turn continued from the newest one that is.";
            restartFrom(id);
          }
        }

        let result: GenerateResult;
        try {
          result = await run(conversationId, baseId);
        } catch (err) {
          // The server no longer holds the conversation (idle timeout, another
          // instance, a deploy) or is still finishing a stopped turn on it —
          // continue once from the latest image instead, as a new conversation.
          const lost =
            err instanceof GenerateRequestError &&
            (err.code === "conversation_expired" || err.code === "conversation_busy");
          if (!lost || !conversationId || controller.signal.aborted) throw err;
          setConversation(null);
          const id = await newestStoredImage();
          const why =
            err.code === "conversation_busy"
              ? "The server was still finishing your previous message"
              : "The server had closed this conversation";
          restartNote = id
            ? `${why}, so this turn continued from ${id === latestImageId ? "your latest image" : "the newest image still stored in this browser"} — earlier turns aren't in its context.`
            : latestImageId
              ? `${why} and its images are no longer stored in this browser, so this started fresh.`
              : null;
          restartFrom(id);
          result = await run(null, id);
        }

        const refs: ImageRef[] = [];
        for (const img of result.images) {
          const blob = await base64ToBlob(img.data, img.mimeType);
          const id = newId();
          blobsRef.current.set(id, blob);
          void putImage(id, blob).then((stored) => {
            if (stored || storageWarned) return;
            storageWarned = true;
            toast(
              "This browser couldn't store the images, so they won't survive a reload. Download anything you want to keep.",
              "error"
            );
          });
          refs.push({ id, mimeType: img.mimeType, bytes: blob.size, ...((await readBlobImageSize(blob)) ?? {}) });
        }
        const applied: GenerateSettings = {
          ...turn,
          resolution: (result.imageSize as GenerateSettings["resolution"] | null) ?? turn.resolution,
          aspectRatio: result.aspectRatio,
        };
        const reply: GenerateMessage = {
          id: newId(),
          role: "assistant",
          text: result.text,
          createdAt: Date.now(),
          images: refs,
          notice: [restartNote, result.notice].filter(Boolean).join(" ") || null,
          sources: result.sources,
        };
        setMessages((prev) => [...prev.map((m) => (m.id === userMsg.id ? { ...m, settings: applied } : m)), reply]);
        if (turn.mode === "multi-turn") {
          setConversation(result.conversationId ? { id: result.conversationId, model: turn.model } : null);
        }
        const sentIds = new Set(sent.map((a) => a.id));
        setAttachments((prev) => prev.filter((a) => !sentIds.has(a.id)));
        setBaseImageId((b) => (b === baseImageId ? null : b));
      } catch (err) {
        // Put the turn back in the composer — unless something new was typed
        // meanwhile (Retry still sends the failed prompt).
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        const current = inputRef.current.trim();
        const restored = !current || current === prompt;
        if (restored) setInput(prompt);
        // Don't continue a conversation that may hold a turn this thread
        // never showed — the next turn restarts from the latest image.
        if (outcomeUnknown(err, controller.signal.aborted)) setConversation(null);
        if (controller.signal.aborted) setNotice(restored ? "Stopped. Your prompt is back in the box." : "Stopped.");
        else setError({ ...describeFailure(err), prompt });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setPending(null);
      }
    },
    [
      input,
      isPending,
      settings,
      attachments,
      baseImageId,
      conversation,
      latestImageId,
      setMessages,
      setConversation,
      newestStoredImage,
      toast,
    ]
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // ── Image actions ───────────────────────────────────────────────────────────
  const download = useCallback(
    (image: ImageRef, prompt: string | null, index: number) => {
      const url = urlFor(image.id);
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = imageFileName(prompt, image.mimeType, new Date(), index);
      a.click();
    },
    [urlFor]
  );

  const copy = useCallback(
    async (image: ImageRef) => {
      const blob = blobsRef.current.get(image.id);
      if (!blob) return;
      if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
        toast("This browser can't copy images — use Download instead.", "error");
        return;
      }
      try {
        // A promise keeps Safari's user-gesture check happy while we convert to PNG.
        await navigator.clipboard.write([new ClipboardItem({ "image/png": toPng(blob) })]);
        toast("Image copied to the clipboard.", "success");
      } catch {
        toast("Couldn't copy the image — use Download instead.", "error");
      }
    },
    // `toast` is stable (toastError/toastSuccess aren't) — keeps `actions`, and the memoized thread, steady.
    [toast]
  );

  const actions: ImageActions = useMemo(
    () => ({
      urlFor,
      onOpen: (image, prompt) => {
        setLightbox({ image, prompt });
        setLightboxOpen(true);
      },
      onDownload: download,
      onCopy: (image) => void copy(image),
      onUseAsReference: (image) => {
        const blob = blobsRef.current.get(image.id);
        if (!blob) return;
        const ext = image.mimeType.split("/")[1] ?? "png";
        void addAttachments([{ blob, name: `generated-image.${ext === "jpeg" ? "jpg" : ext}` }]);
        textareaRef.current?.focus();
      },
      onEditFrom:
        settings.mode === "multi-turn"
          ? (image) => {
              setBaseImageId(image.id);
              textareaRef.current?.focus();
            }
          : null,
      onImageLoad: () => {
        if (stickToBottom.current) scrollToBottom();
      },
    }),
    [urlFor, download, copy, addAttachments, settings.mode, scrollToBottom]
  );

  const handleStarter = useCallback((p: string) => {
    setInput(p);
    textareaRef.current?.focus();
  }, []);

  // ── Drag & drop (on the thread card — no window listeners) ──────────────────
  const dragHandlers = {
    onDragEnter: (e: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
  };

  // ── Header status ───────────────────────────────────────────────────────────
  const imageCount = useMemo(() => messages.reduce((n, m) => n + (m.images?.length ?? 0), 0), [messages]);
  const status: { tone: BadgeTone; label: string } = (() => {
    if (settings.mode === "single-turn") return { tone: "neutral", label: "Single-turn · each prompt stands alone" };
    if (baseImageId) return { tone: "info", label: "Branching from an earlier image" };
    if (conversation && conversation.model === settings.model) return { tone: "success", label: "Conversation active" };
    if (latestImageId && conversation) return { tone: "info", label: "Model changed · continues from the latest image" };
    if (latestImageId) return { tone: "neutral", label: "Continues from the latest image" };
    return { tone: "neutral", label: "Multi-turn · ready" };
  })();

  const placeholder =
    settings.mode === "multi-turn" && (latestImageId || baseImageId)
      ? "Describe how to change the image…"
      : attachments.length
        ? "Describe what to do with your images…"
        : "Describe the image to generate…";

  const lightboxImage = lightbox?.image ?? null;

  return (
    <div
      ref={rootRef}
      onScroll={trackStick}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:flex-row lg:gap-4 lg:overflow-visible"
    >
      <GenerateSettingsCard
        settings={settings}
        onChange={updateSettings}
        onModeChange={(mode) => void handleModeChange(mode)}
        pending={isPending}
      />

      <Card
        className="relative flex shrink-0 flex-col overflow-visible lg:min-h-0 lg:flex-1 lg:shrink lg:overflow-hidden"
        {...dragHandlers}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {imageCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {imageCount} image{imageCount === 1 ? "" : "s"}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-label="New conversation"
            onClick={() => void handleNewConversation()}
            disabled={isPending || (messages.length === 0 && attachments.length === 0 && !baseImageId)}
          >
            <MessageSquarePlus />
            <span className="hidden sm:inline">New conversation</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>

        <div
          ref={scrollRef}
          onScroll={trackStick}
          className="flex flex-col px-4 py-6 md:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        >
          <ImageThread
            messages={messages}
            pending={pending}
            active={active}
            latestImageId={latestImageId}
            missing={missing}
            actions={actions}
            onStarter={handleStarter}
            imagesVersion={imagesVersion}
          />
        </div>

        {error && (
          <div
            role="alert"
            className={cn("mx-3 mt-3 flex items-start gap-2 rounded-2xl border px-3 py-2 text-sm md:mx-4", badgeTone.danger)}
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1">{error.message}</p>
            {error.retry && error.prompt && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => void submit(error.prompt)}
                disabled={isPending}
              >
                Retry
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setError(null)}>
              <X />
            </Button>
          </div>
        )}
        {notice && !error && (
          <div
            role="status"
            className="mx-3 mt-3 flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm text-muted-foreground md:mx-4"
          >
            <Info className="size-4 shrink-0" />
            <p className="min-w-0 flex-1">{notice}</p>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setNotice(null)}>
              <X />
            </Button>
          </div>
        )}

        <PromptComposer
          value={input}
          onChange={setInput}
          onSubmit={() => void submit()}
          onStop={stop}
          pending={isPending}
          maxChars={MAX_PROMPT_CHARS}
          placeholder={placeholder}
          attachments={attachments}
          onAddFiles={addFiles}
          onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
          baseImage={
            baseImageId && settings.mode === "multi-turn"
              ? { url: urlFor(baseImageId), label: "Continuing from this image" }
              : null
          }
          onClearBaseImage={() => setBaseImageId(null)}
          textareaRef={textareaRef}
        />

        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-foreground/20 bg-background/85 text-sm font-medium backdrop-blur-sm">
            <Upload className="size-5 text-muted-foreground" />
            Drop images to use as references
          </div>
        )}
      </Card>

      {dialog}
      {lightbox && (
        <ImageLightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          url={lightboxImage ? urlFor(lightboxImage.id) : null}
          alt={lightbox?.prompt ? lightbox.prompt.slice(0, 160) : "Generated image"}
          meta={
            lightboxImage
              ? [
                  formatLabel(lightboxImage.mimeType),
                  lightboxImage.width && lightboxImage.height ? `${lightboxImage.width}×${lightboxImage.height}` : null,
                  formatBytes(lightboxImage.bytes),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : ""
          }
          onDownload={() => lightboxImage && download(lightboxImage, lightbox?.prompt ?? null, 0)}
          onCopy={() => lightboxImage && void copy(lightboxImage)}
        />
      )}
    </div>
  );
}
