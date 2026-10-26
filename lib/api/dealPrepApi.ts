import type { NextResponse } from "next/server";
import { fail, type ApiErrorCode } from "./respond";
import { tokenHasResource } from "@/lib/apiScopes";
import type { ApiTokenRecord } from "@/lib/apiTokens";
import { findDeal, type DealRecord } from "@/lib/deals";
import { ContractScopeError, findContractRef, type ContractRef } from "@/lib/dealContractScope";
import { DealPrepError } from "@/lib/dealPrep";
import { DocuSealApiError, DocuSealAuthError } from "@/lib/docuseal/client";

// Shared v1 plumbing for the deal-prep + contract-scope routes.

export async function gateDeal(
  token: ApiTokenRecord,
  dealId: string
): Promise<{ deal: DealRecord; error?: never } | { error: NextResponse; deal?: never }> {
  const deal = await findDeal(dealId);
  if (!deal) return { error: fail("not_found", "Deal not found", 404) };
  if (!tokenHasResource(token, "closer", deal.closerId)) {
    return { error: fail("resource_forbidden", "This token is not allowed to access this closer", 403) };
  }
  return { deal };
}

export async function gateContract(
  token: ApiTokenRecord,
  contractId: string
): Promise<{ ref: ContractRef; deal: DealRecord; error?: never } | { error: NextResponse; ref?: never; deal?: never }> {
  const ref = await findContractRef(contractId);
  if (!ref) return { error: fail("not_found", "Contract not found", 404) };
  const gate = await gateDeal(token, ref.record.dealId);
  if (gate.error) return { error: gate.error };
  return { ref, deal: gate.deal };
}

const API_CODES = new Set<ApiErrorCode>(["invalid_request", "not_found", "conflict", "internal_error"]);

/** Map domain + DocuSeal errors to the v1 envelope; anything else is a 500. */
export function prepErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof ContractScopeError || err instanceof DealPrepError) {
    const code = API_CODES.has(err.code as ApiErrorCode) ? (err.code as ApiErrorCode) : "internal_error";
    return fail(code, err.message, err.status);
  }
  if (err instanceof DocuSealAuthError) {
    console.error(`${where} DocuSeal auth error`);
    return fail("internal_error", "DocuSeal is not configured or the API key was rejected", 502);
  }
  if (err instanceof DocuSealApiError) {
    console.error(`${where} DocuSeal error:`, err.statusCode, err.message);
    return fail("internal_error", `DocuSeal: ${err.message}`, 502);
  }
  console.error(`${where} error:`, err);
  return fail("internal_error", "Internal server error", 500);
}
