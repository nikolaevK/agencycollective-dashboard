"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { AlertTriangle, Check, CheckCircle2, CloudOff, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { StatusBadge, badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ACCESS_PLATFORMS,
  ACCESS_STATUSES,
  CHANNEL_NONE,
  CHANNEL_OPTIONS,
  GOAL_OPTIONS,
  NOTES_MAX,
  ONBOARDING_SECTIONS,
  REPEAT_OPTIONS,
  REVENUE_OPTIONS,
  SELLS_OPTIONS,
  STORE_OPTIONS,
  TEXT_MAX,
  TOTAL_QUESTIONS,
  URL_MAX,
  WEBSITE_MANAGER_OPTIONS,
  countAnswered,
  emptyAnswers,
  hundredthsToInput,
  parseMoneyToCents,
  parsePercentToBps,
  type OnboardingAnswers,
  type Option,
} from "@/lib/onboardingForm";
import {
  ONBOARDING_FORM_URL,
  OnboardingSaveError,
  putOnboardingForm,
  useOnboardingForm,
  useOnboardingFormKey,
  type OnboardingFormDto,
} from "@/hooks/useOnboardingForm";
import { BreakEvenCard } from "./BreakEvenCard";

// ── Form state: money / percent fields are edited as text ─────────────────

const MONEY_KEYS = [
  "adSpendNowCents",
  "adSpendStartCents",
  "adSpend90dCents",
  "aovCents",
  "cogsCents",
  "shippingCents",
  "fulfillmentCents",
  "otherCents",
] as const;
const PCT_KEYS = ["processingBps", "refundsBps"] as const;
type NumKey = (typeof MONEY_KEYS)[number] | (typeof PCT_KEYS)[number];
type FormState = Omit<OnboardingAnswers, NumKey> & Record<NumKey, string>;
type TextKey = { [K in keyof FormState]: FormState[K] extends string ? K : never }[keyof FormState];

function toForm(a: OnboardingAnswers): FormState {
  const f = { ...a } as unknown as FormState;
  for (const k of [...MONEY_KEYS, ...PCT_KEYS]) f[k] = hundredthsToInput(a[k]);
  return f;
}

function toAnswers(f: FormState): OnboardingAnswers {
  const a = { ...f } as unknown as OnboardingAnswers;
  for (const k of MONEY_KEYS) a[k] = parseMoneyToCents(f[k]);
  for (const k of PCT_KEYS) a[k] = parsePercentToBps(f[k]);
  return a;
}

const AUTOSAVE_MS = 900;
const RETRY_MS = 5000;

// ── Presentational bits (kit) ──────────────────────────────────────────────

function Field({
  id,
  label,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="block leading-snug text-foreground">
        {label}
        {optional && <span className="ml-1 text-xs font-normal text-muted-foreground">({optional})</span>}
      </Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

// Lazy: the Radix Select (+ its popover machinery) is ~25 kB for two fields
// below the fold; the placeholder matches the trigger's box.
const ChoiceSelect = dynamic(() => import("./ChoiceSelect").then((m) => m.ChoiceSelect), {
  loading: () => <div aria-hidden className="h-9 w-full rounded-3xl bg-input/50" />,
});

function MoneyInput({
  id,
  value,
  onChange,
  placeholder,
  percent,
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  percent?: boolean;
  className?: string;
}) {
  return (
    <div className="relative">
      <span
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground",
          percent ? "right-3" : "left-3"
        )}
      >
        {percent ? "%" : "$"}
      </span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 16))}
        className={cn("font-mono tabular-nums", percent ? "pr-8" : "pl-7", className)}
      />
    </div>
  );
}

function Chips({
  legend,
  name,
  options,
  selected,
  multiple,
  onPick,
  hint,
}: {
  legend: string;
  name: string;
  options: Option[];
  selected: string[];
  multiple?: boolean;
  onPick: (value: string) => void;
  hint?: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-foreground">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <label
              key={o.value}
              className={cn(
                "relative inline-flex cursor-pointer select-none items-center gap-2 rounded-4xl border px-3.5 py-2 text-sm leading-tight transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30",
                checked
                  ? "border-foreground/20 bg-muted font-medium text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground dark:bg-transparent dark:hover:bg-input/30"
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onPick(o.value)}
                className="sr-only"
              />
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center",
                  multiple ? "rounded-[5px]" : "rounded-full",
                  checked ? "bg-primary text-primary-foreground" : "bg-input/90"
                )}
              >
                {checked &&
                  (multiple ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : (
                    <span className="size-1.5 rounded-full bg-primary-foreground" />
                  ))}
              </span>
              {o.label}
            </label>
          );
        })}
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}

function Section({ index, children }: { index: number; children: ReactNode }) {
  const def = ONBOARDING_SECTIONS[index];
  return (
    <section id={`onb-${def.id}`} className="scroll-mt-4 space-y-3">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {index + 1} of {ONBOARDING_SECTIONS.length}
        </p>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{def.heading}</h2>
        {def.why && <p className="max-w-2xl text-sm text-muted-foreground">{def.why}</p>}
      </div>
      <Card className="space-y-5 p-4 md:p-6">{children}</Card>
    </section>
  );
}

const COST_ROWS: { key: NumKey; label: string; hint: string; placeholder: string; percent?: boolean }[] = [
  { key: "aovCents", label: "Average order value", hint: "After discounts, before tax", placeholder: "89.00" },
  { key: "cogsCents", label: "Product cost (COGS)", hint: "What the product in one order costs you, landed", placeholder: "21.00" },
  { key: "shippingCents", label: "Shipping cost", hint: "What you pay the carrier, minus any shipping the customer pays", placeholder: "7.40" },
  { key: "fulfillmentCents", label: "Fulfillment / 3PL", hint: "Pick, pack and packaging", placeholder: "3.25" },
  { key: "processingBps", label: "Payment processing", hint: "Usually about 3%. High-risk is often 4–6%", placeholder: "3", percent: true },
  { key: "otherCents", label: "Other costs per order", hint: "Apps, Rx or consult fees, commissions", placeholder: "3.40" },
  { key: "refundsBps", label: "Refunds & chargebacks", hint: "As a % of revenue", placeholder: "3.5", percent: true },
];

/**
 * error   — network/server failure, retried automatically
 * failed  — the server rejected the save (4xx); retrying can't help, the
 *           next edit tries again
 * expired — signed out (401); no retry loop until they log in again
 */
type SaveState = "idle" | "saving" | "saved" | "error" | "failed" | "expired";

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="inline-flex shrink-0 items-center gap-1">
        <Loader2 className="size-3 animate-spin" /> Saving…
      </span>
    );
  if (state === "saved")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700 dark:text-emerald-300">
        <Check className="size-3" /> Saved
      </span>
    );
  if (state === "error" || state === "failed")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-destructive">
        <CloudOff className="size-3" /> {state === "error" ? "Not saved — retrying" : "Not saved"}
      </span>
    );
  if (state === "expired")
    return (
      <a
        href="/?portal=client"
        className="inline-flex shrink-0 items-center gap-1 text-destructive underline underline-offset-2"
      >
        <CloudOff className="size-3" /> Signed out — log in again
      </a>
    );
  return null;
}

// ── The form ───────────────────────────────────────────────────────────────

function QuestionnaireForm({ initial }: { initial: OnboardingFormDto }) {
  const qc = useQueryClient();
  const formKey = useOnboardingFormKey();
  const [form, setForm] = useState<FormState>(() => toForm(initial.answers));
  const [record, setRecord] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Autosave bookkeeping lives in refs: edits bump `version`; a save records
  // the version it sent; saves never overlap (a change mid-save re-arms the
  // timer once the in-flight one lands).
  const formRef = useRef(form);
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const savingRef = useRef(false);
  /** The autosave PUT on the wire, if any — a submit waits for it to land. */
  const inflightRef = useRef<Promise<unknown> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const applyRecord = useCallback(
    (rec: OnboardingFormDto) => {
      setRecord(rec);
      qc.setQueryData(formKey, { ...rec, answers: toAnswers(formRef.current) });
    },
    [qc, formKey]
  );

  const schedule = useCallback((ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), ms);
  }, []);

  flushRef.current = async () => {
    if (savingRef.current || versionRef.current === savedVersionRef.current) return;
    savingRef.current = true;
    const version = versionRef.current;
    setSaveState("saving");
    /** null = saved; 0 = network error; else the HTTP status. */
    let failure: number | null = null;
    try {
      const req = putOnboardingForm(toAnswers(formRef.current), false);
      inflightRef.current = req;
      const rec = await req;
      savedVersionRef.current = Math.max(savedVersionRef.current, version);
      applyRecord(rec);
    } catch (err) {
      failure = err instanceof OnboardingSaveError ? err.status : 0;
    } finally {
      savingRef.current = false;
    }
    if (versionRef.current === savedVersionRef.current) {
      setSaveState("saved");
    } else if (failure === null) {
      // Edited while this save was on the wire.
      setSaveState("saving");
      schedule(AUTOSAVE_MS);
    } else if (failure === 401) {
      // Signed out: retrying can't succeed. The edits stay on screen (and
      // unsaved), and the next edit tries again — e.g. after logging back in
      // from another tab.
      setSaveState("expired");
    } else if (failure >= 400 && failure < 500) {
      setSaveState("failed");
    } else {
      setSaveState("error");
      schedule(RETRY_MS);
    }
  };

  const update = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      versionRef.current++;
      schedule(AUTOSAVE_MS);
    },
    [schedule]
  );

  // Leaving the page (tab hidden, navigation, unmount) with unsaved edits:
  // fire a keepalive PUT so nothing typed is lost.
  useEffect(() => {
    const flushOnLeave = () => {
      if (versionRef.current === savedVersionRef.current) return;
      const prevSaved = savedVersionRef.current;
      const sent = versionRef.current;
      savedVersionRef.current = sent;
      const answers = toAnswers(formRef.current);
      qc.setQueryData<OnboardingFormDto>(formKey, (old) => (old ? { ...old, answers } : old));
      fetch(ONBOARDING_FORM_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, submit: false }),
        keepalive: true,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
        .catch(() => {
          // A hidden tab is still alive: un-mark the edits so the regular
          // autosave retries them instead of treating them as saved.
          if (savedVersionRef.current === sent) {
            savedVersionRef.current = prevSaved;
            schedule(RETRY_MS);
          }
        });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushOnLeave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushOnLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushOnLeave);
      if (timerRef.current) clearTimeout(timerRef.current);
      flushOnLeave();
    };
  }, [qc, schedule, formKey]);

  const answers = useMemo(() => toAnswers(form), [form]);
  const answered = countAnswered(answers);
  const pct = Math.round((answered / TOTAL_QUESTIONS) * 100);
  const submitted = record.status === "submitted";

  function toggleMulti(key: "sells" | "channels", value: string) {
    const current = form[key];
    let next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    // "Nothing yet" clears the other channels, and vice versa.
    if (key === "channels" && next.includes(value)) {
      next = value === CHANNEL_NONE ? [CHANNEL_NONE] : next.filter((v) => v !== CHANNEL_NONE);
    }
    update(key, next);
  }

  async function submit() {
    setSubmitError(null);
    if (!form.brandName.trim()) {
      setSubmitError("Add your brand name before submitting.");
      document.getElementById("q_brand")?.focus();
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setSubmitting(true);
    // An autosave already on the wire carries OLDER answers — if it reached
    // the server after this submit it would overwrite them. Let it land
    // first, and hold further autosaves until the submit is done.
    if (savingRef.current) await inflightRef.current?.catch(() => {});
    if (timerRef.current) clearTimeout(timerRef.current);
    savingRef.current = true;
    const version = versionRef.current;
    try {
      const rec = await putOnboardingForm(toAnswers(formRef.current), true);
      savedVersionRef.current = Math.max(savedVersionRef.current, version);
      applyRecord(rec);
      setJustSubmitted(true);
      setSaveState("saved");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't submit — please try again.");
      if (err instanceof OnboardingSaveError && err.status === 401) setSaveState("expired");
    } finally {
      savingRef.current = false;
      setSubmitting(false);
    }
    // Edits made while the submit was in flight still need saving.
    if (versionRef.current !== savedVersionRef.current) schedule(AUTOSAVE_MS);
  }

  function clearForm() {
    setForm(toForm(emptyAnswers()));
    versionRef.current++;
    setConfirmClear(false);
    schedule(0);
    document.getElementById("onboarding-top")?.scrollIntoView({ block: "start" });
  }

  const text = (key: TextKey) => ({
    value: form[key],
    onChange: (e: { target: { value: string } }) => update(key, e.target.value),
  });

  const submittedNote = (
    <div className={cn("flex items-start gap-3 rounded-2xl border p-4", badgeTone.success)}>
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {justSubmitted
            ? "Thanks — your answers are with your account manager."
            : `Submitted ${formatDate(record.submittedAt)}`}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          You can keep updating your answers. Changes save automatically, and your account manager always
          sees the latest version.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8" id="onboarding-top">
      {/* Intro */}
      <Card className="p-5 md:p-8">
        <p className="mb-3 text-xs text-muted-foreground">
          Agency Collective · New client onboarding
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
          Let&apos;s get you set up
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Five short sections: your brand, your goals, your cost per order, and which platforms we&apos;ll need
          access to. Rough numbers are fine. We tighten everything up on the kickoff call.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            <><b className="font-medium text-foreground">About 10 minutes</b></>,
            <>Saves as you type, so you can <b className="font-medium text-foreground">come back later</b></>,
            <><b className="font-medium text-foreground">No passwords</b> anywhere on this form</>,
          ].map((fact, i) => (
            <span
              key={i}
              className="rounded-full bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground"
            >
              {fact}
            </span>
          ))}
        </div>
      </Card>

      {submitted && submittedNote}

      {/* 1 · The brand */}
      <Section index={0}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="q_brand" label="Brand name">
            <Input id="q_brand" type="text" autoComplete="organization" maxLength={TEXT_MAX} {...text("brandName")} />
          </Field>
          <Field id="q_site" label="Website">
            <Input id="q_site" type="text" inputMode="url" autoCapitalize="off" placeholder="https://" maxLength={URL_MAX} {...text("website")} />
          </Field>
        </div>
        <Chips legend="What you sell" name="sells" options={SELLS_OPTIONS} selected={form.sells} multiple onPick={(v) => toggleMulti("sells", v)} />
        <Field id="q_hero" label="Main product you want us to push">
          <Input id="q_hero" type="text" placeholder="e.g. Daily Greens 30ct" maxLength={TEXT_MAX} {...text("heroProduct")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="q_contact" label="Main point of contact" hint="Name, email, phone">
            <Input id="q_contact" type="text" maxLength={TEXT_MAX} {...text("mainContact")} />
          </Field>
          <Field id="q_approver" label="Who approves ads?" optional="if different" hint="Name, email">
            <Input id="q_approver" type="text" maxLength={TEXT_MAX} {...text("adApprover")} />
          </Field>
        </div>
      </Section>

      {/* 2 · Performance and goals */}
      <Section index={1}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="q_rev" label="Monthly revenue right now">
            <ChoiceSelect id="q_rev" value={form.monthlyRevenue} options={REVENUE_OPTIONS} onChange={(v) => update("monthlyRevenue", v)} />
          </Field>
          <Field id="q_spend_now" label="Monthly ad spend right now">
            <MoneyInput id="q_spend_now" placeholder="0" value={form.adSpendNowCents} onChange={(v) => update("adSpendNowCents", v)} />
          </Field>
        </div>
        <Chips legend="Channels running now" name="channels" options={CHANNEL_OPTIONS} selected={form.channels} multiple onPick={(v) => toggleMulti("channels", v)} />
        <Field id="q_roas_now" label="Current ROAS or MER" optional="if you know it">
          <Input id="q_roas_now" type="text" placeholder="e.g. 2.1 on Meta, 3.4 blended" maxLength={TEXT_MAX} {...text("roasNow")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="q_spend_start" label="Monthly ad spend to start with">
            <MoneyInput id="q_spend_start" placeholder="0" value={form.adSpendStartCents} onChange={(v) => update("adSpendStartCents", v)} />
          </Field>
          <Field id="q_spend_90" label="Monthly ad spend you want in 90 days">
            <MoneyInput id="q_spend_90" placeholder="0" value={form.adSpend90dCents} onChange={(v) => update("adSpend90dCents", v)} />
          </Field>
        </div>
        <Chips
          legend="Your number one goal"
          name="goal"
          options={GOAL_OPTIONS}
          selected={form.primaryGoal ? [form.primaryGoal] : []}
          onPick={(v) => update("primaryGoal", v)}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="q_target" label="ROAS or CPA target" optional="if you have one">
            <Input id="q_target" type="text" placeholder="e.g. 2.5 ROAS or $45 CPA" maxLength={TEXT_MAX} {...text("target")} />
          </Field>
          <Field id="q_win" label="What does a win look like in 90 days?">
            <Input id="q_win" type="text" placeholder="One line" maxLength={TEXT_MAX} {...text("win90d")} />
          </Field>
        </div>
      </Section>

      {/* 3 · Cost per order */}
      <Section index={2}>
        <div className="divide-y overflow-hidden rounded-2xl border">
          {COST_ROWS.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_9rem] sm:px-4"
            >
              <label htmlFor={`e_${row.key}`} className="cursor-pointer text-sm font-medium leading-snug text-foreground">
                {row.label}
                <small className="mt-0.5 block text-xs font-normal text-muted-foreground">{row.hint}</small>
              </label>
              <MoneyInput
                id={`e_${row.key}`}
                percent={row.percent}
                placeholder={row.placeholder}
                value={form[row.key]}
                onChange={(v) => update(row.key, v)}
                className="text-right"
              />
            </div>
          ))}
        </div>
        <BreakEvenCard costs={answers} showExample />
        <Chips
          legend="Do customers buy again?"
          name="repeat"
          options={REPEAT_OPTIONS}
          selected={form.repeatPurchase ? [form.repeatPurchase] : []}
          onPick={(v) => update("repeatPurchase", v)}
          hint="If people reorder, we can afford to pay more for the first order. We'll model that with you."
        />
      </Section>

      {/* 4 · Platforms & access */}
      <Section index={3}>
        <Chips
          legend="Your store runs on"
          name="store"
          options={STORE_OPTIONS}
          selected={form.storePlatform ? [form.storePlatform] : []}
          onPick={(v) => update("storePlatform", v)}
        />
        <div className="divide-y overflow-hidden rounded-2xl border">
          {ACCESS_PLATFORMS.map((p) => (
            <div
              key={p.value}
              role="radiogroup"
              aria-labelledby={`acc_${p.value}`}
              className="grid gap-2.5 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-4"
            >
              <div id={`acc_${p.value}`} className="min-w-0">
                <p className="text-sm font-medium text-foreground">{p.label}</p>
                <p className="text-xs text-muted-foreground">{p.hint}</p>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-3xl bg-muted p-1 sm:inline-grid">
                {ACCESS_STATUSES.map((s) => {
                  const checked = form.access[p.value] === s.value;
                  return (
                    <label
                      key={s.value}
                      className={cn(
                        "relative flex cursor-pointer items-center justify-center rounded-3xl px-2 py-1.5 text-center text-xs font-medium leading-tight transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/30 sm:whitespace-nowrap sm:px-3",
                        checked
                          ? "bg-background text-foreground shadow-sm dark:bg-input/30"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <input
                        type="radio"
                        name={`access_${p.value}`}
                        value={s.value}
                        checked={checked}
                        onChange={() => update("access", { ...form.access, [p.value]: s.value })}
                        className="sr-only"
                      />
                      {s.label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="q_access_who" label="Who can give us access?" hint="Name, email">
            <Input id="q_access_who" type="text" maxLength={TEXT_MAX} {...text("accessContact")} />
          </Field>
          <Field id="q_web" label="Who manages your website?" hint="For installing pixels and page changes">
            <ChoiceSelect id="q_web" value={form.websiteManager} options={WEBSITE_MANAGER_OPTIONS} onChange={(v) => update("websiteManager", v)} />
          </Field>
        </div>
        <Field
          id="q_assets"
          label="Link to your brand assets"
          hint="One Google Drive or Dropbox folder: logos, product photos, past ads. You can also upload files under My Brand."
        >
          <Input id="q_assets" type="text" inputMode="url" autoCapitalize="off" placeholder="https://" maxLength={URL_MAX} {...text("assetsUrl")} />
        </Field>
        <p className={cn("flex gap-2.5 rounded-2xl border px-4 py-3 text-sm", badgeTone.warning)}>
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            <b className="font-semibold">Never send passwords.</b> Not on this form,
            not in Slack, not by email. Everything we need works through partner or user invites.
          </span>
        </p>
      </Section>

      {/* 5 · Anything else */}
      <Section index={4}>
        <Field
          id="q_notes"
          label="Anything we should know?"
          hint="Past agencies, what hasn't worked, ad account bans or restrictions, compliance limits, launch dates"
        >
          <Textarea id="q_notes" rows={4} maxLength={NOTES_MAX} className="min-h-[96px] resize-y" {...text("notes")} />
        </Field>
      </Section>

      {/* Send */}
      <Card className="space-y-4 p-5 md:p-7">
        {submitted ? (
          submittedNote
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Send it to us</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Submit and your answers go straight to your account manager. You can still edit them afterwards.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="lg" onClick={submit} disabled={submitting}>
                {submitting && <Loader2 className="animate-spin" />}
                Submit answers
              </Button>
              {confirmClear ? (
                <span className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                  Clear every answer on this form?
                  <Button type="button" variant="destructive" size="sm" onClick={clearForm}>
                    Yes, clear it
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
                    Keep my answers
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmClear(true)}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  Clear form
                </Button>
              )}
            </div>
          </>
        )}
        {submitError && (
          <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
            <AlertTriangle className="size-4 shrink-0" />
            {submitError}
          </p>
        )}
      </Card>

      {/* Sticky progress bar — sits above the mobile bottom nav */}
      <div className="sticky bottom-[calc(5.5rem_+_env(safe-area-inset-bottom))] z-30 md:bottom-4">
        <div className="flex items-center gap-3 rounded-3xl bg-card/95 px-4 py-3 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 truncate tabular-nums">
                {answered} of {TOTAL_QUESTIONS} answered
              </span>
              <SaveIndicator state={saveState} />
            </div>
            <Progress value={pct} className="h-1.5 [&>div]:bg-chart-1" />
          </div>
          {submitted ? (
            <StatusBadge tone="success" className="shrink-0">
              Submitted
            </StatusBadge>
          ) : (
            <Button type="button" size="sm" onClick={submit} disabled={submitting} className="shrink-0">
              {submitting && <Loader2 className="animate-spin" />}
              Submit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Portal → Onboarding → Questionnaire. */
export function OnboardingQuestionnaire() {
  const { data, isLoading, error } = useOnboardingForm();
  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 rounded-3xl" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className={cn("rounded-2xl border p-4 text-sm", badgeTone.danger)}>
        We couldn&apos;t load your questionnaire. Refresh the page to try again.
      </p>
    );
  }
  return <QuestionnaireForm initial={data} />;
}
