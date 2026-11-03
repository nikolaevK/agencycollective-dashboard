import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { OAuthConsentForm } from "./OAuthConsentForm";
import { OAuthShell } from "./OAuthShell";

interface OAuthConsentProps {
  clientName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  adminName: string;
}

/**
 * Consent card. The shell, card and header render on the server; only the
 * form (token name, scopes, Deny / Approve) is a client island — see
 * OAuthConsentForm. Approving creates an API token with the chosen access.
 */
export function OAuthConsent({ adminName, ...form }: OAuthConsentProps) {
  return (
    <OAuthShell className="max-w-lg">
      <Card>
        <CardHeader>
          <h1 className="text-lg font-semibold leading-snug break-words">Authorize {form.clientName}</h1>
          <CardDescription>
            Signed in as <span className="font-medium text-foreground">{adminName}</span>. Approving
            creates an API token with the access below — manage or revoke it any time from the
            dashboard&apos;s API Tokens page.
          </CardDescription>
        </CardHeader>
        <OAuthConsentForm {...form} />
      </Card>
    </OAuthShell>
  );
}
