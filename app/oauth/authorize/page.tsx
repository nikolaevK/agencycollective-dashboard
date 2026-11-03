import { getAdminSession } from "@/lib/adminSession";
import { findOAuthClient } from "@/lib/oauth";
import { OAuthConsent } from "@/components/oauth/OAuthConsent";
import { OAuthShell } from "@/components/oauth/OAuthShell";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * OAuth consent page for MCP custom connectors (Claude.ai etc.). Deliberately
 * OUTSIDE the middleware matcher — the login redirect there drops query
 * params, so this page does its own admin-session + `apitokens` permission
 * check and asks a logged-out admin to sign in from another tab and retry.
 * Approval mints a regular api_token (scoped here) bound to a one-time code.
 */

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <OAuthShell>
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold leading-snug">{title}</h1>
          <CardDescription>{body}</CardDescription>
        </CardHeader>
      </Card>
    </OAuthShell>
  );
}

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const param = (key: string): string => {
    const value = searchParams[key];
    return typeof value === "string" ? value : "";
  };

  const clientId = param("client_id");
  const redirectUri = param("redirect_uri");
  const responseType = param("response_type");
  const codeChallenge = param("code_challenge");
  const codeChallengeMethod = param("code_challenge_method") || "S256";
  const state = param("state");

  // Validate BEFORE rendering anything actionable — and never redirect to an
  // unvalidated redirect_uri.
  if (!clientId || !redirectUri || !codeChallenge) {
    return (
      <ErrorCard
        title="Invalid authorization request"
        body="client_id, redirect_uri, and code_challenge are required."
      />
    );
  }
  if (responseType !== "code" || codeChallengeMethod !== "S256") {
    return (
      <ErrorCard
        title="Unsupported authorization request"
        body="Only response_type=code with PKCE S256 is supported."
      />
    );
  }
  const client = await findOAuthClient(clientId);
  if (!client) {
    return (
      <ErrorCard
        title="Unknown client"
        body="This client is not registered. The connector should register itself automatically — try adding it again."
      />
    );
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return (
      <ErrorCard
        title="Redirect URI mismatch"
        body="The redirect_uri does not match the one registered by this client."
      />
    );
  }

  const session = getAdminSession();
  if (!session) {
    return (
      <OAuthShell>
        <Card>
          <CardHeader>
            <h1 className="text-lg font-semibold leading-snug">Sign in required</h1>
            <CardDescription>
              <span className="font-medium text-foreground">{client.clientName ?? "An MCP client"}</span>{" "}
              wants to connect to the Agency Collective API. Sign in to the admin dashboard in
              another tab, then reload this page to continue.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex-wrap gap-2 p-4 pt-0 md:p-6 md:pt-0">
            <a
              href="/?portal=admin"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants()}
            >
              Open admin login
            </a>
            <a href="" className={buttonVariants({ variant: "outline" })}>
              Reload
            </a>
          </CardFooter>
        </Card>
      </OAuthShell>
    );
  }
  if (!session.isSuper && !session.permissions.apitokens) {
    return (
      <ErrorCard
        title="Not allowed"
        body="Your admin account does not have the API Tokens permission required to authorize connectors."
      />
    );
  }

  return (
    <OAuthConsent
      clientName={client.clientName ?? clientId}
      clientId={clientId}
      redirectUri={redirectUri}
      codeChallenge={codeChallenge}
      state={state}
      adminName={session.displayName ?? session.username}
    />
  );
}
