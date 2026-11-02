"use client";

import { useState, useRef, useTransition } from "react";
import { ChevronDown, UserPlus, Upload, X } from "lucide-react";
import { createUserAction } from "@/app/actions/users";
import { CATEGORIES } from "./types";
import { BOOK_OPTIONS, type ClientBook } from "@/lib/clientProfile";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  // Workspace (book) the client lands in — only rendered when the admin can
  // see more than one; single-workspace admins fall through to the server
  // default (their own book).
  const { workspaces } = useWorkspaces();

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
    <div>
      <div className="mb-1 flex items-center gap-2">
        <UserPlus className="size-4 text-muted-foreground" />
        <h3 className="text-base font-medium">Create New Client</h3>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        Add a new client to the directory.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Full Name */}
        <div className="grid gap-2">
          <Label htmlFor="create-client-name">Full Name</Label>
          <Input
            id="create-client-name"
            name="displayName"
            type="text"
            required
            placeholder="e.g. Skyline Ventures"
          />
        </div>

        {/* Email */}
        <div className="grid gap-2">
          <Label htmlFor="create-client-email">Email Address</Label>
          <Input
            id="create-client-email"
            name="email"
            type="email"
            required
            placeholder="client@company.com"
          />
        </div>

        {/* Workspace (book) — separate directory for outside teams */}
        {workspaces.length > 1 && (
          <div className="grid gap-2">
            <Label htmlFor="create-client-workspace">Workspace</Label>
            <NativeSelect id="create-client-workspace" name="workspace">
              {workspaces.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              The Client Directory book this client belongs to — only admins
              assigned to that workspace will see them.
            </p>
          </div>
        )}

        {/* Category */}
        <div className="grid gap-2">
          <Label htmlFor="create-client-category">Category</Label>
          <NativeSelect id="create-client-category" name="category">
            <option value="">Select...</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </NativeSelect>
        </div>

        {/* Book */}
        <div className="grid gap-2">
          <Label htmlFor="create-client-book">Book</Label>
          <Select value={book} onValueChange={(v) => setBook(v as ClientBook)}>
            <SelectTrigger id="create-client-book">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOOK_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {book === "pepads" && (
            <p className="text-xs text-muted-foreground">
              PepAds clients are billed manually — billing status &amp; next re-bill are
              set by hand on the directory row; no automatic re-bill alerts.
            </p>
          )}
        </div>

        {/* Website */}
        <div className="grid gap-2">
          <Label htmlFor="create-client-website">Website (optional)</Label>
          <Input
            id="create-client-website"
            name="website"
            type="text"
            placeholder="clientsite.com"
          />
        </div>

        {/* Logo */}
        <div className="grid gap-2">
          <Label>Logo (optional)</Label>
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
            <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
              <img src={logoPreview} alt="Preview" className="size-10 rounded-xl object-contain" />
              <span className="flex-1 truncate text-xs text-muted-foreground">
                {fileInputRef.current?.files?.[0]?.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Remove logo"
                onClick={() => {
                  setLogoPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                <X />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-dashed text-muted-foreground"
            >
              <Upload />
              Upload logo
            </Button>
          )}
        </div>

        {error && (
          <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
            {error}
          </div>
        )}

        {success && (
          <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.success)}>
            Client created successfully
          </div>
        )}

        <Button type="submit" disabled={isPending} className="w-full">
          <UserPlus />
          {isPending ? "Creating..." : "Create Client"}
        </Button>
      </form>
    </div>
  );
}

/** Native <select> dressed as the kit SelectTrigger. Kept native on purpose:
 *  this form is submitted as FormData, so `name=` + the browser's own value
 *  (and form.reset()) must keep working exactly as before. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          "flex h-9 w-full cursor-pointer appearance-none rounded-3xl border border-transparent bg-input/50 pl-3 pr-9 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
