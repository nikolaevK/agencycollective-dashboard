"use client";

import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { CloserSubNav } from "@/components/closers/CloserSubNav";
import { Plus, Pencil, Trash2, Loader2, Star, FileSignature, Eye, Upload, X, Hammer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  dialogOverlayClass,
  dialogPanelClass,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/components/ui/use-confirm";

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
  const { toastError } = useToast();
  const { confirm, dialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Set right after an upload so the Add Template form opens on that template.
  const [uploadedPrefill, setUploadedPrefill] = useState<{ id: number; name: string } | null>(null);
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
    if (!(await confirm({ title: "Delete this contract template?", destructive: true, confirmText: "Delete" }))) return;
    try {
      let res = await fetch(`/api/admin/contract-templates?id=${id}`, { method: "DELETE" });
      if (res.status === 409) {
        // Unsigned contracts still use it — they'd fail to send until another
        // template is picked on each deal. Make that an explicit choice.
        const json = await res.json().catch(() => ({}));
        if (json.code !== "in_use") {
          toastError(json.error || "Failed to delete template");
          return;
        }
        const ok = await confirm({
          title: "Delete anyway?",
          description: `${json.error}. Those contracts won't send until you pick another template on each deal.`,
          destructive: true,
          confirmText: "Delete",
        });
        if (!ok) return;
        res = await fetch(`/api/admin/contract-templates?id=${id}&force=1`, { method: "DELETE" });
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toastError(json.error || "Failed to delete template");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
    } catch {
      toastError("Couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <DashboardShell wide>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight">Contract Templates</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Map DocuSeal templates to service categories for automatic contract generation
          </p>
        </div>
        <CloserSubNav />

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setShowUpload(true)}
          >
            <Upload />
            Upload Document
          </Button>
          <Button
            variant="outline"
            onClick={() => { setBuilderTemplateId(-1); setBuilderTemplateName(null); setBuilderLocalId(null); }}
          >
            <Hammer />
            Build Template
          </Button>
          <Button
            onClick={() => { setShowForm(true); setEditingId(null); }}
          >
            <Plus />
            Add Template
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <Card className="p-12 text-center">
            <FileSignature className="size-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No contract templates configured yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Upload a PDF/DOCX or map an existing DocuSeal template
            </p>
          </Card>
        ) : (
          <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="pt-2 md:pt-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>DocuSeal ID</TableHead>
                    <TableHead>Service Keys</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead className="text-right w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((tmpl) => (
                    <TableRow key={tmpl.id}>
                      <TableCell className="font-medium text-foreground whitespace-normal">{tmpl.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{tmpl.docusealTemplateId}</TableCell>
                      <TableCell className="whitespace-normal">
                        {tmpl.serviceKeys && tmpl.serviceKeys.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {tmpl.serviceKeys.map((key) => (
                              <Badge key={key} variant="secondary">
                                {key}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tmpl.isDefault && <Star className="size-4 text-amber-500 fill-amber-500" />}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setPreviewTemplateId(tmpl.docusealTemplateId)}
                            className="text-muted-foreground"
                            title="Preview fields"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => { setBuilderTemplateId(tmpl.docusealTemplateId); setBuilderTemplateName(tmpl.name); setBuilderLocalId(tmpl.id); }}
                            className="text-muted-foreground"
                            title="Open form builder"
                          >
                            <Hammer className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => { setEditingId(tmpl.id); setShowForm(true); }}
                            className="text-muted-foreground"
                            title="Edit template"
                            aria-label={`Edit ${tmpl.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDelete(tmpl.id)}
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            title="Delete template"
                            aria-label={`Delete ${tmpl.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {templates.map((tmpl) => (
              <Card key={tmpl.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{tmpl.name}</p>
                      {tmpl.isDefault && <Star className="size-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">ID: {tmpl.docusealTemplateId}</p>
                  </div>
                </div>

                {tmpl.serviceKeys && tmpl.serviceKeys.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tmpl.serviceKeys.map((key) => (
                      <Badge key={key} variant="secondary">
                        {key}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1 border-t pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewTemplateId(tmpl.docusealTemplateId)}
                    className="h-9 flex-1 text-xs text-muted-foreground"
                  >
                    <Eye className="size-3.5" />
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setBuilderTemplateId(tmpl.docusealTemplateId); setBuilderTemplateName(tmpl.name); setBuilderLocalId(tmpl.id); }}
                    className="h-9 flex-1 text-xs text-muted-foreground"
                  >
                    <Hammer className="size-3.5" />
                    Builder
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditingId(tmpl.id); setShowForm(true); }}
                    className="h-9 flex-1 text-xs text-muted-foreground"
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(tmpl.id)}
                    className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete template"
                    aria-label={`Delete ${tmpl.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          </>
        )}

        {showForm && (
          <TemplateFormModal
            editId={editingId}
            templates={templates}
            prefill={uploadedPrefill}
            onClose={() => { setShowForm(false); setEditingId(null); setUploadedPrefill(null); }}
            onSaved={() => {
              setShowForm(false);
              setEditingId(null);
              setUploadedPrefill(null);
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
              setUploadedPrefill({ id: newId, name: newName });
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

        {dialog}
      </div>
    </DashboardShell>
  );
}

function TemplateFormModal({
  editId,
  templates,
  prefill,
  onClose,
  onSaved,
}: {
  editId: string | null;
  templates: ContractTemplate[];
  /** Just-uploaded DocuSeal template to preselect when adding. */
  prefill?: { id: number; name: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = editId ? templates.find((t) => t.id === editId) : null;

  const [name, setName] = useState(existing?.name ?? prefill?.name ?? "");
  const [docusealTemplateId, setDocusealTemplateId] = useState(String(existing?.docusealTemplateId ?? prefill?.id ?? ""));
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

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain sm:max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {editId ? "Edit Template" : "Add Contract Template"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="contract-template-name">Template Name</Label>
            <Input
              id="contract-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Service Agreement"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contract-template-docuseal">DocuSeal Template</Label>
            {docusealTemplates.length > 0 ? (
              // No empty-valued item: "" shows the placeholder, and `required`
              // still blocks submit until a template is picked.
              <Select
                value={docusealTemplateId}
                onValueChange={(v) => setDocusealTemplateId(v)}
                required
              >
                <SelectTrigger id="contract-template-docuseal">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {docusealTemplates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name} (ID: {t.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="contract-template-docuseal"
                type="number"
                value={docusealTemplateId}
                onChange={(e) => setDocusealTemplateId(e.target.value)}
                placeholder="DocuSeal template ID"
                required
              />
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contract-template-service-keys">Service Keys</Label>
            <Input
              id="contract-template-service-keys"
              value={serviceKeysStr}
              onChange={(e) => setServiceKeysStr(e.target.value)}
              placeholder="Meta Ads, Email Marketing, Web Design"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated service keys that match deal service categories
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Checkbox
              id="contract-template-default"
              checked={isDefault}
              onCheckedChange={(c) => setIsDefault(c === true)}
            />
            <Label htmlFor="contract-template-default" className="cursor-pointer">Default template</Label>
            <span className="text-xs text-muted-foreground">(used when no service keys match)</span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
            >
              {saving && <Loader2 className="animate-spin" />}
              {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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

  return (
    <Sheet
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full max-w-md gap-0 sm:max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby={undefined}
      >
        <SheetHeader className="border-b px-6 py-4 pr-14">
          <SheetTitle className="flex items-center gap-2">
            <Eye className="size-4 text-muted-foreground" />
            Template Fields
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Failed to load template details</p>
          ) : template ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground">Template Name</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{template.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">ID: {template.id}</p>
              </div>

              {template.submitters && template.submitters.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">Signing Roles</p>
                  <div className="flex flex-wrap gap-1.5">
                    {template.submitters.map((s, i) => (
                      <Badge key={i} variant="secondary">
                        {s.name || `Role ${i + 1}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-foreground mb-2">
                  Fields ({template.fields?.length ?? 0})
                </p>
                {template.fields && template.fields.length > 0 ? (
                  <div className="space-y-2">
                    {template.fields.map((field, i) => (
                      <div key={i} className="rounded-2xl bg-muted/50 p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground break-words">{field.name}</p>
                          {field.role && (
                            <p className="text-xs text-muted-foreground mt-0.5">Role: {field.role}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {field.required && (
                            <StatusBadge tone="warning">Required</StatusBadge>
                          )}
                          <Badge variant="secondary">
                            {field.type || "text"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No fields defined yet</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
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

  // An upload in flight can't be cancelled — don't let a stray click hide it.
  const close = () => {
    if (!uploading) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className={dialogOverlayClass} onClick={close} />
      <div className={cn(dialogPanelClass, "relative z-50 w-full max-w-lg mx-4 p-6 space-y-6 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain")}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-medium leading-none flex items-center gap-2">
            <Upload className="size-4 text-muted-foreground" />
            Upload Contract Document
          </h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={close}
            disabled={uploading}
            aria-label="Close"
            className="bg-secondary"
          >
            <X />
          </Button>
        </div>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="contract-upload-name">Template Name</Label>
            <Input
              id="contract-upload-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Standard Service Agreement (optional)"
            />
          </div>

          <div className="grid gap-2">
            <Label>Document File</Label>
            <div>
              <label className={cn(
                "flex flex-col items-center justify-center w-full h-32 rounded-2xl border-2 border-dashed cursor-pointer hover:border-foreground/30 hover:bg-muted/50 transition-colors",
                file && "border-foreground/30 bg-muted/50"
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
                    <FileSignature className="size-8 text-foreground mb-2" />
                    <p className="max-w-full px-4 text-sm font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </>
                ) : (
                  <>
                    <Upload className="size-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">Click to upload PDF or DOCX</p>
                    <p className="text-xs text-muted-foreground">Max 10 MB</p>
                  </>
                )}
              </label>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={close} disabled={uploading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={uploading || !file}
            >
              {uploading && <Loader2 className="animate-spin" />}
              Upload to DocuSeal
            </Button>
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
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-4 sm:px-6 py-3 shrink-0">
        <h2 className="min-w-0 text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Hammer className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {templateId ? `Edit Template: ${templateName || `#${templateId}`}` : "Build New Template"}
          </span>
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            onClick={() => { handleSaved(); }}
          >
            Done
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { handleSaved(); }} aria-label="Close" className="text-muted-foreground">
            <X />
          </Button>
        </div>
      </div>

      {/* Builder */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileSignature className="size-12 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-semibold tracking-tight text-foreground">Builder Unavailable</p>
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
      {/* DocuSeal renders in-page with a transparent background and its own
          dark text — always give it a light surface, or dark mode makes the
          builder unreadable. */}
      <div className="h-full bg-white text-neutral-900">
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
      </div>
    </Suspense>
  );
}
