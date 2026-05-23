"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Download, FileSignature, Receipt } from "lucide-react";
import { formatDate } from "./format";
import type { PayoutDocument } from "@/lib/payoutDocuments";

interface DocumentsResponse {
  brand: string;
  invoices: PayoutDocument[];
  scopes: PayoutDocument[];
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchDocuments(userId: string): Promise<DocumentsResponse> {
  const res = await fetch(`/api/admin/clients/${userId}/documents`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data as DocumentsResponse;
}

function DocList({
  docs,
  emptyLabel,
  userId,
}: {
  docs: PayoutDocument[];
  emptyLabel: string;
  userId: string;
}) {
  if (docs.length === 0) {
    return <p className="px-5 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="divide-y divide-border/40">
      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{doc.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(doc.fileSize)} · {formatDate(doc.createdAt)}
            </p>
          </div>
          <a
            href={`/api/admin/clients/${userId}/documents/${doc.id}`}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      ))}
    </div>
  );
}

export function ClientDocumentsTab({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["client-documents", userId],
    queryFn: () => fetchDocuments(userId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="h-48 w-full animate-pulse rounded-xl bg-muted/50" />;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Invoices and project scopes from the Payout DB
        {data?.brand ? ` for “${data.brand}”` : ""}.
      </p>

      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
        <div className="flex items-center gap-2 p-5 border-b border-border/50">
          <Receipt className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Invoices</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {data?.invoices.length ?? 0}
          </span>
        </div>
        <DocList docs={data?.invoices ?? []} emptyLabel="No invoices on file." userId={userId} />
      </div>

      <div className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card overflow-hidden">
        <div className="flex items-center gap-2 p-5 border-b border-border/50">
          <FileSignature className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Project scopes</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {data?.scopes.length ?? 0}
          </span>
        </div>
        <DocList docs={data?.scopes ?? []} emptyLabel="No project scopes on file." userId={userId} />
      </div>
    </div>
  );
}
