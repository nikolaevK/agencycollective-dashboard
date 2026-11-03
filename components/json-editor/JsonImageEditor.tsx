"use client";

import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlignLeft, Copy, Download, Loader2, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/use-confirm";
import { useToast } from "@/components/providers/ToastProvider";
import {
  DEFAULT_GEMINI_IMAGE_MODEL,
  clampImageSize,
  geminiImageModelInfo,
  type GeminiImageModelId,
  type GeminiImageSize,
} from "@/lib/geminiModels";
import { metaForUseCase, type ImageRole, type UseCase } from "@/lib/jsonEditor/useCases";
import { analysisSchema, fieldGuide } from "@/lib/jsonEditor/schemas";
import { diffJson, parseJsonObject, type JsonChange } from "@/lib/jsonEditor/diff";
import {
  applyPatch,
  applyReference,
  canApplyReference,
  presetsFor,
  swapTargets,
  type JsonPreset,
} from "@/lib/jsonEditor/presets";
import { DEFAULT_RESOLUTION } from "@/lib/jsonEditor/models";
import { describeHttpFailure } from "@/lib/jsonEditor/errors";
import { MAX_JSON_BYTES, MAX_PICK_BYTES, PICKABLE_IMAGE_TYPES, utf8ByteLength } from "@/lib/jsonEditor/images";

import { UseCaseSelector } from "./UseCaseSelector";
import { ImageUploader } from "./ImageUploader";
import { JsonEditor } from "./JsonEditor";
import { GeneratePanel, type ReferenceAction } from "./GeneratePanel";
import { ResultPanel, type GeneratedResult } from "./ResultPanel";
import { base64ToBlob, prepareImageForUpload } from "./prepareImage";

// ─── Types + helpers ────────────────────────────────────────────────────────

interface PickedImage {
  /** Object URL of the picked file (revoked when replaced / removed). */
  previewUrl: string;
  name: string;
  upload: File;
  width: number;
  height: number;
  optimized: boolean;
}

type Phase = "idle" | "analyzing" | "generating";
type EditorTab = "scene" | "reference";

/** Results kept per session; older ones are dropped (and their object URLs revoked). */
const MAX_RESULTS = 8;

class RequestFailure extends Error {}

/**
 * POSTs a form to a JSON Editor route; throws RequestFailure with a readable
 * message — also when a 2xx body lacks the string fields `expect` names
 * (e.g. a proxy's HTML page), so callers never get a null result.
 */
async function postForm<T>(
  url: string,
  form: FormData,
  signal: AbortSignal,
  fallback: string,
  expect: readonly string[]
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: form, signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new RequestFailure("Network error — check your connection and try again.");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Vercel's own 413 / 504 pages aren't JSON.
  }
  if (!res.ok) throw new RequestFailure(describeHttpFailure(res.status, body, fallback));
  const fields = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!fields || !expect.every((key) => typeof fields[key] === "string")) {
    throw new RequestFailure(`${fallback}: the server sent an unexpected response. Try again.`);
  }
  return body as T;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ErrorNote({ message, onDismiss, className }: { message: string; onDismiss: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-2xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive",
        className
      )}
    >
      <span className="min-w-0 flex-1">{message}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="text-destructive hover:bg-destructive/15 hover:text-destructive"
      >
        <X />
      </Button>
    </div>
  );
}

/** Seconds since `startedAt`, ticking only while `running` (hidden tabs don't tick). */
function useElapsedSeconds(startedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || startedAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);
  return startedAt === null ? 0 : Math.max(0, Math.round((now - startedAt) / 1000));
}

// ─── Main component ─────────────────────────────────────────────────────────

/** `active` = this tool's Creative Studio tab is showing (panels stay mounted while hidden). */
export function JsonImageEditor({ active = true }: { active?: boolean } = {}) {
  const { toastError, toastSuccess } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [useCase, setUseCase] = useState<UseCase | null>(null);
  const [source, setSource] = useState<PickedImage | null>(null);
  const [reference, setReference] = useState<PickedImage | null>(null);
  const [preparing, setPreparing] = useState<ImageRole | null>(null);
  const [imageErrors, setImageErrors] = useState<Partial<Record<ImageRole, string>>>({});

  /** The analysis: the baseline every change is measured against. */
  const [sourceJson, setSourceJson] = useState("");
  const [editedJson, setEditedJson] = useState("");
  const [referenceJson, setReferenceJson] = useState("");
  /** Bumped per analysis / source switch — resets per-analysis UI state. */
  const [analysisId, setAnalysisId] = useState(0);
  const [editorTab, setEditorTab] = useState<EditorTab>("scene");

  const [results, setResults] = useState<GeneratedResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  /** The last failure, shown next to the step that failed. */
  const [error, setError] = useState<{ message: string; step: "analyze" | "generate" } | null>(null);
  const [model, setModel] = useState<GeminiImageModelId>(DEFAULT_GEMINI_IMAGE_MODEL);
  const [resolution, setResolution] = useState<GeminiImageSize>(DEFAULT_RESOLUTION);

  const abortRef = useRef<AbortController | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  /** Last version number handed out — versions keep their number when older ones are dropped. */
  const versionSeqRef = useRef(0);
  const editorTabsId = useId();

  const meta = useCase ? metaForUseCase(useCase) : null;
  const requiresReference = meta?.requiresReference ?? false;
  const busy = phase !== "idle";
  const hasSourceJson = sourceJson.trim().length > 0;
  const elapsed = useElapsedSeconds(startedAt, busy && active);

  // ── Derived: validity + semantic diff (deferred so typing stays smooth) ──
  const deferredEdited = useDeferredValue(editedJson);
  const baseline = useMemo(() => parseJsonObject(sourceJson), [sourceJson]);
  const edited = useMemo(() => parseJsonObject(deferredEdited), [deferredEdited]);
  const editedLive = useMemo(() => parseJsonObject(editedJson), [editedJson]);
  const changes: JsonChange[] = useMemo(
    () => (baseline.ok && edited.ok ? diffJson(baseline.value, edited.value) : []),
    [baseline, edited]
  );
  const referenceParsed = useMemo(() => parseJsonObject(referenceJson), [referenceJson]);
  const effectiveSize = clampImageSize(model, resolution);

  const guide = useMemo(() => (useCase ? fieldGuide(analysisSchema(useCase, "source")) : []), [useCase]);
  const presets = useCase ? presetsFor(useCase) : [];

  // ── Object URLs: revoke everything we created on unmount ─────────────────
  const urlsRef = useRef(new Set<string>());
  const track = useCallback((url: string) => {
    urlsRef.current.add(url);
    return url;
  }, []);
  const release = useCallback((url: string | null | undefined) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    urlsRef.current.delete(url);
  }, []);
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      abortRef.current?.abort();
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  // ── Request lifecycle (one at a time; a stale request never flips state) ─
  const begin = useCallback((next: Exclude<Phase, "idle">) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase(next);
    setStartedAt(Date.now());
    setError(null);
    return controller;
  }, []);
  const finish = useCallback((controller: AbortController) => {
    if (abortRef.current !== controller) return;
    abortRef.current = null;
    setPhase("idle");
    setStartedAt(null);
  }, []);
  const cancel = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    finish(controller);
  }, [finish]);

  const hasEdits = hasSourceJson && editedJson !== sourceJson;
  const hasWork = hasSourceJson || results.length > 0;

  const confirmDiscardEdits = useCallback(
    async (title: string) =>
      !hasEdits ||
      (await confirm({
        title,
        description: "Your unsaved JSON edits will be replaced.",
        confirmText: "Continue",
        destructive: true,
      })),
    [confirm, hasEdits]
  );

  const clearAnalysis = useCallback(() => {
    setSourceJson("");
    setEditedJson("");
    setReferenceJson("");
    setEditorTab("scene");
    setAnalysisId((n) => n + 1);
  }, []);

  // ── Images ───────────────────────────────────────────────────────────────
  const setImage = useCallback(
    (role: ImageRole, next: PickedImage | null) => {
      const setter = role === "source" ? setSource : setReference;
      setter((prev) => {
        if (prev && prev.previewUrl !== next?.previewUrl) release(prev.previewUrl);
        return next;
      });
    },
    [release]
  );

  const pickImage = useCallback(
    async (role: ImageRole, file: File) => {
      setImageErrors((e) => ({ ...e, [role]: undefined }));
      if (!(PICKABLE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
        setImageErrors((e) => ({ ...e, [role]: "Use a PNG, JPEG, WebP or GIF image." }));
        return;
      }
      if (file.size > MAX_PICK_BYTES) {
        setImageErrors((e) => ({ ...e, [role]: "That file is over 25 MB." }));
        return;
      }
      if (role === "source" && !(await confirmDiscardEdits("Replace the source image?"))) return;
      setPreparing(role);
      try {
        const prepared = await prepareImageForUpload(file);
        setImage(role, {
          previewUrl: track(URL.createObjectURL(file)),
          name: file.name || "Pasted image",
          ...prepared,
        });
        // A new image invalidates what was analyzed from the old one.
        if (role === "source") clearAnalysis();
        else setReferenceJson("");
      } catch (err) {
        setImageErrors((e) => ({ ...e, [role]: errorText(err, "This image couldn't be read.") }));
      } finally {
        setPreparing(null);
      }
    },
    [clearAnalysis, confirmDiscardEdits, setImage, track]
  );

  const removeImage = useCallback(
    async (role: ImageRole) => {
      if (role === "source") {
        if (!(await confirmDiscardEdits("Remove the source image?"))) return;
        clearAnalysis();
      } else {
        setReferenceJson("");
        if (editorTab === "reference") setEditorTab("scene");
      }
      setImage(role, null);
      setImageErrors((e) => ({ ...e, [role]: undefined }));
    },
    [clearAnalysis, confirmDiscardEdits, editorTab, setImage]
  );

  // Paste an image from the clipboard into the first empty slot. Inert while
  // the tab is hidden, busy, or before a use case is picked.
  useEffect(() => {
    if (!active || !useCase || busy || preparing) return;
    function onPaste(e: ClipboardEvent) {
      // Text pasted into a field stays text, even when the clipboard also
      // carries an image rendering of it (spreadsheets, rich text).
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("textarea, input, [contenteditable='true']") && e.clipboardData?.types.includes("text/plain")) {
        return;
      }
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      const role: ImageRole | null = !source ? "source" : requiresReference && !reference ? "reference" : null;
      if (!role) {
        toastError("Remove an image first to paste a new one.");
        return;
      }
      e.preventDefault();
      void pickImage(role, file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [active, busy, pickImage, preparing, reference, requiresReference, source, toastError, useCase]);

  // ── Use case ─────────────────────────────────────────────────────────────
  const selectUseCase = useCallback(
    async (next: UseCase) => {
      if (next === useCase) return;
      if (!(await confirmDiscardEdits("Switch use case?"))) return;
      // A reference image means something else per use case (a camera to
      // copy vs. an object to swap in) — don't carry it into another role.
      if (metaForUseCase(next).referenceLabel !== meta?.referenceLabel) {
        setImage("reference", null);
        setImageErrors((e) => ({ ...e, reference: undefined }));
      }
      setUseCase(next);
      clearAnalysis();
      setError(null);
    },
    [clearAnalysis, confirmDiscardEdits, meta?.referenceLabel, setImage, useCase]
  );

  // ── Analyze (Claude vision → JSON) ───────────────────────────────────────
  const canAnalyze = !!useCase && !!source && !busy && !preparing && (useCase !== "object-swap" || !!reference);
  // A reference added after the scene was analyzed: describe just that image
  // (the scene JSON and its edits stay).
  const referenceOnly = hasSourceJson && requiresReference && !!reference && !referenceJson.trim();

  const handleAnalyze = useCallback(async () => {
    if (!useCase || !source) return;
    if (!referenceOnly && hasSourceJson && !(await confirmDiscardEdits("Analyze again?"))) return;
    const controller = begin("analyzing");

    const analyze = (image: File, role: ImageRole) => {
      const form = new FormData();
      form.append("image", image);
      form.append("useCase", useCase);
      form.append("imageRole", role);
      return postForm<{ json: string }>(
        "/api/json-editor/analyze",
        form,
        controller.signal,
        role === "source" ? "Analysis failed" : "Reference analysis failed",
        ["json"]
      );
    };

    try {
      const withReference = requiresReference && !!reference;
      const [scene, ref] = await Promise.allSettled([
        referenceOnly ? Promise.resolve(null) : analyze(source.upload, "source"),
        withReference ? analyze(reference!.upload, "reference") : Promise.resolve(null),
      ]);
      if (abortRef.current !== controller) return; // cancelled / superseded

      if (scene.status === "fulfilled" && scene.value) {
        setSourceJson(scene.value.json);
        setEditedJson(scene.value.json);
        setAnalysisId((n) => n + 1);
        setEditorTab("scene");
      }
      if (ref.status === "fulfilled") {
        if (ref.value || !referenceOnly) setReferenceJson(ref.value?.json ?? "");
      } else {
        setReferenceJson("");
      }

      const failed = [scene, ref].find((r) => r.status === "rejected" && !isAbort(r.reason));
      if (failed && failed.status === "rejected") {
        const prefix = failed === ref && scene.status === "fulfilled" ? "Reference image: " : "";
        setError({ message: prefix + errorText(failed.reason, "Analysis failed"), step: "analyze" });
      } else if (scene.status === "fulfilled" && scene.value) {
        requestAnimationFrame(() => editorRef.current?.focus({ preventScroll: true }));
      }
    } finally {
      finish(controller);
    }
  }, [
    begin,
    confirmDiscardEdits,
    finish,
    hasSourceJson,
    reference,
    referenceOnly,
    requiresReference,
    source,
    useCase,
  ]);

  // ── Generate (Gemini: JSON + image → edited image) ──────────────────────
  const editedValid = editedLive.ok;
  const blockedReason = !hasSourceJson
    ? "Analyze an image first."
    : !editedValid
      ? "Fix the JSON to generate."
      : changes.length === 0
        ? "Change at least one value in the JSON."
        : useCase === "object-swap" && !reference
          ? "Add the reference object image."
          : null;
  const canGenerate = !!useCase && !!source && !busy && !preparing && blockedReason === null;

  const handleGenerate = useCallback(async () => {
    if (!useCase || !source || !canGenerate) return;
    // The change list the server will compute from exactly these strings
    // (the on-screen list is deferred and can trail typing by a frame).
    const changeCount = editedLive.ok && baseline.ok ? diffJson(baseline.value, editedLive.value).length : 0;
    if (changeCount === 0) return;
    // Same per-document cap the route checks — fail here, before uploading the images.
    const sendsReferenceJson = requiresReference && !!reference && !!referenceJson.trim();
    const jsonDocs = sendsReferenceJson ? [sourceJson, editedJson, referenceJson] : [sourceJson, editedJson];
    if (jsonDocs.some((doc) => utf8ByteLength(doc) > MAX_JSON_BYTES)) {
      setError({
        message: `The JSON is too large to send (max ${MAX_JSON_BYTES / 1000} KB per document). Remove some entries and try again.`,
        step: "generate",
      });
      return;
    }
    const controller = begin("generating");
    try {
      const form = new FormData();
      form.append("image", source.upload);
      form.append("originalJson", sourceJson);
      form.append("modifiedJson", editedJson);
      form.append("useCase", useCase);
      form.append("model", model);
      form.append("resolution", resolution);
      if (requiresReference && reference) {
        form.append("referenceImage", reference.upload);
        if (sendsReferenceJson) form.append("referenceJson", referenceJson);
      }

      const data = await postForm<{
        imageBase64: string;
        mimeType: string;
        text: string | null;
        compressed?: boolean;
        model?: string;
        resolution?: string | null;
      }>("/api/json-editor/generate", form, controller.signal, "Generation failed", ["imageBase64", "mimeType"]);
      if (abortRef.current !== controller) return;

      const blob = base64ToBlob(data.imageBase64, data.mimeType);
      const result: GeneratedResult = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: track(URL.createObjectURL(blob)),
        // Compare against exactly what the model was given (the source may change later).
        sourceUrl: track(URL.createObjectURL(source.upload)),
        blob,
        mimeType: data.mimeType,
        text: data.text || null,
        compressed: !!data.compressed,
        modelLabel: geminiImageModelInfo(data.model ?? model).label,
        resolution: data.resolution ?? null,
        editedJson,
        changeCount,
        useCase,
        baselineId: analysisId,
        seq: ++versionSeqRef.current,
        createdAt: Date.now(),
      };
      setResults((prev) => {
        const next = [result, ...prev];
        next.slice(MAX_RESULTS).forEach((r) => {
          release(r.url);
          release(r.sourceUrl);
        });
        return next.slice(0, MAX_RESULTS);
      });
      setSelectedResultId(result.id);
    } catch (err) {
      if (!isAbort(err) && abortRef.current === controller) {
        setError({ message: errorText(err, "Generation failed"), step: "generate" });
      }
    } finally {
      finish(controller);
    }
  }, [
    analysisId,
    baseline,
    begin,
    canGenerate,
    editedJson,
    editedLive,
    finish,
    model,
    reference,
    referenceJson,
    release,
    requiresReference,
    resolution,
    source,
    sourceJson,
    track,
    useCase,
  ]);

  // ── Iterate on a result ──────────────────────────────────────────────────
  const continueFromResult = useCallback(
    async (result: GeneratedResult) => {
      if (busy) return;
      if (!(await confirmDiscardEdits("Edit this version?"))) return;
      setPreparing("source");
      try {
        const file = new File([result.blob], `version.${result.mimeType.split("/")[1] || "png"}`, {
          type: result.mimeType,
        });
        const prepared = await prepareImageForUpload(file);
        setImage("source", { previewUrl: track(URL.createObjectURL(file)), name: "Generated version", ...prepared });
        // The JSON that produced this image describes it: it's the new baseline.
        setSourceJson(result.editedJson);
        setEditedJson(result.editedJson);
        setEditorTab("scene");
        setAnalysisId((n) => n + 1);
        toastSuccess("This version is now the source — keep editing its JSON.");
      } catch (err) {
        toastError(errorText(err, "Couldn't use this image."));
      } finally {
        setPreparing(null);
      }
    },
    [busy, confirmDiscardEdits, setImage, toastError, toastSuccess, track]
  );

  const loadResultJson = useCallback(
    async (result: GeneratedResult) => {
      if (editedJson === result.editedJson) return;
      if (!(await confirmDiscardEdits("Load this version's JSON?"))) return;
      setEditedJson(result.editedJson);
      setEditorTab("scene");
    },
    [confirmDiscardEdits, editedJson]
  );

  // ── Quick edits ──────────────────────────────────────────────────────────
  const applyPreset = useCallback(
    (preset: JsonPreset) => {
      if (!editedLive.ok) return;
      setEditedJson(JSON.stringify(applyPatch(editedLive.value, preset.patch), null, 2));
      setEditorTab("scene");
    },
    [editedLive]
  );

  const referenceAction: ReferenceAction | null =
    useCase && canApplyReference(useCase) && referenceParsed.ok
      ? {
          label: useCase === "camera" ? "Copy camera from reference" : "Swap in reference object",
          targets: useCase === "object-swap" && editedLive.ok ? swapTargets(editedLive.value) : undefined,
          onApply: (targetIndex) => {
            if (!editedLive.ok || !referenceParsed.ok) return;
            const out = applyReference(useCase, editedLive.value, referenceParsed.value, targetIndex);
            if (!out.ok) {
              toastError(out.error);
              return;
            }
            setEditedJson(JSON.stringify(out.value, null, 2));
            setEditorTab("scene");
          },
        }
      : null;

  // ── Editor toolbar ───────────────────────────────────────────────────────
  const showingReference = editorTab === "reference" && !!referenceJson && hasSourceJson;
  const editorText = showingReference ? referenceJson : editedJson;
  /** "Analyze again" replaces the scene JSON when it lands — no typing into it meanwhile. */
  const sceneLocked = phase === "analyzing" && !referenceOnly;
  const showEditorTabs = !!referenceJson && hasSourceJson;

  const formatJson = useCallback(() => {
    if (editedLive.ok) setEditedJson(JSON.stringify(editedLive.value, null, 2));
  }, [editedLive]);

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(editorText);
      toastSuccess("JSON copied");
    } catch {
      toastError("Couldn't copy — your browser blocked clipboard access.");
    }
  }, [editorText, toastError, toastSuccess]);

  const resetJson = useCallback(async () => {
    if (
      await confirm({
        title: "Reset to the analysis?",
        description: "All edits since the last analysis will be lost.",
        confirmText: "Reset",
        destructive: true,
      })
    ) {
      setEditedJson(sourceJson);
    }
  }, [confirm, sourceJson]);

  // ── Start over ───────────────────────────────────────────────────────────
  const startOver = useCallback(async () => {
    if (
      hasWork &&
      !(await confirm({
        title: "Start over?",
        description: "This clears the images, the JSON and every generated version.",
        confirmText: "Start over",
        destructive: true,
      }))
    ) {
      return;
    }
    cancel();
    setUseCase(null);
    setImage("source", null);
    setImage("reference", null);
    setImageErrors({});
    clearAnalysis();
    setResults((prev) => {
      prev.forEach((r) => {
        release(r.url);
        release(r.sourceUrl);
      });
      return [];
    });
    versionSeqRef.current = 0;
    setSelectedResultId(null);
    setError(null);
  }, [cancel, clearAnalysis, confirm, hasWork, release, setImage]);

  // ── Render ───────────────────────────────────────────────────────────────
  const emptyEditorHint = !useCase
    ? "Pick a use case, add an image and analyze it — its JSON description appears here for you to edit."
    : !source
      ? "Add a source image, then analyze it."
      : "Click Analyze to describe the image as JSON.";

  return (
    // -m-1 p-1: the clipping box sits 4px outside the cards, so their ring + shadow aren't cut off.
    <div className="-m-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-1 xl:flex-row xl:overflow-hidden">
      {/* ── Setup ─────────────────────────────────────────────────────────── */}
      <Card className="flex shrink-0 flex-col xl:min-h-0 xl:w-72 2xl:w-80">
        <CardHeader className="pb-4">
          <CardTitle className="font-semibold tracking-tight">Setup</CardTitle>
          <CardDescription className="text-xs">
            Describe an image as JSON, edit the values, regenerate it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:overflow-y-auto">
          <section aria-labelledby="json-editor-step-1" className="space-y-2">
            <h3 id="json-editor-step-1" className="text-xs font-medium text-muted-foreground">
              1 · Use case
            </h3>
            <UseCaseSelector selected={useCase} onSelect={selectUseCase} disabled={busy} />
          </section>

          <section aria-labelledby="json-editor-step-2" className="space-y-4">
            <h3 id="json-editor-step-2" className="text-xs font-medium text-muted-foreground">
              2 · Images
            </h3>
            {useCase ? (
              <>
                <ImageUploader
                  label="Source image"
                  required
                  image={source ? { ...source, uploadSize: source.upload.size } : null}
                  preparing={preparing === "source"}
                  error={imageErrors.source}
                  disabled={busy || !!preparing}
                  onPick={(f) => void pickImage("source", f)}
                  onRemove={() => void removeImage("source")}
                />
                {requiresReference && (
                  <ImageUploader
                    label={meta?.referenceLabel ?? "Reference image"}
                    required={useCase === "object-swap"}
                    image={reference ? { ...reference, uploadSize: reference.upload.size } : null}
                    preparing={preparing === "reference"}
                    error={imageErrors.reference}
                    disabled={busy || !!preparing}
                    onPick={(f) => void pickImage("reference", f)}
                    onRemove={() => void removeImage("reference")}
                  />
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Pick a use case first.</p>
            )}

            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                <Button type="button" className="flex-1" onClick={handleAnalyze} disabled={!canAnalyze}>
                  {phase === "analyzing" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {phase === "analyzing"
                    ? `Analyzing… ${elapsed}s`
                    : referenceOnly
                      ? "Analyze reference"
                      : hasSourceJson
                        ? "Analyze again"
                        : "Analyze image"}
                </Button>
                {phase === "analyzing" && (
                  <Button type="button" variant="outline" onClick={cancel}>
                    <X />
                    Cancel
                  </Button>
                )}
              </div>
              {useCase === "object-swap" && source && !reference && (
                <p className="text-xs text-muted-foreground">Add the reference object to analyze.</p>
              )}
            </div>
          </section>

          {error?.step === "analyze" && (
            <ErrorNote message={error.message} onDismiss={() => setError(null)} className="md:col-span-2" />
          )}

          {(useCase || hasWork) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void startOver()}
              disabled={!!preparing}
              className="justify-self-start text-muted-foreground xl:mt-auto xl:self-start"
            >
              <Trash2 />
              Start over
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Editor + changes ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 shrink-0 flex-col gap-4 xl:min-h-0 xl:flex-1 xl:shrink">
        <Card className="flex h-[70vh] min-h-[24rem] flex-col xl:h-auto xl:min-h-0 xl:flex-1">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
            {showEditorTabs ? (
              // One panel (the card body) shows whichever JSON is picked, so
              // both tabs control it instead of Radix's per-tab content ids.
              <Tabs value={editorTab} onValueChange={(v) => setEditorTab(v as EditorTab)}>
                <TabsList>
                  <TabsTrigger value="scene" id={`${editorTabsId}-scene`} aria-controls={`${editorTabsId}-panel`}>
                    Scene JSON
                  </TabsTrigger>
                  <TabsTrigger
                    value="reference"
                    id={`${editorTabsId}-reference`}
                    aria-controls={`${editorTabsId}-panel`}
                  >
                    Reference JSON
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : (
              <CardTitle className="font-semibold tracking-tight">Scene JSON</CardTitle>
            )}
            {hasSourceJson && (
              <div className="flex items-center gap-1">
                {!showingReference && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={formatJson}
                      disabled={!editedLive.ok || sceneLocked}
                      aria-label="Format JSON"
                      title="Format"
                    >
                      <AlignLeft />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void resetJson()}
                      disabled={!hasEdits || busy}
                      aria-label="Reset to the analysis"
                      title="Reset to the analysis"
                    >
                      <RotateCcw />
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void copyJson()}
                  aria-label="Copy JSON"
                  title="Copy"
                >
                  <Copy />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    downloadText(editorText, `${useCase ?? "image"}-${showingReference ? "reference" : "scene"}.json`)
                  }
                  aria-label="Download JSON"
                  title="Download"
                >
                  <Download />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent
            id={`${editorTabsId}-panel`}
            role={showEditorTabs ? "tabpanel" : undefined}
            aria-labelledby={showEditorTabs ? `${editorTabsId}-${editorTab}` : undefined}
            className="flex min-h-0 flex-1 flex-col"
          >
            {hasSourceJson ? (
              showingReference ? (
                <JsonEditor
                  className="flex-1"
                  value={referenceJson}
                  readOnly
                  ariaLabel="Reference JSON (read-only)"
                  error={referenceParsed.ok || !referenceJson.trim() ? null : referenceParsed.error}
                />
              ) : (
                <JsonEditor
                  ref={editorRef}
                  className="flex-1"
                  value={editedJson}
                  onChange={setEditedJson}
                  readOnly={sceneLocked}
                  ariaLabel="Scene JSON"
                  error={editedLive.ok || !editedJson.trim() ? null : editedLive.error}
                  onSubmit={() => void handleGenerate()}
                  placeholder="{ }"
                />
              )
            ) : phase === "analyzing" ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center" role="status">
                <Loader2 aria-hidden className="size-5 animate-spin text-muted-foreground" />
                <p className="text-sm font-medium">Analyzing the image…</p>
                <p className="text-xs text-muted-foreground">Usually 10–30 seconds.</p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm font-medium">No JSON yet</p>
                <p className="max-w-sm text-xs text-muted-foreground">{emptyEditorHint}</p>
                {meta && <p className="text-xs text-muted-foreground">Example: {meta.example}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {hasSourceJson && useCase && (
          <GeneratePanel
            key={analysisId}
            className="shrink-0 xl:max-h-[45%] xl:overflow-y-auto"
            changes={changes}
            editable={editedLive.ok && !busy}
            presets={presets}
            onPreset={applyPreset}
            referenceAction={referenceAction}
            fieldGuide={guide}
            model={model}
            onModelChange={setModel}
            resolution={effectiveSize}
            onResolutionChange={setResolution}
            canGenerate={canGenerate}
            blockedReason={busy ? null : blockedReason}
            generating={phase === "generating"}
            busy={busy}
            onGenerate={() => void handleGenerate()}
            onCancel={cancel}
            error={
              error?.step === "generate" ? <ErrorNote message={error.message} onDismiss={() => setError(null)} /> : null
            }
          />
        )}
      </div>

      {/* ── Result ────────────────────────────────────────────────────────── */}
      <ResultPanel
        className={cn(
          "shrink-0 xl:min-h-0 xl:w-[24rem] 2xl:w-[30rem]",
          // Phones / tablets: no empty card under the editor.
          results.length === 0 && phase !== "generating" && "max-xl:hidden"
        )}
        results={results}
        selectedId={selectedResultId}
        onSelect={setSelectedResultId}
        generating={phase === "generating"}
        elapsedSeconds={elapsed}
        useCase={useCase}
        baselineId={analysisId}
        onUseAsSource={(r) => void continueFromResult(r)}
        onLoadJson={(r) => void loadResultJson(r)}
      />

      {confirmDialog}
    </div>
  );
}
