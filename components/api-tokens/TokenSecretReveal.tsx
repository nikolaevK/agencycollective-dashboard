"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TokenSecretRevealProps {
  open: boolean;
  tokenName: string;
  secret: string;
  onClose: () => void;
}

/** Shown-once plaintext secret after create/rotate. Not re-fetchable.
 *  Only the explicit "I've saved my token" button closes it — no X, no
 *  Escape, no outside click — so the secret can't be dismissed by accident. */
export function TokenSecretReveal({ open, tokenName, secret, onClose }: TokenSecretRevealProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — user can select the text manually.
    }
  }

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-lg"
      >
        <DialogHeader className="flex-row items-center gap-3 space-y-0">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <KeyRound className="size-5 text-muted-foreground" />
          </span>
          <div className="grid min-w-0 gap-1.5">
            <DialogTitle>Token created</DialogTitle>
            <DialogDescription className="break-all">{tokenName}</DialogDescription>
          </div>
        </DialogHeader>

        <div
          role="note"
          className={cn("flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-xs", badgeTone.warning)}
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            Copy this token now — it is shown only once and cannot be retrieved
            again. If you lose it, rotate the token to mint a new secret.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap rounded-2xl bg-muted px-3 py-2.5 font-mono text-sm text-foreground">
            {secret}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            onClick={handleCopy}
            title="Copy token"
            aria-label={copied ? "Token copied" : "Copy token"}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <p aria-live="polite" className="sr-only">
          {copied ? "Token copied to clipboard" : ""}
        </p>

        <DialogFooter>
          <Button type="button" onClick={onClose}>
            I&apos;ve saved my token
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
