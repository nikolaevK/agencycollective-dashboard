"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, ExternalLink, Loader2, Send, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { ctaLabelOf, isPlainEmail, withService, type OfferPageSettings } from "@/lib/portalOfferRules";
import type { PortalOffer } from "@/lib/portalOffers";

type PanelOffer = Pick<PortalOffer, "id" | "title" | "ctaType" | "ctaLabel" | "ctaUrl" | "links">;
export type OfferPanelCopy = Pick<
  OfferPageSettings,
  | "ctaEyebrow"
  | "ctaHeading"
  | "ctaBodyRequest"
  | "ctaBodyBooking"
  | "ctaFootnote"
  | "formIntro"
  | "formEmailLabel"
  | "formPhoneLabel"
  | "formMessageLabel"
  | "formMessagePlaceholder"
  | "formSubmit"
  | "requestSentLabel"
  | "requestSuccess"
  | "bookingSuccess"
  | "bookingSuccessBody"
  | "bookingLinkLabel"
>;

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

/**
 * The service page's call to action. Request Info opens a short prefilled
 * form; Book a Call files the lead AND opens the booking page — either way
 * the request lands in the dashboard, so the team hears about it even if the
 * client never finishes booking. Also counts the page view and link clicks.
 * The wording comes from the admin Page design. `preview` (the admin editor)
 * tracks and files nothing.
 */
export function OfferRequestPanel({
  offer,
  copy,
  requestedAt: initialRequestedAt,
  defaultEmail,
  preview = false,
}: {
  offer: PanelOffer;
  copy: OfferPanelCopy;
  requestedAt: string | null;
  defaultEmail: string | null;
  preview?: boolean;
}) {
  const [requestedAt, setRequestedAt] = useState(initialRequestedAt);
  const [formOpen, setFormOpen] = useState(false);
  // A malformed address on file isn't pre-filled: the server would reject it as typed.
  const [email, setEmail] = useState(defaultEmail && isPlainEmail(defaultEmail) ? defaultEmail : "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The request date is formatted in the viewer's timezone, which the server
  // doesn't know — render it after mount so SSR and hydration agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const viewed = useRef(false);
  useEffect(() => {
    if (preview || viewed.current) return; // StrictMode mounts twice in dev
    viewed.current = true;
    fetch(`/api/portal/offers/${offer.id}/view`, { method: "POST", keepalive: true }).catch(() => {});
  }, [offer.id, preview]);

  function linkClicked() {
    if (preview) return;
    fetch(`/api/portal/offers/${offer.id}/click`, { method: "POST", keepalive: true }).catch(() => {});
  }

  async function fileRequest(body: Record<string, string>): Promise<boolean> {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/offers/${offer.id}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? "Something went wrong — please try again.");
        return false;
      }
      setRequestedAt(json?.data?.createdAt ?? new Date().toISOString());
      return true;
    } catch {
      setError("Couldn't reach the server — please try again.");
      return false;
    } finally {
      setSending(false);
    }
  }

  function bookCall() {
    if (preview) return;
    // Open synchronously (popup blockers), then file the lead in the background.
    if (offer.ctaUrl) window.open(offer.ctaUrl, "_blank", "noopener,noreferrer");
    void fileRequest({});
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (await fileRequest({ contactEmail: email, contactPhone: phone, message })) setFormOpen(false);
  }

  const isBooking = offer.ctaType === "book_call";
  const label = ctaLabelOf(offer);

  return (
    <div className="rounded-xl bg-portal-surface-lowest p-6 shadow-sm">
      {copy.ctaEyebrow && (
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-portal-outline-variant">{copy.ctaEyebrow}</p>
      )}
      <h2 className="text-xl font-bold leading-snug text-portal-on-surface">
        {withService(copy.ctaHeading, offer.title)}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-portal-secondary-text">
        {withService(isBooking ? copy.ctaBodyBooking : copy.ctaBodyRequest, offer.title)}
      </p>

      {requestedAt ? (
        <div role="status" className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {isBooking
              ? copy.bookingSuccess
              : `${copy.requestSentLabel}${mounted ? ` ${formatDate(requestedAt)}` : ""}`}
          </p>
          <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-200/80">
            {isBooking ? copy.bookingSuccessBody : copy.requestSuccess}
          </p>
          {isBooking && offer.ctaUrl && (
            <a
              href={offer.ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-300"
            >
              {copy.bookingLinkLabel}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={isBooking ? bookCall : () => !preview && setFormOpen(true)}
          disabled={sending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isBooking ? (
            <CalendarClock className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {label}
        </button>
      )}
      {error && !formOpen && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {offer.links.length > 0 && (
        <div className="mt-4 space-y-2">
          {offer.links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={linkClicked}
              className="flex items-center justify-between gap-2 rounded-lg border border-primary/10 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-portal-on-surface transition-colors hover:border-primary/30 hover:text-primary"
            >
              <span className="truncate">{l.label}</span>
              <ExternalLink className="h-4 w-4 shrink-0 text-primary" />
            </a>
          ))}
        </div>
      )}

      {copy.ctaFootnote && (
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-portal-secondary-text">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {copy.ctaFootnote}
        </p>
      )}

      <Dialog open={formOpen} onOpenChange={(o) => !sending && setFormOpen(o)}>
        <DialogContent className="max-w-md">
          <form onSubmit={submitForm} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{label}: {offer.title}</DialogTitle>
              <DialogDescription>{copy.formIntro}</DialogDescription>
            </DialogHeader>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">{copy.formEmailLabel}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={254}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">{copy.formPhoneLabel}</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={40}
                className={inputClass}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">{copy.formMessageLabel}</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder={copy.formMessagePlaceholder}
                className={inputClass}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <DialogFooter>
              <button
                type="submit"
                disabled={sending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {copy.formSubmit}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
