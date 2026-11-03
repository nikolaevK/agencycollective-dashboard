"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { ScopeSelector } from "@/components/api-tokens/ScopeSelector";
import type { AccessLevel, ResourceKey, TokenScopes } from "@/lib/apiScopes";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface OAuthConsentFormProps {
  clientName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}

/**
 * The interactive part of the consent card (the only client island on the
 * page — OAuthConsent renders the shell + header on the server): the admin
 * names the token, picks its scopes (same selector as /dashboard/api-tokens),
 * and approves — which mints the token server-side and bounces back to the
 * client with a one-time code. Deny returns the standard access_denied error.
 */
export function OAuthConsentForm({
  clientName,
  clientId,
  redirectUri,
  codeChallenge,
  state,
}: OAuthConsentFormProps) {
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
    <>
      <CardContent className="space-y-5">
        <div className="grid gap-2">
          <label htmlFor="oauth-token-name" className="text-sm font-medium leading-none">
            Token name
          </label>
          <Input
            id="oauth-token-name"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium leading-none">Access</p>
          <ScopeSelector scopes={scopes} onChange={handleScopeChange} disabled={submitting} />
        </div>

        {error && (
          <div role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-col-reverse gap-2 p-4 pt-0 sm:flex-row sm:justify-end md:p-6 md:pt-0">
        <Button type="button" variant="outline" onClick={deny} disabled={submitting} className="w-full sm:w-auto">
          Deny
        </Button>
        <Button
          type="button"
          onClick={approve}
          disabled={submitting || !tokenName.trim() || !hasScope}
          className="w-full sm:w-auto"
        >
          {submitting && <Loader2 className="animate-spin" />}
          {submitting ? "Authorizing…" : "Approve"}
        </Button>
      </CardFooter>
    </>
  );
}
