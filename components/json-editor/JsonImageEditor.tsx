"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Braces,
  Loader2,
  Wand2,
  Sparkles,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  GEMINI_IMAGE_MODELS,
  type GeminiImageModelId,
} from "@/lib/geminiModels";
import type { UseCase } from "@/lib/jsonEditorPrompts";

import { UseCaseSelector, USE_CASES } from "./UseCaseSelector";
import { ImageUploader } from "./ImageUploader";
import { JsonEditor } from "./JsonEditor";
import { ResultPanel } from "./ResultPanel";

// ─── Model picker (reused pattern from ImageGenerator) ─────────────────────

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
        aria-label="Select Gemini model"
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors w-full",
          open
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
          disabled && "cursor-not-allowed opacity-40",
        )}
      >
        <current.icon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{current.label}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg">
          {GEMINI_IMAGE_MODELS.map((m) => {
            const Icon = m.icon;
            const isActive = m.id === model;
            return (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted",
                  isActive && "bg-primary/5",
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

// ─── Main component ──────────────────────────────────────────────────────────

export function JsonImageEditor() {
  // ── State ────────────────────────────────────────────────────────────────
  const [useCase, setUseCase] = useState<UseCase | null>(null);
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [sourcePreview, setSourcePreview] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);

  const [sourceJson, setSourceJson] = useState("");
  const [editedJson, setEditedJson] = useState("");
  const [referenceJson, setReferenceJson] = useState("");

  const [editorTab, setEditorTab] = useState<"source" | "reference">("source");

  const [resultImage, setResultImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiModel, setGeminiModel] = useState<GeminiImageModelId>("gemini-3.1-flash-image-preview");

  // AbortController for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  const selectedUseCase = USE_CASES.find((uc) => uc.id === useCase);
  const requiresReference = selectedUseCase?.requiresReference ?? false;

  const isBusy = isAnalyzing || isGenerating;
  const hasSourceJson = sourceJson.trim().length > 0;
  const hasEdits = editedJson !== sourceJson;

  let editedJsonValid = false;
  if (editedJson.trim()) {
    try {
      JSON.parse(editedJson);
      editedJsonValid = true;
    } catch {
      // invalid
    }
  }

  const canAnalyze = useCase && sourceImage && !isBusy;
  const canGenerate = useCase && sourceImage && hasSourceJson && hasEdits && editedJsonValid && !isBusy;

  // ── Cleanup object URLs on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Revoke old preview URL when it changes
  const prevSourcePreview = useRef<string | null>(null);
  const prevRefPreview = useRef<string | null>(null);

  useEffect(() => {
    if (prevSourcePreview.current && prevSourcePreview.current !== sourcePreview) {
      URL.revokeObjectURL(prevSourcePreview.current);
    }
    prevSourcePreview.current = sourcePreview;
  }, [sourcePreview]);

  useEffect(() => {
    if (prevRefPreview.current && prevRefPreview.current !== referencePreview) {
      URL.revokeObjectURL(prevRefPreview.current);
    }
    prevRefPreview.current = referencePreview;
  }, [referencePreview]);

  // Final cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevSourcePreview.current) URL.revokeObjectURL(prevSourcePreview.current);
      if (prevRefPreview.current) URL.revokeObjectURL(prevRefPreview.current);
    };
  }, []);

  // ── Analyze (Claude vision → JSON) ─────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!useCase || !sourceImage) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsAnalyzing(true);
    setError(null);
    setResultImage(null);
    setResultText(null);

    try {
      const sourceForm = new FormData();
      sourceForm.append("image", sourceImage);
      sourceForm.append("useCase", useCase);
      sourceForm.append("imageRole", "source");

      const sourceRes = fetch("/api/json-editor/analyze", {
        method: "POST",
        body: sourceForm,
        signal: controller.signal,
      });

      let referenceRes: Promise<Response> | null = null;
      if (requiresReference && referenceImage) {
        const refForm = new FormData();
        refForm.append("image", referenceImage);
        refForm.append("useCase", useCase);
        refForm.append("imageRole", "reference");
        referenceRes = fetch("/api/json-editor/analyze", {
          method: "POST",
          body: refForm,
          signal: controller.signal,
        });
      }

      const sRes = await sourceRes;
      if (!sRes.ok) {
        const data = await sRes.json();
        throw new Error(data.error || "Analysis failed");
      }
      const sData = await sRes.json();

      if (controller.signal.aborted) return;

      setSourceJson(sData.json);
      setEditedJson(sData.json);

      if (referenceRes) {
        const rRes = await referenceRes;
        if (!rRes.ok) {
          const data = await rRes.json();
          throw new Error(data.error || "Reference analysis failed");
        }
        const rData = await rRes.json();
        if (!controller.signal.aborted) {
          setReferenceJson(rData.json);
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  }, [useCase, sourceImage, requiresReference, referenceImage]);

  // ── Generate (Gemini: JSON + image → modified image) ───────────────────
  const handleGenerate = useCallback(async () => {
    if (!useCase || !sourceImage || !editedJson || !sourceJson) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("image", sourceImage);
      form.append("originalJson", sourceJson);
      form.append("modifiedJson", editedJson);
      form.append("useCase", useCase);
      form.append("model", geminiModel);

      if (requiresReference && referenceImage) {
        form.append("referenceImage", referenceImage);
      }

      const res = await fetch("/api/json-editor/generate", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const data = await res.json();
      if (!controller.signal.aborted) {
        setResultImage({ base64: data.imageBase64, mimeType: data.mimeType });
        setResultText(data.text || null);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, [useCase, sourceImage, sourceJson, editedJson, geminiModel, requiresReference, referenceImage]);

  // ── Start over ─────────────────────────────────────────────────────────
  const handleStartOver = useCallback(() => {
    abortRef.current?.abort();
    setUseCase(null);
    setSourceImage(null);
    setSourcePreview(null);
    setReferenceImage(null);
    setReferencePreview(null);
    setSourceJson("");
    setEditedJson("");
    setReferenceJson("");
    setEditorTab("source");
    setResultImage(null);
    setResultText(null);
    setError(null);
  }, []);

  const handleEditAndRegenerate = useCallback(() => {
    setResultImage(null);
    setResultText(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full flex-col md:flex-row">
      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <div className="flex w-full md:w-72 flex-none flex-col border-b md:border-b-0 md:border-r border-border bg-background overflow-y-auto md:max-h-full max-h-[40vh]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Braces className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">JSON Editor</h2>
        </div>

        <div className="flex-1 flex flex-col gap-4 p-4">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              1. Select Use Case
            </div>
            <UseCaseSelector
              selected={useCase}
              onSelect={(uc) => {
                setUseCase(uc);
                setSourceJson("");
                setEditedJson("");
                setReferenceJson("");
                setResultImage(null);
                setResultText(null);
                setError(null);
              }}
              disabled={isBusy}
            />
          </div>

          {useCase && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">
                2. Upload Images
              </div>
              <div className="space-y-3">
                <ImageUploader
                  image={sourceImage}
                  preview={sourcePreview}
                  onImageChange={(file, preview) => {
                    setSourceImage(file);
                    setSourcePreview(preview);
                    setSourceJson("");
                    setEditedJson("");
                    setResultImage(null);
                    setResultText(null);
                  }}
                  label="Source Image"
                  required
                  disabled={isBusy}
                />

                {requiresReference && (
                  <ImageUploader
                    image={referenceImage}
                    preview={referencePreview}
                    onImageChange={(file, preview) => {
                      setReferenceImage(file);
                      setReferencePreview(preview);
                      setReferenceJson("");
                      setResultImage(null);
                      setResultText(null);
                    }}
                    label="Reference Image"
                    disabled={isBusy}
                  />
                )}
              </div>
            </div>
          )}

          {useCase && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Gemini Model
              </div>
              <ModelPicker
                model={geminiModel}
                onChange={setGeminiModel}
                disabled={isBusy}
              />
            </div>
          )}

          {useCase && (
            <div className="space-y-2 mt-auto pt-4">
              <button
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                  canAnalyze
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {hasSourceJson ? "Re-analyze" : "Analyze Image"}
                  </>
                )}
              </button>

              {hasSourceJson && (
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className={cn(
                    "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                    canGenerate
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed",
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      Generate Image
                    </>
                  )}
                </button>
              )}

              {!hasEdits && hasSourceJson && (
                <p className="text-[10px] text-muted-foreground text-center">
                  Edit the JSON to enable generation
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Center: JSON editor ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {referenceJson && (
          <div className="flex border-b border-border bg-muted/20">
            <button
              onClick={() => setEditorTab("source")}
              className={cn(
                "px-4 py-2 text-xs font-medium transition-colors border-b-2",
                editorTab === "source"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Scene JSON
            </button>
            <button
              onClick={() => setEditorTab("reference")}
              className={cn(
                "px-4 py-2 text-xs font-medium transition-colors border-b-2",
                editorTab === "reference"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Reference JSON
            </button>
          </div>
        )}

        {hasSourceJson ? (
          editorTab === "source" || !referenceJson ? (
            <JsonEditor
              value={editedJson}
              onChange={setEditedJson}
              originalValue={sourceJson}
              label="Edited JSON"
            />
          ) : (
            <JsonEditor
              value={referenceJson}
              onChange={setReferenceJson}
              label="Reference JSON"
              readOnly
            />
          )
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-8">
              <div className="flex justify-center mb-4">
                <div className="rounded-2xl bg-primary/10 p-4">
                  <Braces className="h-8 w-8 text-primary" />
                </div>
              </div>
              <h3 className="text-base font-semibold mb-2">JSON Image Editor</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {!useCase
                  ? "Select a use case to get started. Upload an image and analyze it to get a structured JSON breakdown that you can edit for precise image modifications."
                  : !sourceImage
                    ? "Upload a source image, then click Analyze to generate a JSON breakdown."
                    : "Click Analyze to generate a JSON breakdown of your image."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel: images (visible on md+) ─────────────────────────── */}
      <div className="w-full md:w-80 flex-none border-t md:border-t-0 md:border-l border-border bg-background p-4 overflow-y-auto hidden md:flex md:flex-col">
        <ResultPanel
          sourcePreview={sourcePreview}
          resultImage={resultImage}
          resultText={resultText}
          onEditAndRegenerate={handleEditAndRegenerate}
          onStartOver={handleStartOver}
        />
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 backdrop-blur-sm px-4 py-2.5 text-sm text-destructive shadow-lg max-w-lg">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
