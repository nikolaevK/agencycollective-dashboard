import { getAdminSession } from "@/lib/adminSession";
import { findOAuthClient } from "@/lib/oauth";
import { OAuthConsent } from "@/components/oauth/OAuthConsent";

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
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      </div>
    </main>
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
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">Sign in required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{client.clientName ?? "An MCP client"}</span>{" "}
            wants to connect to the Agency Collective API. Sign in to the admin dashboard in
            another tab, then reload this page to continue.
          </p>
          <div className="mt-4 flex gap-2">
            <a
              href="/?portal=admin"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Open admin login
            </a>
            <a
              href=""
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground"
            >
              Reload
            </a>
          </div>
        </div>
      </main>
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
