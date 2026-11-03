"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createNdjsonDecoder } from "@/lib/adCopy/ndjson";
import { parsePartialJson } from "@/lib/adCopy/partialJson";
import { partialResult } from "@/lib/adCopy/variants";
import type { AdCopyErrorCode, AdCopyResult, AdCopyStreamEvent, CopyField } from "@/lib/adCopy/types";

/**
 * One streaming generation at a time against POST /api/ad-copy (NDJSON).
 * Exposes the live phase, a throttled partial parse of the JSON as it
 * streams (so variants appear while they're written), and Claude's short
 * thinking summary. Stop aborts the request — the route aborts the Claude
 * call too — and hands back whatever was written so far.
 */

export type GenTarget = { kind: "full" } | { kind: "variant"; field: CopyField; id: string };
export type GenPhase = "idle" | "images" | "thinking" | "writing";

export interface GenState {
  running: boolean;
  phase: GenPhase;
  target: GenTarget | null;
  partial: AdCopyResult | null;
  thinking: string;
  fallback: { from: string; to: string } | null;
}

export type GenOutcome =
  | { ok: true; result: AdCopyResult; imagesSkipped: number; model: string; fallback: { from: string; to: string } | null }
  | { ok: false; code: AdCopyErrorCode | "http"; message: string; partial: AdCopyResult | null };

const IDLE: GenState = { running: false, phase: "idle", target: null, partial: null, thinking: "", fallback: null };
const PARSE_EVERY_MS = 120;
const THINKING_TAIL = 400;

function hasContent(r: AdCopyResult): boolean {
  return r.primaryTexts.some((p) => p.text.trim()) || r.headlines.length > 0 || r.descriptions.length > 0;
}

export function useAdCopyStream() {
  const [state, setState] = useState<GenState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);

  // The panel can unmount (sign-out, navigation) mid-stream: stop the request.
  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const run = useCallback(async (body: unknown, target: GenTarget): Promise<GenOutcome> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...IDLE, running: true, phase: "images", target });

    let text = "";
    let thinking = "";
    let fallback: { from: string; to: string } | null = null;
    let lastParse = 0;
    let lastThinking = 0;
    const partialNow = () => {
      const r = partialResult(parsePartialJson(text));
      return hasContent(r) ? r : null;
    };

    try {
      const res = await fetch("/api/ad-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        const message =
          json?.error ??
          (res.status === 413 ? "The images are too large to send — remove some uploads." : `Generation failed (${res.status}).`);
        return { ok: false, code: res.status === 429 ? "rate_limited" : "http", message, partial: null };
      }
      const reader = res.body?.getReader();
      if (!reader) return { ok: false, code: "upstream", message: "No response stream.", partial: null };

      const decoder = new TextDecoder();
      const ndjson = createNdjsonDecoder();
      let done: Extract<AdCopyStreamEvent, { t: "done" }> | null = null;
      let failure: Extract<AdCopyStreamEvent, { t: "error" }> | null = null;

      const handle = (event: AdCopyStreamEvent) => {
        switch (event.t) {
          case "status":
            setState((s) => ({ ...s, phase: event.phase }));
            break;
          case "thinking": {
            // Same 120 ms gate as the text: every delta re-rendered the whole generator.
            thinking = (thinking + event.text).slice(-THINKING_TAIL);
            const now = Date.now();
            if (now - lastThinking >= PARSE_EVERY_MS) {
              lastThinking = now;
              const tail = thinking;
              setState((s) => ({ ...s, thinking: tail }));
            }
            break;
          }
          case "text": {
            text += event.text;
            const now = Date.now();
            if (now - lastParse >= PARSE_EVERY_MS) {
              lastParse = now;
              const partial = partialNow();
              setState((s) => ({ ...s, phase: "writing", partial }));
            }
            break;
          }
          case "fallback":
            fallback = { from: event.from, to: event.to };
            setState((s) => ({ ...s, fallback }));
            break;
          case "done":
            done = event;
            break;
          case "error":
            failure = event;
            break;
        }
      };

      for (;;) {
        const { done: finished, value } = await reader.read();
        if (finished) break;
        ndjson.push(decoder.decode(value, { stream: true })).forEach(handle);
      }
      ndjson.push(decoder.decode()).forEach(handle);
      ndjson.flush().forEach(handle);

      const ok = done as Extract<AdCopyStreamEvent, { t: "done" }> | null;
      if (ok) return { ok: true, result: ok.result, imagesSkipped: ok.imagesSkipped, model: ok.model, fallback };
      const err = failure as Extract<AdCopyStreamEvent, { t: "error" }> | null;
      if (err) return { ok: false, code: err.code, message: err.message, partial: partialNow() };
      return { ok: false, code: "upstream", message: "The connection closed before the copy was finished.", partial: partialNow() };
    } catch (err) {
      if ((err as Error).name === "AbortError") return { ok: false, code: "aborted", message: "Stopped.", partial: partialNow() };
      return { ok: false, code: "upstream", message: "Network error — check your connection and try again.", partial: partialNow() };
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setState(IDLE);
      }
    }
  }, []);

  return { state, run, stop };
}
