"use client";

import { ShieldCheck, Info } from "lucide-react";

export function AccessPolicyCard() {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Access Policy</h3>
        </div>
      </div>
      <div className="p-4 space-y-3 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
          <p>
            <span className="font-medium text-foreground">Super admins</span> have unrestricted access to all modules and can manage other admins.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
          <p>
            <span className="font-medium text-foreground">Standard admins</span> only see pages they have explicit permission for.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
          <p>Permission changes take effect on the admin&apos;s next page load — no logout required.</p>
        </div>
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
          <p>New admins set their own password on first sign-in at <span className="font-mono text-foreground">/admin/login</span>.</p>
        </div>
      </div>
    </div>
  );
}
