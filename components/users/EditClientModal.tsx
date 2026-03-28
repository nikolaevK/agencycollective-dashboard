"use client";

import { useState, useRef, useTransition } from "react";
import { X, Upload, Trash2 } from "lucide-react";
import { updateUserAction, removeUserLogoAction } from "@/app/actions/users";
import { CATEGORIES } from "./types";
import type { ClientPublic } from "./types";
import type { UserStatus } from "@/lib/users";

interface EditClientModalProps {
  client: ClientPublic;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditClientModal({ client, onClose, onUpdated }: EditClientModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(client.displayName);
  const [email, setEmail] = useState(client.email ?? "");
  const [category, setCategory] = useState(client.category ?? "");
  const [status, setStatus] = useState<UserStatus>(client.status);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("id", client.id);
    formData.set("displayName", displayName);
    formData.set("email", email);
    formData.set("category", category);
    formData.set("status", status);

    // Append new logo file if selected
    const logoFile = fileInputRef.current?.files?.[0];
    if (logoFile) {
      formData.set("logo", logoFile);
    }

    startTransition(async () => {
      // Remove logo first if requested
      if (logoRemoved && !logoFile) {
        const removeResult = await removeUserLogoAction(client.id);
        if (removeResult.error) {
          setError(removeResult.error);
          return;
        }
      }

      const result = await updateUserAction(formData);
      if (result.error) {
        setError(result.error);
      } else {
        onUpdated();
        onClose();
      }
    });
  }

  const INPUT_CLS =
    "w-full bg-muted/40 dark:bg-white/5 border-2 border-transparent rounded-xl py-3 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-0 focus:outline-none transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="text-lg font-bold text-foreground">Edit Client</h3>
          <button onClick={onClose} className="p-2 hover:bg-muted/50 rounded-lg transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`${INPUT_CLS} appearance-none cursor-pointer`}
            >
              <option value="">None</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as UserStatus)}
              className={`${INPUT_CLS} appearance-none cursor-pointer`}
            >
              <option value="active">Active</option>
              <option value="onboarding">Onboarding</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Logo */}
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Logo
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setLogoPreview(URL.createObjectURL(file));
                  setLogoRemoved(false);
                }
              }}
            />
            {logoPreview ? (
              <div className="flex items-center gap-3 p-3 bg-muted/40 dark:bg-white/5 rounded-xl">
                <img src={logoPreview} alt="New logo" className="h-10 w-10 object-contain rounded-lg" />
                <span className="text-xs text-muted-foreground flex-1 truncate">New logo selected</span>
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
            ) : client.logoPath && !logoRemoved ? (
              <div className="flex items-center gap-3 p-3 bg-muted/40 dark:bg-white/5 rounded-xl">
                <img src={client.logoPath} alt="Current logo" className="h-10 w-10 object-contain rounded-lg" />
                <span className="text-xs text-muted-foreground flex-1">Current logo</span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-primary hover:underline shrink-0"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setLogoRemoved(true)}
                  className="p-1 hover:bg-destructive/10 rounded-lg transition-colors shrink-0"
                  title="Remove logo"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-3 bg-muted/40 dark:bg-white/5 border-2 border-dashed border-border/50 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                <Upload className="h-4 w-4" />
                {logoRemoved ? "Upload new logo" : "Upload logo"}
              </button>
            )}
          </div>

          {!client.email && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This client has no email set. They cannot log in to the portal until an email is added.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3 rounded-xl font-bold text-sm text-white shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 ac-gradient"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
