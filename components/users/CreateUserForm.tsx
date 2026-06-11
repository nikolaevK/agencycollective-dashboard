"use client";

import { useState, useRef, useTransition } from "react";
import { UserPlus, Upload, X } from "lucide-react";
import { createUserAction } from "@/app/actions/users";
import { CATEGORIES } from "./types";
import { BOOK_OPTIONS, type ClientBook } from "@/lib/clientProfile";

interface CreateUserFormProps {
  onCreated: () => void;
}

export function CreateUserForm({ onCreated }: CreateUserFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [book, setBook] = useState<ClientBook>("agency");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const website = String(formData.get("website") ?? "").trim();

    startTransition(async () => {
      const result = await createUserAction(formData);
      if (result.error) {
        setError(result.error);
        return;
      }

      // Roster fields live in client_profile — seed them right after create.
      // The client exists either way; a failed seed must be SURFACED (not
      // swallowed), or "PepAds + website" silently lands as a default-agency
      // client and the admin only finds out much later.
      if (result.id && (book !== "agency" || website)) {
        const changes: Record<string, unknown> = {};
        if (book !== "agency") changes.book = book;
        if (website) changes.website = website;
        try {
          const res = await fetch(`/api/admin/clients/${result.id}/profile`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(changes),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch {
          setError(
            "Client created, but the book/website could not be saved — set them on the client's directory row."
          );
        }
      }

      setSuccess(true);
      form.reset();
      setLogoPreview(null);
      setBook("agency");
      onCreated();
      setTimeout(() => setSuccess(false), 3000);
    });
  }

  return (
    <div className="bg-card rounded-2xl p-6 lg:p-8 shadow-sm border border-border/50 dark:border-white/[0.06]">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Create New Client</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Add a new client to the directory.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Full Name
          </label>
          <input
            name="displayName"
            type="text"
            required
            placeholder="e.g. Skyline Ventures"
            className="w-full bg-muted/40 dark:bg-white/5 border-2 border-transparent rounded-xl py-3 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-0 focus:outline-none transition-colors"
          />
        </div>

        {/* Email */}
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Email Address
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="client@company.com"
            className="w-full bg-muted/40 dark:bg-white/5 border-2 border-transparent rounded-xl py-3 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-0 focus:outline-none transition-colors"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Category
          </label>
          <select
            name="category"
            className="w-full bg-muted/40 dark:bg-white/5 border-2 border-transparent rounded-xl py-3 px-4 text-sm text-foreground focus:border-primary focus:ring-0 focus:outline-none transition-colors appearance-none cursor-pointer"
          >
            <option value="">Select...</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Book */}
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Book
          </label>
          <select
            value={book}
            onChange={(e) => setBook(e.target.value as ClientBook)}
            className="w-full bg-muted/40 dark:bg-white/5 border-2 border-transparent rounded-xl py-3 px-4 text-sm text-foreground focus:border-primary focus:ring-0 focus:outline-none transition-colors appearance-none cursor-pointer"
          >
            {BOOK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {book === "pepads" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              PepAds clients are billed manually — billing status &amp; next re-bill are
              set by hand on the directory row; no automatic re-bill alerts.
            </p>
          )}
        </div>

        {/* Website */}
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Website (optional)
          </label>
          <input
            name="website"
            type="text"
            placeholder="clientsite.com"
            className="w-full bg-muted/40 dark:bg-white/5 border-2 border-transparent rounded-xl py-3 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-0 focus:outline-none transition-colors"
          />
        </div>

        {/* Logo */}
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            Logo (optional)
          </label>
          <input
            ref={fileInputRef}
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setLogoPreview(URL.createObjectURL(file));
              }
            }}
          />
          {logoPreview ? (
            <div className="flex items-center gap-3 p-3 bg-muted/40 dark:bg-white/5 rounded-xl">
              <img src={logoPreview} alt="Preview" className="h-10 w-10 object-contain rounded-lg" />
              <span className="text-xs text-muted-foreground flex-1 truncate">
                {fileInputRef.current?.files?.[0]?.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  setLogoPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="p-1 hover:bg-muted rounded-lg transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 bg-muted/40 dark:bg-white/5 border-2 border-dashed border-border/50 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
            >
              <Upload className="h-4 w-4" />
              Upload logo
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
            <p className="text-sm text-emerald-600 dark:text-emerald-400">Client created successfully</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 ac-gradient"
        >
          <UserPlus className="h-4 w-4" />
          {isPending ? "Creating..." : "Create Client"}
        </button>
      </form>
    </div>
  );
}
