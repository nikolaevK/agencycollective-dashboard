// What a person asks Claude to start a manual deal-prep run. Shared by the MCP
// server's prompts (prepare_deals / prepare_deal), its instructions, the auto
// mode trigger text and the dashboard's "Run in Claude" copy box. Pure text —
// safe to import from client components.

export const DEAL_PREP_DEFAULT_BATCH = 5;

/** getDealPrepContext refuses (409) deals a person is handling, already sent, or with nothing to prepare. */
export const DEAL_PREP_SKIP_RULE =
  "If getDealPrepContext answers 409 (a person is handling the deal, it was already sent, or there is nothing to prepare), skip that deal without editing it.";

export function prepareDealsPrompt(limit: number = DEAL_PREP_DEFAULT_BATCH): string {
  return `Prepare the Agency Collective deals that are awaiting paperwork prep.

1. Call listDealPreps with status "queued" and limit ${limit} (oldest first). If there are none, say so and stop.
2. Prepare the deals ONE AT A TIME. For each one, call getDealPrepContext with its dealId and follow the instructions it returns exactly — edit the draft invoices and contract scopes, then finish that deal with submitDealPrep before starting the next. ${DEAL_PREP_SKIP_RULE}
3. Never send anything to a client. A person reviews and sends from the Deal queue.
4. When done, reply with one line per deal: client, what you prepared (or why it was skipped), and any flags. If more deals are waiting (meta.pagination.total above ${limit}), say how many remain.`;
}

export function prepareDealPrompt(dealId: string): string {
  return `Prepare Agency Collective deal ${dealId}: call getDealPrepContext with this dealId and follow the instructions it returns exactly, finishing with submitDealPrep. ${DEAL_PREP_SKIP_RULE} Never send anything to a client. Reply with what you prepared and any flags.`;
}
