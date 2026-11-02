"use client";

import { useState, useRef, useTransition } from "react";
import { X, Upload, Trash2, Sparkles, Frame } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Switch } from "@/components/ui/switch";
import { updateUserAction, removeUserLogoAction } from "@/app/actions/users";
import { CATEGORIES } from "./types";
import type { ClientPublic } from "./types";
import type { UserStatus } from "@/lib/users";
import { BOOK_OPTIONS, type ClientBook } from "@/lib/clientProfile";
import {
  useClientProfileMutations,
  type ClientProfilePatch,
} from "@/hooks/useClientProfileMutations";
import { useWorkspaces } from "@/hooks/useWorkspaces";

// Radix SelectItem can't hold "" — the "None" category maps to this.
const NONE = "__none__";

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
  // Fall back to true if the field is missing from the API response so a
  // stale frontend reading a fresh server (or vice versa) can't accidentally
  // disable an enabled user when the admin saves without touching the toggle.
  const [analystEnabled, setAnalystEnabled] = useState<boolean>(client.analystEnabled ?? true);
  const [designBoardEnabled, setDesignBoardEnabled] = useState<boolean>(client.designBoardEnabled ?? true);
  const [designBoardUrl, setDesignBoardUrl] = useState(client.designBoardUrl ?? "");
  // Roster profile fields (saved via the profile PATCH, not updateUserAction)
  const [website, setWebsite] = useState(client.profile?.website ?? "");
  const [book, setBook] = useState<ClientBook>(client.profile?.book ?? "agency");
  // Workspace (book) move — unscoped admins only; the server rejects it for
  // everyone else, and the select is hidden for single-workspace setups.
  const { workspaces, canManage } = useWorkspaces();
  const [workspace, setWorkspace] = useState(client.workspace);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Through the shared hook so the write joins the per-client queue (an inline
  // website edit on the directory row must not race this modal's PATCH).
  const { patchProfile } = useClientProfileMutations();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("id", client.id);
    formData.set("displayName", displayName);
    formData.set("email", email);
    formData.set("category", category);
    formData.set("status", status);
    formData.set("analystEnabled", analystEnabled ? "true" : "false");
    formData.set("designBoardEnabled", designBoardEnabled ? "true" : "false");
    formData.set("designBoardUrl", designBoardUrl);
    if (canManage && workspace && workspace !== client.workspace) {
      formData.set("workspace", workspace);
    }

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
        return;
      }

      // Roster fields live in client_profile — send only what changed so a
      // concurrent inline edit of an untouched field isn't clobbered.
      const profileChanges: ClientProfilePatch = {};
      if ((client.profile?.website ?? "") !== website.trim()) {
        profileChanges.website = website.trim() || null;
      }
      if ((client.profile?.book ?? "agency") !== book) {
        profileChanges.book = book;
      }
      if (Object.keys(profileChanges).length > 0) {
        try {
          await patchProfile.mutateAsync({ userId: client.id, changes: profileChanges });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save roster fields");
          return;
        }
      }

      onUpdated();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        // The old modal had no Escape handler — it closes only via the X
        // button or a backdrop click.
        onEscapeKeyDown={(e) => e.preventDefault()}
        aria-describedby={undefined}
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-14">
          <DialogTitle>Edit Client</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-client-name">Display Name</Label>
              <Input
                id="edit-client-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-client-email">Email</Label>
              <Input
                id="edit-client-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-client-category">Category</Label>
              <Select
                value={category || NONE}
                onValueChange={(v) => setCategory(v === NONE ? "" : v)}
              >
                <SelectTrigger id="edit-client-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                  {/* The API accepts any category text — show a stored one
                      that isn't in the list instead of a blank field. */}
                  {category && !(CATEGORIES as readonly string[]).includes(category) && (
                    <SelectItem value={category}>{category}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {canManage && workspaces.length > 1 && (
              <div className="grid gap-2">
                <Label htmlFor="edit-client-workspace">Workspace</Label>
                <Select value={workspace} onValueChange={(v) => setWorkspace(v)}>
                  <SelectTrigger id="edit-client-workspace">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((w) => (
                      <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Moving a client changes which team&apos;s Client Directory it appears in.
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="edit-client-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as UserStatus)}>
                <SelectTrigger id="edit-client-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-client-book">Book</Label>
              <Select value={book} onValueChange={(v) => setBook(v as ClientBook)}>
                <SelectTrigger id="edit-client-book">
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
                  PepAds clients are billed manually — the computed re-bill schedule and its
                  alerts don&apos;t apply; set billing status &amp; next re-bill on the row.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-client-website">Website</Label>
              <Input
                id="edit-client-website"
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="clientsite.com"
              />
            </div>

            {/* AI Analyst access toggle */}
            <div className="grid gap-2">
              <Label>Portal Features</Label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-muted/50 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Sparkles className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">AI Analyst access</p>
                    <p className="text-xs text-muted-foreground">
                      {analystEnabled
                        ? "Client can chat with the AI Analyst in their portal."
                        : "Disabled — client sees no Analyst nav item or page."}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={analystEnabled}
                  onCheckedChange={(v) => setAnalystEnabled(v)}
                  aria-label="AI Analyst access"
                />
              </label>
            </div>

            {/* Design Board access toggle + Figma link */}
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-muted/50 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Frame className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Design Board access</p>
                    <p className="text-xs text-muted-foreground">
                      {designBoardEnabled
                        ? "Client sees an embedded Figma board — once a link is set below."
                        : "Disabled — client sees no Design Board nav item or page."}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={designBoardEnabled}
                  onCheckedChange={(v) => setDesignBoardEnabled(v)}
                  aria-label="Design Board access"
                />
              </label>
              {designBoardEnabled && (
                <div className="grid gap-2">
                  <Input
                    type="url"
                    value={designBoardUrl}
                    onChange={(e) => setDesignBoardUrl(e.target.value)}
                    placeholder="https://www.figma.com/design/…"
                    aria-label="Design Board Figma link"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste a Figma share link (set the file to “Anyone with the link”). Leave empty to hide the board.
                  </p>
                </div>
              )}
            </div>

            {/* Logo */}
            <div className="grid gap-2">
              <Label>Logo</Label>
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
                <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
                  <img src={logoPreview} alt="New logo" className="size-10 rounded-xl object-contain" />
                  <span className="flex-1 truncate text-xs text-muted-foreground">New logo selected</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Discard new logo"
                    onClick={() => {
                      setLogoPreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <X />
                  </Button>
                </div>
              ) : client.logoPath && !logoRemoved ? (
                <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
                  <img src={client.logoPath} alt="Current logo" className="size-10 rounded-xl object-contain" />
                  <span className="flex-1 text-xs text-muted-foreground">Current logo</span>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setLogoRemoved(true)}
                    title="Remove logo"
                    aria-label="Remove logo"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
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
                  {logoRemoved ? "Upload new logo" : "Upload logo"}
                </Button>
              )}
            </div>

            {!client.email && (
              <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.warning)}>
                This client has no email set. They cannot log in to the portal until an email is added.
              </div>
            )}

            {error && (
              <div className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
                {error}
              </div>
            )}
          </div>

          <div className="shrink-0 px-6 pb-6 pt-2">
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
