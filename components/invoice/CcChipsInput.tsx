"use client";

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCc, finalizeCcList, extractEmails, normalizeCcList, DEFAULT_MAX_CC } from "@/lib/invoice/email";

/**
 * CC state for a send surface: the committed chips, the typed-but-not-yet-
 * committed text, and the field's inline error. `finalize` is what a send
 * handler calls — it commits pending text (or reports why it can't) so a CC
 * typed without pressing Enter is never silently dropped.
 *
 * `onUserEdit` fires on every change the person makes in the field (typing,
 * adding/removing a chip) — NOT on programmatic `setEmails` seeding — so a
 * drawer can mark itself dirty and guard close/re-seed like its other inputs.
 */
export function useCcField(max = DEFAULT_MAX_CC, onUserEdit?: () => void) {
  const [emails, setEmailsState] = useState<string[]>([]);
  // Seeded lists (saved drafts, a deal's CCs) get the same normalization the
  // chips apply — a stored "Bob@x.com" and a typed "bob@x.com" aren't two CCs.
  const setEmails = useCallback((list: string[]) => setEmailsState(normalizeCcList(list)), []);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const onUserEditRef = useRef(onUserEdit);
  onUserEditRef.current = onUserEdit;
  const markEdited = useCallback(() => onUserEditRef.current?.(), []);

  const finalize = useCallback(
    (exclude: (string | null | undefined)[] = []): string[] | null => {
      const res = finalizeCcList(emails, draft, { max, exclude });
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      setEmails(res.list);
      setDraft("");
      setError(null);
      return res.list;
    },
    [emails, draft, max, setEmails]
  );

  return { emails, setEmails, draft, setDraft, error, setError, max, finalize, markEdited };
}

export type CcField = ReturnType<typeof useCcField>;

interface Props {
  field: CcField;
  /** Addresses that can't be CC'd — the primary recipient. */
  exclude?: (string | null | undefined)[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Chip input for CC recipients. Enter / Tab / comma / semicolon commit,
 * pasting a list splits it, Backspace on an empty field removes the last
 * chip, and errors render right under the field.
 */
export function CcChipsInput({ field, exclude = [], placeholder = "add CC email…", id, disabled }: Props) {
  const { emails, setEmails, draft, setDraft, error, setError, max, markEdited } = field;

  function commit(raw: string): boolean {
    const res = addCc(emails, raw, { max, exclude });
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    setEmails(res.list);
    setDraft("");
    setError(null);
    markEdited();
    return true;
  }

  function commitMany(tokens: string[]) {
    let list = emails;
    let firstError: string | null = null;
    const rejected: string[] = [];
    for (const t of tokens) {
      if (!t.trim()) continue;
      const res = addCc(list, t, { max, exclude });
      if (res.ok) list = res.list;
      else if (res.code !== "duplicate" && res.code !== "recipient") {
        rejected.push(t.trim());
        if (firstError === null) firstError = res.error;
      }
    }
    setEmails(list);
    // Leave what couldn't be added in the field to fix, instead of dropping it.
    setDraft(rejected.join(", "));
    setError(firstError);
    markEdited();
  }

  return (
    <div>
      {/* Looks like one Luma input: chips + the typing field share the pill. */}
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-2xl border bg-input/50 px-2 py-1.5 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
          error
            ? "border-destructive ring-[3px] ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20"
            : "border-transparent",
          disabled && "opacity-50"
        )}
      >
        {/* overflow-visible: the badge's clip would cut the remove button's
            touch area; the address span truncates on its own. */}
        {emails.map((cc) => (
          <Badge key={cc} variant="secondary" className="h-6 max-w-full gap-0.5 overflow-visible pl-2 pr-0 font-normal">
            <span className="truncate">{cc}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={disabled}
              onClick={() => {
                setEmails(emails.filter((x) => x !== cc));
                setError(null);
                markEdited();
              }}
              className="text-muted-foreground hover:bg-foreground/10"
              aria-label={`Remove ${cc}`}
            >
              <X className="size-3.5" />
            </Button>
          </Badge>
        ))}
        <Input
          id={id}
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          disabled={disabled}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]$/.test(v)) {
              commit(v);
            } else {
              setDraft(v);
              if (error) setError(null);
              markEdited();
            }
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === "Tab") && draft.trim()) {
              // Tab only swallows focus movement when it committed a chip.
              if (commit(draft) || e.key === "Enter") e.preventDefault();
            } else if (e.key === "Enter") {
              e.preventDefault();
            } else if (e.key === "Backspace" && !draft && emails.length > 0) {
              e.preventDefault();
              setEmails(emails.slice(0, -1));
              markEdited();
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (!/[\s,;<]/.test(text.trim())) return; // one plain address pastes normally
            e.preventDefault();
            // Keep what was already typed (caret is almost always at the end),
            // and pull addresses out of "Jane Doe <jane@x.com>"-style entries;
            // a segment with no address stays as typed so its error shows.
            const tokens = (draft + text)
              .split(/[,;\n]+/)
              .flatMap((seg) => {
                const found = extractEmails(seg);
                return found.length > 0 ? found : seg.trim().split(/\s+/);
              });
            commitMany(tokens);
          }}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          placeholder={emails.length === 0 ? placeholder : ""}
          // Borderless: the pill around the chips is the visible field.
          className="h-6 w-auto min-w-[140px] flex-1 rounded-none border-0 bg-transparent px-1 py-0 focus-visible:ring-0 disabled:opacity-100"
        />
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-2">
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        {emails.length > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {emails.length}/{max}
          </span>
        )}
      </div>
    </div>
  );
}
