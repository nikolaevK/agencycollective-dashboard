"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { Plus, Pencil, Trash2, Loader2, Star, FileSignature, Eye, Upload, X, Hammer } from "lucide-react";
import { cn } from "@/lib/utils";

const DocusealBuilder = lazy(() =>
  import("@docuseal/react").then((mod) => ({ default: mod.DocusealBuilder }))
);

interface ContractTemplate {
  id: string;
  name: string;
  docusealTemplateId: number;
  serviceKeys: string[] | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DocuSealTemplate {
  id: number;
  name: string;
  fields?: Array<{ name: string; type?: string; role?: string; required?: boolean }>;
}

interface DocuSealTemplateDetail {
  id: number;
  name: string;
  fields?: Array<{ name: string; type?: string; role?: string; required?: boolean }>;
  submitters?: Array<{ name?: string; uuid?: string }>;
  schema?: Array<Record<string, unknown>>;
}

export default function ContractTemplatesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [builderTemplateId, setBuilderTemplateId] = useState<number | null>(null);
  const [builderTemplateName, setBuilderTemplateName] = useState<string | null>(null);
  const [builderLocalId, setBuilderLocalId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery<ContractTemplate[]>({
    queryKey: ["contract-templates"],
    queryFn: async () => {
      const res = await fetch("/api/admin/contract-templates");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      return json.data ?? [];
    },
  });

  async function handleDelete(id: string) {
    if (!confirm("Delete this contract template?")) return;
    await fetch(`/api/admin/contract-templates?id=${id}`, { method: "DELETE" });
    queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-black text-foreground">Contract Templates</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Map DocuSeal templates to service categories for automatic contract generation
          </p>
        </div>
        <CloserSubNav />

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            <Upload className="h-4 w-4" />
            Upload Document
          </button>
          <button
            onClick={() => { setBuilderTemplateId(-1); setBuilderTemplateName(null); setBuilderLocalId(null); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-accent transition-colors"
          >
            <Hammer className="h-4 w-4" />
            Build Template
          </button>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Template
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card p-12 text-center">
            <FileSignature className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No contract templates configured yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload a PDF/DOCX or map an existing DocuSeal template
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Name</th>
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">DocuSeal ID</th>
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Service Keys</th>
                  <th className="text-left font-medium text-muted-foreground px-5 py-3">Default</th>
                  <th className="text-right font-medium text-muted-foreground px-5 py-3 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tmpl) => (
                  <tr key={tmpl.id} className="border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-foreground">{tmpl.name}</td>
                    <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{tmpl.docusealTemplateId}</td>
                    <td className="px-5 py-3">
                      {tmpl.serviceKeys && tmpl.serviceKeys.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {tmpl.serviceKeys.map((key) => (
                            <span key={key} className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400">
                              {key}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {tmpl.isDefault && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setPreviewTemplateId(tmpl.docusealTemplateId)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                          title="Preview fields"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { setBuilderTemplateId(tmpl.docusealTemplateId); setBuilderTemplateName(tmpl.name); setBuilderLocalId(tmpl.id); }}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                          title="Open form builder"
                        >
                          <Hammer className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { setEditingId(tmpl.id); setShowForm(true); }}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-accent transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(tmpl.id)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showForm && (
          <TemplateFormModal
            editId={editingId}
            templates={templates}
            onClose={() => { setShowForm(false); setEditingId(null); }}
            onSaved={() => {
              setShowForm(false);
              setEditingId(null);
              queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
            }}
          />
        )}

        {previewTemplateId && (
          <TemplateFieldPreview
            docusealTemplateId={previewTemplateId}
            onClose={() => setPreviewTemplateId(null)}
          />
        )}

        {showUpload && (
          <UploadTemplateModal
            onClose={() => setShowUpload(false)}
            onUploaded={(newId: number, newName: string) => {
              setShowUpload(false);
              setEditingId(null);
              setShowForm(true);
              queryClient.invalidateQueries({ queryKey: ["docuseal-templates"] });
            }}
          />
        )}

        {builderTemplateId !== null && (
          <TemplateBuilderModal
            templateId={builderTemplateId > 0 ? builderTemplateId : undefined}
            templateName={builderTemplateName}
            localTemplateId={builderLocalId}
            onClose={() => { setBuilderTemplateId(null); setBuilderTemplateName(null); setBuilderLocalId(null); }}
            onSaved={() => {
              setBuilderTemplateId(null);
              setBuilderTemplateName(null);
              setBuilderLocalId(null);
              queryClient.invalidateQueries({ queryKey: ["docuseal-templates"] });
              queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
            }}
          />
        )}
      </div>
    </DashboardShell>
  );
}

function TemplateFormModal({
  editId,
  templates,
  onClose,
  onSaved,
}: {
  editId: string | null;
  templates: ContractTemplate[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = editId ? templates.find((t) => t.id === editId) : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [docusealTemplateId, setDocusealTemplateId] = useState(String(existing?.docusealTemplateId ?? ""));
  const [serviceKeysStr, setServiceKeysStr] = useState(existing?.serviceKeys?.join(", ") ?? "");
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available DocuSeal templates
  const { data: docusealTemplates = [] } = useQuery<DocuSealTemplate[]>({
    queryKey: ["docuseal-templates"],
    queryFn: async () => {
      const res = await fetch("/api/admin/docuseal-templates");
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const serviceKeys = serviceKeysStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      id: editId ?? undefined,
      name: name.trim(),
      docusealTemplateId: Number(docusealTemplateId),
      serviceKeys: serviceKeys.length > 0 ? serviceKeys : null,
      isDefault,
    };

    try {
      const res = await fetch("/api/admin/contract-templates", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save");
        return;
      }
      onSaved();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  const INPUT_CLS =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">
            {editId ? "Edit Template" : "Add Contract Template"}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Template Name</label>
            <input
              className={cn(INPUT_CLS, "mt-1")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Service Agreement"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">DocuSeal Template</label>
            {docusealTemplates.length > 0 ? (
              <select
                className={cn(INPUT_CLS, "mt-1")}
                value={docusealTemplateId}
                onChange={(e) => setDocusealTemplateId(e.target.value)}
                required
              >
                <option value="">Select a template...</option>
                {docusealTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (ID: {t.id})
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={cn(INPUT_CLS, "mt-1")}
                type="number"
                value={docusealTemplateId}
                onChange={(e) => setDocusealTemplateId(e.target.value)}
                placeholder="DocuSeal template ID"
                required
              />
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Service Keys</label>
            <input
              className={cn(INPUT_CLS, "mt-1")}
              value={serviceKeysStr}
              onChange={(e) => setServiceKeysStr(e.target.value)}
              placeholder="Meta Ads, Email Marketing, Web Design"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated service keys that match deal service categories
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm font-medium text-foreground">Default template</span>
            <span className="text-xs text-muted-foreground">(used when no service keys match)</span>
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editId ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   Template Field Preview Panel
   ────────────────────────────────────────── */

function TemplateFieldPreview({
  docusealTemplateId,
  onClose,
}: {
  docusealTemplateId: number;
  onClose: () => void;
}) {
  const { data: template, isLoading, error } = useQuery<DocuSealTemplateDetail>({
    queryKey: ["docuseal-template-detail", docusealTemplateId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/docuseal-templates/${docusealTemplateId}`);
      if (!res.ok) throw new Error("Failed to fetch template details");
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
  });

  const FIELD_TYPE_COLORS: Record<string, string> = {
    text: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    signature: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    date: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    number: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400",
    checkbox: "bg-pink-100 text-pink-700 dark:bg-pink-500/10 dark:text-pink-400",
    image: "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
    initials: "bg-teal-100 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400",
    select: "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l border-border shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Template Fields
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">Failed to load template details</p>
          ) : template ? (
            <>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Template Name</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{template.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">ID: {template.id}</p>
              </div>

              {template.submitters && template.submitters.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Signing Roles</p>
                  <div className="flex flex-wrap gap-1.5">
                    {template.submitters.map((s, i) => (
                      <span key={i} className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">
                        {s.name || `Role ${i + 1}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Fields ({template.fields?.length ?? 0})
                </p>
                {template.fields && template.fields.length > 0 ? (
                  <div className="space-y-2">
                    {template.fields.map((field, i) => {
                      const typeColor = FIELD_TYPE_COLORS[field.type || "text"] || FIELD_TYPE_COLORS.text;
                      return (
                        <div key={i} className="rounded-lg border border-border/50 p-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">{field.name}</p>
                            {field.role && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">Role: {field.role}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {field.required && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400">
                                Required
                              </span>
                            )}
                            <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase", typeColor)}>
                              {field.type || "text"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No fields defined yet</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   Upload Template Modal (PDF/DOCX → DocuSeal)
   ────────────────────────────────────────── */

function UploadTemplateModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (newId: number, newName: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (templateName.trim()) {
        formData.append("name", templateName.trim());
      }

      const res = await fetch("/api/admin/docuseal-templates", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Upload failed");
        return;
      }
      onUploaded(json.data.id, json.data.name);
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
    }
  }

  const INPUT_CLS =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Contract Document
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">&times;</button>
        </div>
        <form onSubmit={handleUpload} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground">Template Name</label>
            <input
              className={cn(INPUT_CLS, "mt-1")}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Standard Service Agreement (optional)"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Document File</label>
            <div className="mt-1">
              <label className={cn(
                "flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed border-border cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors",
                file && "border-primary/50 bg-primary/5"
              )}>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.doc"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setFile(f);
                      if (!templateName.trim()) {
                        setTemplateName(f.name.replace(/\.[^.]+$/, ""));
                      }
                    }
                  }}
                />
                {file ? (
                  <>
                    <FileSignature className="h-8 w-8 text-primary mb-2" />
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">Click to upload PDF or DOCX</p>
                    <p className="text-xs text-muted-foreground">Max 10 MB</p>
                  </>
                )}
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
              Upload to DocuSeal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   Embedded DocuSeal Form Builder Modal
   ────────────────────────────────────────── */

function TemplateBuilderModal({
  templateId,
  templateName,
  localTemplateId,
  onClose,
  onSaved,
}: {
  templateId?: number;
  templateName?: string | null;
  localTemplateId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [clonedId, setClonedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch("/api/admin/docuseal-templates/builder-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId,
            name: templateName || undefined,
            clone: !!templateId,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Failed to get builder token");
          return;
        }
        setToken(json.data.token);
        if (json.data.clonedTemplateId) {
          setClonedId(json.data.clonedTemplateId);
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }
    fetchToken();
  }, [templateId, templateName]);

  async function handleSaved() {
    // Update local contract template to point to the cloned DocuSeal template
    if (clonedId && localTemplateId) {
      try {
        const res = await fetch("/api/admin/contract-templates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: localTemplateId, docusealTemplateId: clonedId }),
        });
        if (!res.ok) {
          console.error("[TemplateBuilderModal] PATCH failed:", res.status);
        }
      } catch (err) {
        console.error("[TemplateBuilderModal] Failed to update template reference:", err);
      }
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Hammer className="h-5 w-5" />
          {templateId ? `Edit Template: ${templateName || `#${templateId}`}` : "Build New Template"}
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { handleSaved(); }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
          <button onClick={() => { handleSaved(); }} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Builder */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileSignature className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-semibold text-foreground">Builder Unavailable</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <p className="text-xs text-muted-foreground mt-3">
              Make sure DOCUSEAL_USER_EMAIL is set in your environment variables.
            </p>
          </div>
        ) : token ? (
          <DocuSealBuilderEmbed token={token} />
        ) : null}
      </div>
    </div>
  );
}

function DocuSealBuilderEmbed({ token }: { token: string }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <DocusealBuilder
        token={token}
        withSendButton={false}
        withSignYourselfButton={false}
        withUploadButton={true}
        withAddPageButton={true}
        autosave={false}
        className="w-full h-full"
        style={{ height: "100%" }}
      />
    </Suspense>
  );
}
