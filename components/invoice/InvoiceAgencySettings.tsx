"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Save, ChevronDown, Building2, Loader2, Upload, X, Check } from "lucide-react";
import { THEME_COLORS } from "@/lib/invoice/validation";
import { cn } from "@/lib/utils";
import { INPUT_CLS, TEXTAREA_CLS } from "./styles";

interface AgencyConfigs {
  sender: string;
  note_local: string;
  note_international: string;
  default_logo: string;
  default_theme_color: string;
  [key: string]: string;
}

export function InvoiceAgencySettings() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const { data: configs } = useQuery<AgencyConfigs>({
    queryKey: ["agency-config"],
    queryFn: async () => {
      const res = await fetch("/api/agency-config");
      if (!res.ok) return { sender: "{}", note_local: "", note_international: "" };
      const json = await res.json();
      return json.data;
    },
    staleTime: 60_000,
  });

  const [senderName, setSenderName] = useState("");
  const [senderAddress, setSenderAddress] = useState("");
  const [senderCity, setSenderCity] = useState("");
  const [senderZip, setSenderZip] = useState("");
  const [senderCountry, setSenderCountry] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [noteLocal, setNoteLocal] = useState("");
  const [noteInternational, setNoteInternational] = useState("");
  const [defaultLogo, setDefaultLogo] = useState("");
  const [defaultThemeColor, setDefaultThemeColor] = useState("#475569");
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!configs) return;
    try {
      const s = JSON.parse(configs.sender);
      setSenderName(s.name ?? "");
      setSenderAddress(s.address ?? "");
      setSenderCity(s.city ?? "");
      setSenderZip(s.zipCode ?? "");
      setSenderCountry(s.country ?? "");
      setSenderEmail(s.email ?? "");
      setSenderPhone(s.phone ?? "");
    } catch { /* ignore */ }
    setNoteLocal(configs.note_local ?? "");
    setNoteInternational(configs.note_international ?? "");
    setDefaultLogo(configs.default_logo ?? "");
    setDefaultThemeColor(configs.default_theme_color ?? "#475569");
  }, [configs]);

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    try {
      const sender = JSON.stringify({
        name: senderName, address: senderAddress, city: senderCity,
        zipCode: senderZip, country: senderCountry, email: senderEmail, phone: senderPhone,
      });
      const patch = async (key: string, value: string) => {
        const res = await fetch("/api/admin/agency-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `Failed to save ${key}`);
        }
      };
      await Promise.all([
        patch("sender", sender),
        patch("note_local", noteLocal),
        patch("note_international", noteInternational),
        patch("default_logo", defaultLogo),
        patch("default_theme_color", defaultThemeColor),
      ]);
      setMsg("Saved!");
      queryClient.invalidateQueries({ queryKey: ["agency-config"] });
      setTimeout(() => setMsg(""), 2000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Agency Settings</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border/50 px-5 py-4 space-y-5">
          {/* Sender Info */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sender (Bill From)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-muted-foreground">Company Name</label>
                <input value={senderName} onChange={(e) => setSenderName(e.target.value)} className={INPUT_CLS} />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-muted-foreground">Address</label>
                <input value={senderAddress} onChange={(e) => setSenderAddress(e.target.value)} className={INPUT_CLS} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">City</label>
                <input value={senderCity} onChange={(e) => setSenderCity(e.target.value)} className={INPUT_CLS} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Zip Code</label>
                <input value={senderZip} onChange={(e) => setSenderZip(e.target.value)} className={INPUT_CLS} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Country</label>
                <input value={senderCountry} onChange={(e) => setSenderCountry(e.target.value)} className={INPUT_CLS} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Email</label>
                <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} className={INPUT_CLS} />
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs text-muted-foreground">Phone</label>
                <input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} className={INPUT_CLS} />
              </div>
            </div>
          </div>

          {/* Default Logo */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Default Invoice Logo</h4>
            <div className="flex items-center gap-3">
              {defaultLogo ? (
                <div className="relative group">
                  <img src={defaultLogo} alt="Logo" className="h-16 w-16 rounded-lg border border-border object-contain bg-background" />
                  <button
                    type="button"
                    onClick={() => { setDefaultLogo(""); if (logoRef.current) logoRef.current.value = ""; }}
                    className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => logoRef.current?.click()}
                  className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Upload className="h-4 w-4 mb-0.5" />
                  <span className="text-[9px]">Upload</span>
                </button>
              )}
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 500 * 1024) {
                    setMsg("Logo must be under 500 KB");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => setDefaultLogo(reader.result as string);
                  reader.readAsDataURL(file);
                }}
              />
              <p className="text-[10px] text-muted-foreground">Used on all auto-generated invoices. Max 500 KB.</p>
            </div>
          </div>

          {/* Default Theme Color */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Default Theme Color</h4>
            <div className="flex flex-wrap gap-2">
              {THEME_COLORS.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setDefaultThemeColor(t.color)}
                  title={t.label}
                  className="relative h-7 w-7 rounded-full transition-all hover:scale-110"
                  style={{
                    backgroundColor: t.color,
                    ...(defaultThemeColor === t.color ? { boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${t.color}` } : {}),
                  }}
                >
                  {defaultThemeColor === t.color && <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Note to Customer — Local */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note to Customer — Local (Zelle + Wire)</h4>
            <textarea value={noteLocal} onChange={(e) => setNoteLocal(e.target.value)} rows={8} className={TEXTAREA_CLS} />
          </div>

          {/* Note to Customer — International */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Note to Customer — International (Wire)</h4>
            <textarea value={noteInternational} onChange={(e) => setNoteInternational(e.target.value)} rows={8} className={TEXTAREA_CLS} />
          </div>

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white ac-gradient hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Settings
            </button>
            {msg && <span className={cn("text-xs font-medium", msg === "Saved!" ? "text-emerald-600" : "text-destructive")}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
