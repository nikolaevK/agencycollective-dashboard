import { ShieldCheck, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AccessPolicyCard() {
  return (
    <Card>
      <CardHeader className="pb-3 md:pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4 text-muted-foreground" />
          Access Policy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <Info className="size-3.5 mt-0.5 shrink-0" />
          <p>
            <span className="font-medium text-foreground">Super admins</span> have unrestricted access to all modules and can manage other admins.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Info className="size-3.5 mt-0.5 shrink-0" />
          <p>
            <span className="font-medium text-foreground">Standard admins</span> only see pages they have explicit permission for.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Info className="size-3.5 mt-0.5 shrink-0" />
          <p>Permission changes take effect on the admin&apos;s next page load — no logout required.</p>
        </div>
        <div className="flex items-start gap-2">
          <Info className="size-3.5 mt-0.5 shrink-0" />
          <p>New admins set their own password on first sign-in at <span className="font-mono text-foreground">/staff</span>.</p>
        </div>
      </CardContent>
    </Card>
  );
}
