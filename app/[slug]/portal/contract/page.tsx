"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, FileSignature, CheckCircle2 } from "lucide-react";
import { DocusealForm } from "@docuseal/react";
import { DashboardShell } from "@/components/layout/DashboardShell";

interface ContractData {
  status: string;
  signingUrl?: string | null;
  signedAt?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function PortalContractPage() {
  const searchParams = useSearchParams();
  const dealId = searchParams.get("dealId");

  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justSigned, setJustSigned] = useState(false);

  useEffect(() => {
    if (!dealId || !UUID_RE.test(dealId)) {
      setError(!dealId ? "No deal specified" : "Invalid deal ID");
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ dealId });
    fetch(`/api/portal/contract?${params}`)
      .then((res) => res.json())
      .then((json) => {
        setContract(json.data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load contract");
        setLoading(false);
      });
  }, [dealId]);

  const handleComplete = useCallback(() => {
    setJustSigned(true);
  }, []);

  const handleDecline = useCallback(() => {
    setContract((prev) => prev ? { ...prev, status: "declined", signingUrl: null } : prev);
  }, []);

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  if (error || !contract) {
    return (
      <StatusScreen
        icon={<FileSignature className="size-6 text-muted-foreground" />}
        title="No Contract Available"
        body={error || "There is no contract to sign at this time."}
      />
    );
  }

  if (contract.status === "signed" || justSigned) {
    return (
      <StatusScreen
        icon={<CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />}
        title="Contract Signed"
        body={
          justSigned
            ? "Thank you! Your contract has been signed successfully."
            : `Thank you! Your contract was signed on ${contract.signedAt ? new Date(contract.signedAt).toLocaleDateString() : "—"}.`
        }
      />
    );
  }

  if (contract.status === "declined") {
    return (
      <StatusScreen
        icon={<FileSignature className="size-6 text-muted-foreground" />}
        title="Contract Declined"
        body="Please contact your representative for assistance."
      />
    );
  }

  if (!contract.signingUrl || !contract.signingUrl.startsWith("https://")) {
    return (
      <StatusScreen
        icon={<FileSignature className="size-6 text-muted-foreground" />}
        title={`Contract ${contract.status === "expired" ? "Expired" : "Unavailable"}`}
        body="Please contact your representative for assistance."
      />
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">Sign Your Contract</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Please review and sign the contract below
          </p>
        </div>
        {/* Light surface in every theme — the in-page DocuSeal form is
            transparent with dark text (unreadable on the dark theme). */}
        <div className="overflow-hidden rounded-[min(calc(var(--radius)*2.6),24px)] bg-white text-neutral-900 shadow ring-1 ring-foreground/5 dark:ring-foreground/10">
          <DocusealForm
            src={contract.signingUrl}
            withTitle={false}
            withDownloadButton={true}
            withSendCopyButton={true}
            withDecline={true}
            allowTypedSignature={true}
            onComplete={handleComplete}
            onDecline={handleDecline}
            className="w-full"
            style={{ minHeight: "80vh" }}
          />
        </div>
      </div>
    </DashboardShell>
  );
}

/** Centered state (no / signed / declined / unavailable contract). */
function StatusScreen({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <DashboardShell>
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">{icon}</div>
        <div className="space-y-1">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
    </DashboardShell>
  );
}
