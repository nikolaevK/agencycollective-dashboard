// Pure rules for mirroring a deal's proposal (contract) lifecycle onto the
// lead's GHL contact — no db / network imports, so it's unit-tested directly.
//
// GHL automations key off these names (workflow triggers on "tag added", merge
// fields {{contact.proposal_link}} in follow-up emails/SMS). Renaming a tag or
// field here silently breaks those workflows in BOTH sub-accounts.

export type ProposalState = "none" | "sent" | "viewed" | "signed" | "declined" | "expired";

export const PROPOSAL_TAGS = {
  /** A proposal is out and unsigned — starts the follow-up sequence. */
  sent: "proposal_sent",
  /** The lead opened an open proposal — texts the closer to call now. */
  viewed: "proposal_viewed",
  /** The lead signed — marks the opportunity Won, ends the follow-ups. */
  signed: "proposal_signed",
  declined: "proposal_declined",
  expired: "proposal_expired",
} as const;

/** Contact custom fields, by GHL field NAME (ids differ per sub-account, so
 *  they're resolved by name at sync time). Merge keys: {{contact.proposal_link}},
 *  {{contact.proposal_status}}, {{contact.proposal_value}},
 *  {{contact.proposal_sent_date}}. The 2nd, 3rd, … open contract's link goes
 *  to "Proposal Link 2", "Proposal Link 3", … ({{contact.proposal_link_2}}, …)
 *  — see proposalLinkFieldName. */
export const PROPOSAL_FIELDS = {
  /** Single Line — signing link of the first open contract. */
  link: "Proposal Link",
  /** Single Line — Sent | Viewed | Signed | Declined | Expired. */
  status: "Proposal Status",
  /** Monetary — the deal value in dollars. */
  value: "Proposal Value",
  /** Date — when the open proposal was (last) sent, business-timezone day. */
  sentDate: "Proposal Sent Date",
} as const;

export type ProposalFieldKey = keyof typeof PROPOSAL_FIELDS;

/** The field holding the n-th open contract's link (1-based): "Proposal Link",
 *  "Proposal Link 2", "Proposal Link 3", … — as many as the lead has. */
export function proposalLinkFieldName(n: number): string {
  return n <= 1 ? PROPOSAL_FIELDS.link : `${PROPOSAL_FIELDS.link} ${n}`;
}

/** Which link slot a GHL field name is (case/space tolerant), else null. Only
 *  the bare "Proposal Link" is slot 1 — templates merge {{contact.proposal_link}},
 *  so a stray "Proposal Link 1" must never take the first link. */
export function proposalLinkIndex(fieldName: string): number | null {
  const m = /^proposal link(?: ([1-9]\d{0,2}))?$/.exec(fieldName.trim().toLowerCase().replace(/\s+/g, " "));
  if (!m) return null;
  if (!m[1]) return 1;
  const n = Number(m[1]);
  return n >= 2 ? n : null;
}

export const PROPOSAL_STATUS_LABEL: Record<Exclude<ProposalState, "none">, string> = {
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
};

export interface ProposalContract {
  status: string;
  signingUrl: string | null;
  /** ISO timestamp of the contract's (latest) send. */
  sentAt?: string | null;
}

export interface DerivedProposal {
  state: ProposalState;
  /** Signing links of the still-open (sent/viewed) contracts, in contract
   *  order (primary first). Empty unless state is sent/viewed. */
  links: string[];
  /** Latest send among the open contracts (ISO), else null. */
  sentAt: string | null;
}

function isOpen(status: string): boolean {
  return status === "sent" || status === "viewed";
}

function cleanLink(url: string | null): string | null {
  const v = (url ?? "").trim();
  return /^https:\/\/\S+$/i.test(v) ? v : null;
}

/**
 * One state for the whole deal, from all its contracts (primary first):
 * any signed → signed (the lead picked an option — terminal); else any open →
 * viewed/sent; else declined, else expired; else none (nothing sent yet, or
 * every sent contract was replaced back to a draft).
 */
export function deriveProposal(contracts: ProposalContract[]): DerivedProposal {
  const closed = (state: ProposalState): DerivedProposal => ({ state, links: [], sentAt: null });
  if (contracts.some((c) => c.status === "signed")) return closed("signed");
  const open = contracts.filter((c) => isOpen(c.status));
  if (open.length > 0) {
    const links = open.map((c) => cleanLink(c.signingUrl)).filter((u): u is string => !!u);
    const sentAt = open
      .map((c) => c.sentAt ?? null)
      .filter((t): t is string => !!t && !Number.isNaN(Date.parse(t)))
      .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
    return { state: open.some((c) => c.status === "viewed") ? "viewed" : "sent", links, sentAt };
  }
  if (contracts.some((c) => c.status === "declined")) return closed("declined");
  if (contracts.some((c) => c.status === "expired")) return closed("expired");
  return closed("none");
}

/**
 * Tags to add / remove so the contact carries exactly the current state:
 * `proposal_sent` while a proposal is out (kept through a view, so follow-ups
 * keep running), `proposal_viewed` only while an open proposal has been
 * opened (a resend clears it, so the next view alerts the closer again), and
 * one terminal tag once signed / declined / expired. An open proposal also
 * clears an older `proposal_signed` (a later deal for the same lead), so
 * signing THIS one fires "tag added" again and ends its follow-ups.
 */
export function proposalTagPlan(state: ProposalState): { add: string[]; remove: string[] } {
  const t = PROPOSAL_TAGS;
  switch (state) {
    case "sent":
      return { add: [t.sent], remove: [t.viewed, t.signed, t.declined, t.expired] };
    case "viewed":
      return { add: [t.sent, t.viewed], remove: [t.signed, t.declined, t.expired] };
    case "signed":
      return { add: [t.signed], remove: [t.sent, t.viewed, t.declined, t.expired] };
    case "declined":
      return { add: [t.declined], remove: [t.sent, t.viewed, t.expired] };
    case "expired":
      return { add: [t.expired], remove: [t.sent, t.viewed, t.declined] };
    case "none":
      return { add: [], remove: [t.sent, t.viewed] };
  }
}

export interface ProposalFieldValues {
  /** Status / value / sent date (keys left out are not touched). */
  fields: Partial<Record<Exclude<ProposalFieldKey, "link">, string | number>>;
  /** Every open contract's link, in contract order → Proposal Link,
   *  Proposal Link 2, 3, …; any other existing "Proposal Link N" is cleared.
   *  Null = leave the link fields alone. */
  links: string[] | null;
}

/**
 * What to write onto the contact. While a proposal is open: every open
 * contract's link (however many), status, value and sent date. After an
 * outcome: status (+ value) only — the links stay (a signed link shows the
 * signed copy). When every sent contract went back to a draft: links + status
 * cleared.
 */
export function proposalFieldValues(
  d: DerivedProposal,
  ctx: { dealValueCents: number | null | undefined; sentDateYmd: string | null }
): ProposalFieldValues {
  if (d.state === "none") return { fields: { status: "" }, links: [] };
  const fields: ProposalFieldValues["fields"] = { status: PROPOSAL_STATUS_LABEL[d.state] };
  const value = ghlMonetaryValue(ctx.dealValueCents);
  if (value !== null) fields.value = value;
  if (d.state !== "sent" && d.state !== "viewed") return { fields, links: null };
  if (ctx.sentDateYmd) fields.sentDate = ctx.sentDateYmd;
  return { fields, links: d.links };
}

/** Deal value (integer cents) → GHL opportunity monetaryValue (dollars).
 *  Null for a non-positive/invalid value — leave GHL's value untouched. */
export function ghlMonetaryValue(cents: number | null | undefined): number | null {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) return null;
  return Math.round(cents) / 100;
}
