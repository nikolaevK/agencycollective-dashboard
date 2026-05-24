"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  Save,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WelcomeKitRenderer } from "@/components/welcome-kit/WelcomeKitRenderer";
import { SectionEditor } from "@/components/welcome-kit/builder/SectionEditor";
import { PreviewFrame } from "@/components/welcome-kit/builder/PreviewFrame";
import {
  CollapsibleCard,
  TextArea,
  TextInput,
  Toggle,
} from "@/components/welcome-kit/builder/fields";
import { move, newSection, removeAt, replaceAt } from "@/components/welcome-kit/builder/blocks";
import type {
  WelcomeKitDoc,
  WelcomeKitPdfMeta,
  WelcomeKitRecord,
  WkSection,
} from "@/lib/welcomeKit";

// Kept in sync with lib/welcomeKit.ts (can't import runtime values from a
// server module into this client component without bundling the DB layer).
const PDF_SERVE_PATH = "/welcome-kit/pdf";
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

async function fetchRecord(): Promise<WelcomeKitRecord> {
  const res = await fetch("/api/admin/clients/welcome-kit");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as WelcomeKitRecord;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type SaveVars = { doc: WelcomeKitDoc; baseUpdatedAt: string | null };
type SaveResult = { doc: WelcomeKitDoc; updatedAt: string };
type SaveError = Error & { conflict?: WelcomeKitRecord };

/** Clipboard fallback for non-HTTPS / unsupported environments. */
function fallbackCopy(text: string, done: () => void) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    done();
  } catch {
    /* clipboard unavailable — silently give up */
  }
}

export function WelcomeKitBuilder() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-welcome-kit"],
    queryFn: fetchRecord,
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState<WelcomeKitDoc | null>(null);
  const [savedJson, setSavedJson] = useState<string>("");
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [publicUrl, setPublicUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [conflict, setConflict] = useState<WelcomeKitRecord | null>(null);
  const [pdfMeta, setPdfMeta] = useState<WelcomeKitPdfMeta | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  // Seed local state once the record arrives.
  useEffect(() => {
    if (data && draft === null) {
      setDraft(data.doc);
      setSavedJson(JSON.stringify(data.doc));
      setBaseUpdatedAt(data.updatedAt);
      setShareEnabled(data.shareEnabled);
      setPdfMeta(data.pdf);
    }
  }, [data, draft]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPublicUrl(`${window.location.origin}/welcome-kit`);
    }
  }, []);

  // Clear pending timers if the tab unmounts mid-countdown.
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );

  const dirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== savedJson,
    [draft, savedJson]
  );

  const saveMutation = useMutation<SaveResult, SaveError, SaveVars>({
    mutationFn: async (vars) => {
      const res = await fetch("/api/admin/clients/welcome-kit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: vars.doc, baseUpdatedAt: vars.baseUpdatedAt }),
      });
      if (res.status === 409) {
        const json = await res.json().catch(() => null);
        const err = new Error("conflict") as SaveError;
        err.conflict = json?.data as WelcomeKitRecord | undefined;
        throw err;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data as SaveResult;
    },
    onSuccess: (result) => {
      setDraft(result.doc);
      setSavedJson(JSON.stringify(result.doc));
      setBaseUpdatedAt(result.updatedAt);
      setConflict(null);
      setJustSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["admin-welcome-kit"] });
    },
    onError: (err) => {
      if (err.conflict) setConflict(err.conflict);
    },
  });

  const shareMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/admin/clients/welcome-kit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareEnabled: enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return enabled;
    },
    onError: (_e, attempted) => {
      // revert optimistic flip
      setShareEnabled(!attempted);
    },
  });

  function toggleShare(next: boolean) {
    setShareEnabled(next);
    shareMutation.mutate(next);
  }

  // PDF upload/remove are immediate, standalone ops (like publishing) — they
  // store/clear the blob and return the row's updatedAt so the doc concurrency
  // token stays in sync.
  const uploadPdfMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/clients/welcome-kit/pdf", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        if (res.status === 413) {
          throw new Error("File too large to upload. Try a smaller PDF.");
        }
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || `Upload failed (${res.status})`);
      }
      const json = await res.json();
      return json.data as { pdf: WelcomeKitPdfMeta | null; updatedAt: string | null };
    },
    onSuccess: (result) => {
      setPdfMeta(result.pdf);
      setBaseUpdatedAt(result.updatedAt);
      setPdfError(null);
    },
    onError: (err: Error) => setPdfError(err.message || "Upload failed"),
  });

  const removePdfMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/clients/welcome-kit/pdf", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data as { pdf: WelcomeKitPdfMeta | null; updatedAt: string | null };
    },
    onSuccess: (result) => {
      setPdfMeta(result.pdf);
      setBaseUpdatedAt(result.updatedAt);
      setPdfError(null);
    },
  });

  const pdfBusy = uploadPdfMutation.isPending || removePdfMutation.isPending;

  function handlePdfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-selected later
    if (!file) return;
    setPdfError(null);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setPdfError("Please choose a PDF file.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setPdfError("PDF exceeds the 10 MB limit.");
      return;
    }
    uploadPdfMutation.mutate(file);
  }

  function flagCopied() {
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  function copyLink() {
    if (!publicUrl) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(publicUrl)
        .then(flagCopied)
        .catch(() => fallbackCopy(publicUrl, flagCopied));
    } else {
      fallbackCopy(publicUrl, flagCopied);
    }
  }

  function loadTheirVersion() {
    if (!conflict) return;
    setDraft(conflict.doc);
    setSavedJson(JSON.stringify(conflict.doc));
    setBaseUpdatedAt(conflict.updatedAt);
    setPdfMeta(conflict.pdf);
    setConflict(null);
  }

  function overwriteWithMine() {
    if (!conflict || !draft) return;
    saveMutation.mutate({ doc: draft, baseUpdatedAt: conflict.updatedAt });
  }

  if (isLoading || draft === null) {
    return (
      <div className="rounded-xl border border-border/50 bg-card p-8">
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-muted/60" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-600">
        Failed to load the Welcome Kit. Please refresh.
      </div>
    );
  }

  const sections = draft.sections;

  const setSection = (i: number, s: WkSection) =>
    setDraft({ ...draft, sections: replaceAt(sections, i, s) });

  const statusText = saveMutation.isPending
    ? "Saving…"
    : justSaved
      ? "Saved"
      : dirty
        ? "Unsaved changes"
        : "All changes saved";

  // Mirror the consumer-side PDF precedence so the preview matches the live page.
  const previewDoc: WelcomeKitDoc = pdfMeta
    ? { ...draft, cta: { ...draft.cta, pdfUrl: PDF_SERVE_PATH } }
    : draft;

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-medium",
              saveMutation.isPending
                ? "text-muted-foreground"
                : justSaved
                  ? "text-emerald-600"
                  : dirty
                    ? "text-amber-600"
                    : "text-muted-foreground"
            )}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : justSaved ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  dirty ? "bg-amber-500" : "bg-emerald-500"
                )}
              />
            )}
            {statusText}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile edit/preview switch */}
          <div className="flex bg-muted rounded-lg p-1 xl:hidden">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors",
                mode === "edit" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors",
                mode === "preview" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          </div>

          {dirty && (
            <button
              type="button"
              onClick={() => {
                if (savedJson) setDraft(JSON.parse(savedJson) as WelcomeKitDoc);
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={() => saveMutation.mutate({ doc: draft, baseUpdatedAt })}
            disabled={!dirty || saveMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg shadow-primary/20 ac-gradient hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save changes
          </button>
        </div>
      </div>

      {/* ── Conflict banner ── */}
      {conflict && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                Someone else saved changes
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The Welcome Kit was updated after you opened it. Load their version, or
                overwrite it with yours.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={loadTheirVersion}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
                >
                  Load their version
                </button>
                <button
                  type="button"
                  onClick={overwriteWithMine}
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white ac-gradient hover:opacity-90 transition-all disabled:opacity-40"
                >
                  {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Overwrite with mine
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Share card ── */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Public share page</p>
              <p className="text-xs text-muted-foreground">
                {shareEnabled
                  ? "Live — anyone with the link can view this kit."
                  : "Off — the public link returns an “unavailable” page."}
              </p>
            </div>
          </div>
          <Toggle
            label={shareEnabled ? "Published" : "Publish"}
            checked={shareEnabled}
            onChange={toggleShare}
          />
        </div>
        {shareEnabled && publicUrl && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-[12rem] truncate rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
              {publicUrl}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open
            </a>
          </div>
        )}
      </div>

      {/* ── Editor + Preview ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Editor */}
        <div className={cn("min-w-0 space-y-3", mode === "preview" && "hidden xl:block")}>
          {/* Hero */}
          <CollapsibleCard title="Hero banner" subtitle="Badge, headline & intro" defaultOpen>
            <TextInput
              label="Badge"
              value={draft.hero.badge}
              onChange={(badge) => setDraft({ ...draft, hero: { ...draft.hero, badge } })}
              placeholder="Client Welcome Kit"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <TextInput
                label="Title — lead"
                value={draft.hero.titleLead}
                onChange={(titleLead) => setDraft({ ...draft, hero: { ...draft.hero, titleLead } })}
                placeholder="Welcome to the"
              />
              <TextInput
                label="Title — highlight"
                value={draft.hero.titleHighlight}
                onChange={(titleHighlight) =>
                  setDraft({ ...draft, hero: { ...draft.hero, titleHighlight } })
                }
                placeholder="Agency Collective"
              />
              <TextInput
                label="Title — tail"
                value={draft.hero.titleTail}
                onChange={(titleTail) => setDraft({ ...draft, hero: { ...draft.hero, titleTail } })}
                placeholder="Family."
              />
            </div>
            <TextArea
              label="Subtitle"
              value={draft.hero.subtitle}
              onChange={(subtitle) => setDraft({ ...draft, hero: { ...draft.hero, subtitle } })}
              placeholder="Everything you need to know about how we work together."
              rows={2}
            />
          </CollapsibleCard>

          {/* Sections */}
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Sections
            </p>
            {sections.map((section, i) => (
              <SectionEditor
                key={section.id}
                section={section}
                index={i}
                count={sections.length}
                onChange={(s) => setSection(i, s)}
                onMoveUp={() => setDraft({ ...draft, sections: move(sections, i, -1) })}
                onMoveDown={() => setDraft({ ...draft, sections: move(sections, i, 1) })}
                onRemove={() => setDraft({ ...draft, sections: removeAt(sections, i) })}
              />
            ))}
            <button
              type="button"
              onClick={() =>
                setDraft({ ...draft, sections: [...sections, newSection(sections.length)] })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add section
            </button>
          </div>

          {/* CTA */}
          <CollapsibleCard title="Closing call-to-action" subtitle="Bottom banner & buttons">
            <Toggle
              label="Show the closing banner"
              checked={draft.cta.enabled}
              onChange={(enabled) => setDraft({ ...draft, cta: { ...draft.cta, enabled } })}
            />
            <TextInput
              label="Heading"
              value={draft.cta.title}
              onChange={(title) => setDraft({ ...draft, cta: { ...draft.cta, title } })}
              placeholder="We're Excited to Work With You"
            />
            <TextArea
              label="Body"
              value={draft.cta.body}
              onChange={(body) => setDraft({ ...draft, cta: { ...draft.cta, body } })}
              placeholder="Our goal is simple: build systems that grow your business."
              rows={2}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextInput
                label="Button label"
                value={draft.cta.buttonLabel}
                onChange={(buttonLabel) =>
                  setDraft({ ...draft, cta: { ...draft.cta, buttonLabel } })
                }
                placeholder="Start Onboarding"
              />
              <TextInput
                label="Button URL"
                value={draft.cta.buttonUrl}
                onChange={(buttonUrl) => setDraft({ ...draft, cta: { ...draft.cta, buttonUrl } })}
                placeholder="https://… (leave blank → onboarding in portal)"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              In the client portal an empty URL links to that client&apos;s onboarding page.
              On the public page the button is hidden when the URL is empty.
            </p>
            <div className="space-y-3 pt-1">
              <Toggle
                label="Show PDF download button"
                checked={draft.cta.showPdf}
                onChange={(showPdf) => setDraft({ ...draft, cta: { ...draft.cta, showPdf } })}
              />

              <div className="space-y-2">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Downloadable PDF
                </span>
                {pdfMeta ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{pdfMeta.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatBytes(pdfMeta.size)} · uploaded
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => pdfInputRef.current?.click()}
                      disabled={pdfBusy}
                      className="shrink-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                    >
                      {uploadPdfMutation.isPending ? "Uploading…" : "Replace"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removePdfMutation.mutate()}
                      disabled={pdfBusy}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors disabled:opacity-40"
                      aria-label="Remove PDF"
                    >
                      {removePdfMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => pdfInputRef.current?.click()}
                    disabled={pdfBusy}
                    className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40"
                  >
                    {uploadPdfMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {uploadPdfMutation.isPending ? "Uploading…" : "Upload PDF"}
                  </button>
                )}
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={handlePdfFile}
                />
                {pdfError && <p className="text-xs text-red-600">{pdfError}</p>}
                <p className="text-[11px] text-muted-foreground">
                  Up to 10 MB. Appears as a “Download PDF” button and a sidebar link
                  wherever the kit shows (client portal + public page).
                </p>
              </div>

              <TextInput
                label="…or link to an external PDF URL"
                value={draft.cta.pdfUrl}
                onChange={(pdfUrl) => setDraft({ ...draft, cta: { ...draft.cta, pdfUrl } })}
                placeholder="https://…"
              />
              {pdfMeta && (
                <p className="text-[11px] text-muted-foreground">
                  An uploaded file takes precedence over this URL.
                </p>
              )}
            </div>
          </CollapsibleCard>
        </div>

        {/* Preview */}
        <div className={cn("min-w-0", mode === "edit" && "hidden xl:block")}>
          <div className="xl:sticky xl:top-6">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Live preview
              </p>
              <div className="flex bg-muted rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setDevice("desktop")}
                  aria-label="Desktop preview"
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors",
                    device === "desktop" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setDevice("mobile")}
                  aria-label="Mobile preview"
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors",
                    device === "mobile" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile
                </button>
              </div>
            </div>

            {device === "mobile" ? (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-3 md:p-4 max-h-[calc(100vh-9rem)] overflow-auto">
                {/* iframe gives the preview a true 390px viewport so the
                    renderer's responsive breakpoints reflect a real phone. */}
                <div className="mx-auto w-fit overflow-hidden rounded-[2rem] border-4 border-foreground/10 bg-background shadow-lg">
                  <div className="h-[680px] w-[390px]">
                    <PreviewFrame width={390}>
                      <div className="bg-background p-3">
                        <WelcomeKitRenderer doc={previewDoc} variant="preview" />
                      </div>
                    </PreviewFrame>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-background p-3 md:p-4 max-h-[calc(100vh-9rem)] overflow-y-auto">
                {/* pointer-events-none so preview links/anchors don't navigate
                    the dashboard; the container still scrolls. */}
                <div className="pointer-events-none">
                  <WelcomeKitRenderer doc={previewDoc} variant="preview" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
