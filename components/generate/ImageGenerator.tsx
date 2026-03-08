"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  ImageIcon,
  Upload,
  X,
  Trash2,
  Download,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GEMINI_IMAGE_MODELS, type GeminiImageModelId, type GenerateMode } from "@/lib/geminiModels";
import { useImageGeneratorSession } from "@/hooks/useImageGeneratorSession";

const MAX_UPLOAD_FILES = 4;
const ALLOWED_TYPES    = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_BYTES   = 10 * 1024 * 1024;

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenerateMessage {
  id: string;
  role: "user" | "assistant";
  text: string | null;
  imageBase64: string | null;
  mimeType: string | null;
}

// ─── Model picker ─────────────────────────────────────────────────────────────

function ModelPicker({
  model,
  onChange,
  disabled,
}: {
  model: GeminiImageModelId;
  onChange: (id: GeminiImageModelId) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = GEMINI_IMAGE_MODELS.find((m) => m.id === model)!;

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
          open
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground",
          disabled && "cursor-not-allowed opacity-40"
        )}
      >
        <current.icon className="h-3 w-3" />
        {current.label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-xl border border-border bg-popover shadow-lg">
          <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Model
          </p>
          {GEMINI_IMAGE_MODELS.map((m) => {
            const Icon = m.icon;
            const isActive = m.id === model;
            return (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors last:rounded-b-xl hover:bg-muted",
                  isActive && "bg-primary/5"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-xs font-medium", isActive ? "text-primary" : "text-foreground")}>{m.label}</p>
                  <p className="text-[10px] text-muted-foreground">{m.description}</p>
                </div>
                {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  "Generate a cinematic sunset over mountain peaks",
  "Create a minimal product photo on white background",
  "Design a vibrant abstract gradient artwork",
  "Make a professional portrait with studio lighting",
];

function EmptyState({ onPrompt }: { onPrompt: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
        <ImageIcon className="h-6 w-6 text-primary" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">Image Generator</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-xs">
          Describe what you want to create, or upload images to use as references.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onPrompt(prompt)}
            className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-left text-xs text-foreground/80 hover:bg-muted hover:text-foreground transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: GenerateMessage }) {
  const isUser = msg.role === "user";
  const dataUrl = msg.imageBase64 && msg.mimeType
    ? `data:${msg.mimeType};base64,${msg.imageBase64}`
    : null;

  function handleDownload() {
    if (!dataUrl) return;
    const ext = (msg.mimeType ?? "image/png").split("/")[1] ?? "png";
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `generated-image-${Date.now()}.${ext}`;
    a.click();
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {msg.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] min-w-[200px] rounded-2xl rounded-tl-sm border border-border bg-muted/30 overflow-hidden">
        {dataUrl && (
          <div className="relative group">
            <img
              src={dataUrl}
              alt="Generated image"
              className="block w-full object-contain"
              style={{ maxHeight: "520px" }}
            />
            {/* Hover overlay download */}
            <div className="absolute inset-0 flex items-end justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/40 to-transparent">
              <button
                onClick={handleDownload}
                title="Download full-quality image"
                className="flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-gray-900 shadow hover:bg-white transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          </div>
        )}
        {msg.text && (
          <p className="px-4 py-3 text-sm text-foreground/80">{msg.text}</p>
        )}
        {dataUrl && (
          <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
              {(msg.mimeType ?? "image/png").split("/")[1]?.toUpperCase()}
            </span>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Download className="h-3 w-3" />
              Download full quality
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function AssistantSkeleton() {
  return (
    <div className="flex justify-start">
      <div className="w-64 rounded-2xl rounded-tl-sm border border-border bg-muted/30 overflow-hidden">
        <div className="h-48 bg-muted animate-pulse" />
        <div className="px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generating…
        </div>
      </div>
    </div>
  );
}

// ─── Upload preview grid ──────────────────────────────────────────────────────

function UploadGrid({
  files,
  previews,
  onRemove,
  onAdd,
  onDrop,
  fileInputRef,
  mode,
}: {
  files: File[];
  previews: string[];
  onRemove: (idx: number) => void;
  onAdd: () => void;
  onDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  mode: GenerateMode;
}) {
  const canAdd = files.length < MAX_UPLOAD_FILES;
  const required = false;

  return (
    <div className="space-y-2">
      {/* Thumbnails */}
      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {previews.map((url, idx) => (
            <div key={idx} className="relative rounded-lg overflow-hidden border border-border aspect-square bg-muted">
              <img src={url} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => onRemove(idx)}
                className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                title="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {/* Add more slot */}
          {canAdd && (
            <button
              onClick={onAdd}
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 aspect-square text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
            >
              <Upload className="h-4 w-4" />
              <span className="text-[9px] mt-0.5">Add</span>
            </button>
          )}
        </div>
      )}

      {/* Drop zone (shown when empty) */}
      {previews.length === 0 && (
        <div
          onClick={onAdd}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/20 px-3 py-5 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors"
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            {required ? "Upload reference image(s)" : "Optional reference images"}<br />
            <span className="text-[10px]">Up to {MAX_UPLOAD_FILES} · JPEG PNG WebP GIF · max 10 MB each</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ImageGenerator() {
  const {
    messages, setMessages,
    conversationId, setConversationId,
    mode, setMode,
    model, setModel,
    resolution, setResolution,
    clearSession,
  } = useImageGeneratorSession();
  const [input, setInput]     = useState("");
  const [uploadedFiles, setUploadedFiles]     = useState<File[]>([]);
  const [uploadedPreviews, setUploadedPreviews] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Manage object URLs for all previews
  useEffect(() => {
    const urls = uploadedFiles.map((f) => URL.createObjectURL(f));
    setUploadedPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [uploadedFiles]);

  function validateAndAddFiles(incoming: File[]) {
    const errors: string[] = [];
    const valid: File[] = [];
    const remaining = MAX_UPLOAD_FILES - uploadedFiles.length;

    for (const file of incoming.slice(0, remaining)) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`"${file.name}" is not a supported image type.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(`"${file.name}" exceeds 10 MB.`);
        continue;
      }
      valid.push(file);
    }

    if (errors.length) setError(errors.join(" "));
    else setError(null);

    if (valid.length) setUploadedFiles((prev) => [...prev, ...valid]);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    validateAndAddFiles(Array.from(e.dataTransfer.files));
  }

  function handleRemoveFile(idx: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleModeSwitch(newMode: GenerateMode) {
    if (newMode === mode) return;
    if (messages.length > 0) {
      if (!confirm("Switching modes will clear your conversation. Continue?")) return;
    }
    setMode(newMode);
    setMessages([]);
    setConversationId(null);
    setUploadedFiles([]);
    setError(null);
  }

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setError(null);
    setIsLoading(true);

    const userMsg: GenerateMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      imageBase64: null,
      mimeType: null,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const formData = new FormData();
      formData.set("model", model);
      formData.set("mode", mode);
      formData.set("prompt", trimmed);
      formData.set("resolution", resolution);

      // For multi-turn, pass the conversationId so the server can resume
      // the same chat object (which holds full history + image context internally).
      if (mode === "multi-turn" && conversationId) {
        formData.set("conversationId", conversationId);
      }

      // Optional uploaded reference images
      for (const file of uploadedFiles) {
        formData.append("image", file);
      }

      const res  = await fetch("/api/generate", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      // Store the conversationId returned on the first multi-turn request
      if (data.conversationId) setConversationId(data.conversationId);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: data.text ?? null,
          imageBase64: data.imageBase64 ?? null,
          mimeType: data.mimeType ?? null,
        },
      ]);

      // Clear uploaded files after every successful turn.
      // In multi-turn, the chat object on the server already holds full history
      // (including generated images with thought_signature), so re-sending the
      // same files on the next turn would inject stale data and corrupt context.
      // If the user explicitly uploads NEW files before the next turn, those will
      // be fresh entries in uploadedFiles and will be included correctly.
      setUploadedFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setInput(trimmed);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, mode, model, resolution, uploadedFiles, conversationId]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  const canSubmit = !!input.trim() && !isLoading;

  return (
    <div className="flex h-full w-full">
      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-r border-border flex flex-col overflow-y-auto">
        {/* Mode toggle */}
        <div className="p-4 border-b border-border">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Mode</p>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            <button
              onClick={() => handleModeSwitch("multi-turn")}
              className={cn(
                "flex-1 py-1.5 transition-colors",
                mode === "multi-turn"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Multi-turn
            </button>
            <button
              onClick={() => handleModeSwitch("single-turn")}
              className={cn(
                "flex-1 py-1.5 border-l border-border transition-colors",
                mode === "single-turn"
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Single-turn
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
            {mode === "multi-turn"
              ? "Iteratively refine images through conversation. Each reply edits the last result."
              : "Upload reference image(s) + describe changes → one-shot result."}
          </p>
        </div>

        {/* Resolution toggle */}
        <div className="p-4 border-b border-border">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Resolution</p>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            {(["2K", "4K"] as const).map((r, i) => (
              <button
                key={r}
                onClick={() => setResolution(r)}
                className={cn(
                  "flex-1 py-1.5 transition-colors",
                  i > 0 && "border-l border-border",
                  resolution === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground leading-relaxed">
            Applies to Gemini models only. Imagen 3 uses aspect ratio sizing.
          </p>
        </div>

        {/* Image upload */}
        <div className="p-4 border-b border-border">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Reference Images (optional)
          </p>
          <UploadGrid
            files={uploadedFiles}
            previews={uploadedPreviews}
            onRemove={handleRemoveFile}
            onAdd={() => fileInputRef.current?.click()}
            onDrop={handleFileDrop}
            fileInputRef={fileInputRef}
            mode={mode}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              validateAndAddFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex-1" />

        {mode === "multi-turn" && messages.length > 0 && (
          <div className="p-4 border-t border-border">
            <button
              onClick={() => { if (confirm("Clear all messages?")) { clearSession(); setUploadedFiles([]); } }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-xs text-muted-foreground hover:border-destructive/50 hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear conversation
            </button>
          </div>
        )}
      </aside>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">Image Generator</span>
          </div>
          <ModelPicker model={model} onChange={setModel} disabled={isLoading} />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {messages.length === 0 && !isLoading ? (
            <EmptyState onPrompt={(text) => { setInput(text); textareaRef.current?.focus(); }} />
          ) : (
            <>
              {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
              {isLoading && <AssistantSkeleton />}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mb-2 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 opacity-70 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-primary/50 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === "multi-turn"
                  ? "Describe what to generate or how to refine the last image… (⌘+Enter)"
                  : "Describe the changes to apply to your uploaded image(s)… (⌘+Enter)"
              }
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
              style={{ maxHeight: "160px" }}
            />
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                canSubmit
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              title="Send (⌘+Enter)"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            Images generated by Google Gemini. Results may vary.
          </p>
        </div>
      </div>
    </div>
  );
}
