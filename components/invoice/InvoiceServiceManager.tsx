"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Save, ChevronDown, Settings } from "lucide-react";
import type { InvoiceServiceRecord } from "@/lib/invoiceServices";
import { SERVICES_PURCHASED } from "@/components/closers/types";
import { cn } from "@/lib/utils";
import { INPUT_CLS } from "./styles";

export function InvoiceServiceManager() {
  const queryClient = useQueryClient();
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
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            Manage Preset Services
          </span>
          <span className="text-xs text-muted-foreground">({services.length})</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border/50 px-5 py-4 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

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
              <div key={svc.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-background p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{svc.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{svc.description.split("\n")[0]}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-sm font-semibold text-foreground">
                      ${(svc.rate / 100).toLocaleString()}
                    </span>
                    {svc.dealServiceKey && (
                      <span className="text-[10px] text-primary bg-primary/5 px-1.5 py-0.5 rounded">
                        Maps: {svc.dealServiceKey}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditing(svc)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete "${svc.name}"?`)) return;
                      await fetch(`/api/admin/invoice-services?id=${svc.id}`, { method: "DELETE" });
                      refresh();
                    }}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add New Service
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: InvoiceServiceRecord;
  onSave: (data: { name: string; description: string; rate: number; dealServiceKey: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
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
      rate: Math.round((parseFloat(rate) || 0) * 100),
      dealServiceKey: dealServiceKey.trim() || null,
    });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Service name"
        className={cn(INPUT_CLS, "text-sm font-medium")}
        required
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        rows={2}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow resize-y"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Rate ($)</label>
          <input
            type="number"
            min="0"
            step="any"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="0"
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] text-muted-foreground">Deal Service Key</label>
          <select
            value={dealServiceKey}
            onChange={(e) => setDealServiceKey(e.target.value)}
            className={cn(INPUT_CLS, "appearance-none")}
          >
            <option value="">None</option>
            {SERVICES_PURCHASED.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5 inline mr-1" />Cancel
        </button>
        <button type="submit" disabled={saving || !name.trim()} className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white ac-gradient disabled:opacity-60">
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving..." : initial ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}
