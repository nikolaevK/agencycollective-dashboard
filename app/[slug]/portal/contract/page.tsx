"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, FileSignature, CheckCircle2 } from "lucide-react";
import { DocusealForm } from "@docuseal/react";

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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <FileSignature className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-lg font-semibold text-foreground">No Contract Available</p>
        <p className="text-sm text-muted-foreground mt-1">{error || "There is no contract to sign at this time."}</p>
      </div>
    );
  }

  if (contract.status === "signed" || justSigned) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-4" />
        <p className="text-lg font-semibold text-foreground">Contract Signed</p>
        <p className="text-sm text-muted-foreground mt-1">
          {justSigned
            ? "Thank you! Your contract has been signed successfully."
            : `Thank you! Your contract was signed on ${contract.signedAt ? new Date(contract.signedAt).toLocaleDateString() : "—"}.`}
        </p>
      </div>
    );
  }

  if (contract.status === "declined") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <FileSignature className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-lg font-semibold text-foreground">Contract Declined</p>
        <p className="text-sm text-muted-foreground mt-1">Please contact your representative for assistance.</p>
      </div>
    );
  }

  if (!contract.signingUrl || !contract.signingUrl.startsWith("https://")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <FileSignature className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-lg font-semibold text-foreground">Contract {contract.status === "expired" ? "Expired" : "Unavailable"}</p>
        <p className="text-sm text-muted-foreground mt-1">Please contact your representative for assistance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-black text-foreground">Sign Your Contract</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Please review and sign the contract below
        </p>
      </div>
      <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
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
  );
}
