import { getAgencyConfig, updateAgencyConfig, deleteAgencyConfig } from "./agencyConfig";

// The deal-prep agent's business rules — admin-editable (Deal queue → Agent
// playbook), stored in agency_config. The default below was distilled from
// the live paperwork (Oct 2026): sent invoices + the per-deal DocuSeal clones
// admins made. Worked examples from recent sends are attached to every run
// separately, so when practice changes the examples lead and this text can
// be updated at leisure.

const KEY = "deal_prep_playbook";
const MAX_LENGTH = 20_000;

export const DEFAULT_DEAL_PREP_PLAYBOOK = `# Deal prep playbook

## Invoices
- Main line: "All-In-One Marketing for Startups" at the package price. Use the invoice preset whose label matches the services (e.g. "Ads + Creatives + Email") for the exact name + description. "Ads" = Meta ads.
- Regular monthly packages: one line at the package price (e.g. 5,500 Ads + Creatives; 6,500 Ads + Creatives + Email; 7,500 with TikTok).
- Q4 package (e.g. "Q4 12k", 11k, 10.5k, 16k): a 3-month non-cancellable commitment invoiced in advance — ONE line at the full Q4 total.
- Two options in the notes ("Q4 12k package and the 6500 package"): the client gets both. Primary invoice = the first-named / Q4 option; an additional invoice = the other option. Each option also gets its own contract, in the same order.
- Agency ad account ("agency account", "500/mo agency account with 5% on ad spend"): add an "Agency Ad Account" line at $500 (preset description) to EACH package invoice. A different fee in the notes (e.g. $300) wins. If the notes say it's waived, leave it out and flag it.
- Invoice date = today. Due date = invoice date + 5 days unless the notes say otherwise. Terms "Due on receipt". No discount unless the notes state one.
- Don't change the payment type (local / international) — it comes from the deal.

## Contracts (DocuSeal scopes)
- Template = industry + services: "Pep - …" (peptides / RUO), "Telehealth - …", "CBD - …", "Trading - …", then the services combo, e.g. "Pep - Ads + Creative + Email".
- Base templates are set up for the Q4 offer. Pricing-page overlays: retainer (e.g. "4000 USD"), rev-share % (e.g. "10"), rev-share threshold (e.g. "0"). Last page = Q4 commitment addendum: monthly price ("$4000/Month"), term ("3 Months"), two clause boxes, client initials + date.
- Q4 option: retainer = Q4 total ÷ 3 rounded down to whole dollars (12k → "4000 USD", 11k → "3666 USD", 10.5k → "3500 USD", 16k → "5333"). Update the addendum monthly price and BOTH clauses: the months 1–3 rate, the month-4 standard rate (the regular package price for these services, e.g. $5,500 or $6,500) and the rev share.
- Regular option: retainer = package price (e.g. "6500 USD") and REMOVE every addendum field (monthly price, term, both clauses, initials, date).
- Rev share: default 10% with a $0 threshold. "8% on 25K" / "8% above 25k rev" → rev share "8", threshold "25000". Keep addendum clause text consistent with these numbers.
- Telehealth templates default to a different retainer — always set it to the deal's package.
- Custom terms the notes ask for (e.g. "once 4M revenue is reached the 12k retainer is subtracted from the rev share") → a new read-only clause box on the last page, written in formal contract language. Always flag these for review.
`;

export async function getDealPrepPlaybook(): Promise<{ text: string; isDefault: boolean }> {
  const stored = await getAgencyConfig(KEY);
  return stored && stored.trim() ? { text: stored, isDefault: false } : { text: DEFAULT_DEAL_PREP_PLAYBOOK, isDefault: true };
}

export async function setDealPrepPlaybook(text: string): Promise<void> {
  if (text.length > MAX_LENGTH) throw new Error(`Playbook must be at most ${MAX_LENGTH} characters`);
  await updateAgencyConfig(KEY, text);
}

export async function resetDealPrepPlaybook(): Promise<void> {
  await deleteAgencyConfig(KEY);
}

export const DEAL_PREP_PLAYBOOK_MAX_LENGTH = MAX_LENGTH;
