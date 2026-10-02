"use client";

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
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
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/20",
          error ? "border-destructive/60" : "border-input",
          disabled && "opacity-60"
        )}
      >
        {emails.map((cc) => (
          <span
            key={cc}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground"
          >
            <span className="truncate">{cc}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                setEmails(emails.filter((x) => x !== cc));
                setError(null);
                markEdited();
              }}
              // -m-1.5 p-1.5: a ~24px tap target on touch without widening the chip.
              className="-m-1.5 p-1.5 text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${cc}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          inputMode="email"
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
          className="flex-1 min-w-[140px] bg-transparent py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <div className="mt-1 flex items-start justify-between gap-2">
        {error ? <p className="text-xs text-destructive">{error}</p> : <span />}
        {emails.length > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {emails.length}/{max}
          </span>
        )}
      </div>
    </div>
  );
}
