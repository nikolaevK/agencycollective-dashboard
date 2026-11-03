"use client";

import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Save, ChevronDown, Settings } from "lucide-react";
import type { InvoiceServiceRecord } from "@/lib/invoiceServices";
import { SERVICES_PURCHASED } from "@/components/closers/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/use-confirm";
import { cn } from "@/lib/utils";
import { InvoiceField, NativeSelect } from "./InvoiceField";

export function InvoiceServiceManager() {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InvoiceServiceRecord | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: services = [], isLoading } = useQuery<InvoiceServiceRecord[]>({
    queryKey: ["invoice-services"],
    queryFn: async () => {
      const res = await fetch("/api/admin/invoice-services");
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 60_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["invoice-services"] });

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 md:px-6"
      >
        <Settings className="size-4 shrink-0 text-muted-foreground lg:max-xl:hidden" />
        {/* Three of these share a row from lg up: between lg and xl the
            decorative icon and "Manage" give way so the labels fit one line;
            past that they wrap, never truncate. */}
        <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
          <span className="lg:max-xl:hidden">Manage </span>Preset Services
          <span className="ml-1.5 whitespace-nowrap font-normal text-muted-foreground tabular-nums">({services.length})</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-3 border-t p-4 md:px-6">
          {isLoading && (
            <div className="space-y-2" aria-label="Loading">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {services.map((svc) =>
            editing?.id === svc.id ? (
              <ServiceForm
                key={svc.id}
                initial={svc}
                onSave={async (data) => {
                  await fetch("/api/admin/invoice-services", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: svc.id, ...data }),
                  });
                  setEditing(null);
                  refresh();
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div key={svc.id} className="flex items-start justify-between gap-3 rounded-2xl border p-3">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium text-foreground">{svc.name}</p>
                  {svc.internalLabel && (
                    <p className="truncate text-xs font-medium text-muted-foreground">{svc.internalLabel}</p>
                  )}
                  <p className="line-clamp-1 text-xs text-muted-foreground">{svc.description.split("\n")[0]}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      ${(svc.rate / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {svc.dealServiceKey && (
                      <Badge variant="outline" className="font-normal text-muted-foreground">
                        Maps: {svc.dealServiceKey}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditing(svc)}
                    aria-label={`Edit ${svc.name}`}
                    className="text-muted-foreground"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={async () => {
                      if (!(await confirm({ title: `Delete "${svc.name}"?`, destructive: true, confirmText: "Delete" }))) return;
                      await fetch(`/api/admin/invoice-services?id=${svc.id}`, { method: "DELETE" });
                      refresh();
                    }}
                    aria-label={`Delete ${svc.name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          )}

          {adding ? (
            <ServiceForm
              onSave={async (data) => {
                await fetch("/api/admin/invoice-services", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                });
                setAdding(false);
                refresh();
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)} className="-ml-2 px-2">
              <Plus />
              Add New Service
            </Button>
          )}
        </div>
      )}
      {dialog}
    </Card>
  );
}

function ServiceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: InvoiceServiceRecord;
  onSave: (data: { name: string; description: string; internalLabel: string | null; rate: number; dealServiceKey: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [internalLabel, setInternalLabel] = useState(initial?.internalLabel ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [rate, setRate] = useState(initial ? String(initial.rate / 100) : "");
  const [dealServiceKey, setDealServiceKey] = useState(initial?.dealServiceKey ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      description,
      internalLabel: internalLabel.trim() || null,
      rate: Math.round((parseFloat(rate) || 0) * 100),
      dealServiceKey: dealServiceKey.trim() || null,
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl bg-muted/50 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InvoiceField label="Header (shown on invoice)" htmlFor={`${id}-name`}>
          <Input
            id={`${id}-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Service name"
            className="font-medium"
            required
          />
        </InvoiceField>
        <InvoiceField label="Internal label (not on invoice)" htmlFor={`${id}-internal`}>
          <Input
            id={`${id}-internal`}
            type="text"
            value={internalLabel}
            onChange={(e) => setInternalLabel(e.target.value)}
            placeholder="e.g. (Ads + Creatives + Email)"
          />
        </InvoiceField>
      </div>
      <Textarea
        aria-label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        rows={2}
        className="resize-y"
      />
      <div className="grid grid-cols-2 gap-3">
        <InvoiceField label="Rate ($)" htmlFor={`${id}-rate`}>
          <Input
            id={`${id}-rate`}
            type="number"
            min="0"
            step="any"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="0"
          />
        </InvoiceField>
        <InvoiceField label="Deal Service Key" htmlFor={`${id}-key`}>
          <NativeSelect
            id={`${id}-key`}
            value={dealServiceKey}
            onChange={(e) => setDealServiceKey(e.target.value)}
          >
            <option value="">None</option>
            {SERVICES_PURCHASED.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </NativeSelect>
        </InvoiceField>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X />
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          <Save />
          {saving ? "Saving..." : initial ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
}
