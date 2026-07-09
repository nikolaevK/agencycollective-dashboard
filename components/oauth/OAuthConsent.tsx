"use client";

import { useState } from "react";
import { ScopeSelector } from "@/components/api-tokens/ScopeSelector";
import type { AccessLevel, ResourceKey, TokenScopes } from "@/lib/apiScopes";

interface OAuthConsentProps {
  clientName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  adminName: string;
}

/**
 * Consent form: the admin names the token, picks its scopes (same selector
 * as /dashboard/api-tokens), and approves — which mints the token server-side
 * and bounces back to the client with a one-time code. Deny returns the
 * standard access_denied error.
 */
export function OAuthConsent({
  clientName,
  clientId,
  redirectUri,
  codeChallenge,
  state,
  adminName,
}: OAuthConsentProps) {
  const [tokenName, setTokenName] = useState(`${clientName} (MCP connector)`);
  const [scopes, setScopes] = useState<TokenScopes>({
    closer: "read",
    client: "read",
    media: "read",
    sops: "read",
    audit: "read",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasScope = Object.values(scopes).some((level) => level && level !== "none");

  const handleScopeChange = (key: ResourceKey, level: AccessLevel) => {
    setScopes((prev) => ({ ...prev, [key]: level }));
  };

  const deny = () => {
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    window.location.href = url.toString();
  };

  const approve = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/oauth/authorize/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          redirectUri,
          codeChallenge,
          state,
          tokenName: tokenName.trim(),
          scopes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.redirectTo) {
        setError(data.error ?? "Authorization failed");
        setSubmitting(false);
        return;
      }
      window.location.href = data.redirectTo;
    } catch {
      setError("Authorization failed — try again");
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Authorize {clientName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{adminName}</span>. Approving
          creates an API token with the access below — manage or revoke it any time from the
          dashboard&apos;s API Tokens page.
        </p>

        <label className="mt-4 block text-sm font-medium text-foreground">
          Token name
          <input
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            maxLength={100}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-foreground">Access</p>
          <ScopeSelector scopes={scopes} onChange={handleScopeChange} disabled={submitting} />
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={deny}
            disabled={submitting}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={approve}
            disabled={submitting || !tokenName.trim() || !hasScope}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {submitting ? "Authorizing…" : "Approve"}
          </button>
        </div>
      </div>
    </main>
  );
}
