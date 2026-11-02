"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Download, FileSignature, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
    return <p className="px-6 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="divide-y">
      {docs.map((doc) => (
        <div key={doc.id} className="flex items-center gap-3 px-4 py-3 md:px-6">
          <FileText className="size-4 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">{doc.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(doc.fileSize)} · {formatDate(doc.createdAt)}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href={`/api/admin/clients/${userId}/documents/${doc.id}`}>
              <Download />
              Download
            </a>
          </Button>
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
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Invoices and project scopes from the Payout DB
        {data?.brand ? ` for “${data.brand}”` : ""}.
      </p>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0 border-b">
          <Receipt className="size-4 text-muted-foreground" />
          <CardTitle>Invoices</CardTitle>
          <Badge variant="secondary" className="ml-auto tabular-nums">
            {data?.invoices.length ?? 0}
          </Badge>
        </CardHeader>
        <DocList docs={data?.invoices ?? []} emptyLabel="No invoices on file." userId={userId} />
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0 border-b">
          <FileSignature className="size-4 text-muted-foreground" />
          <CardTitle>Project scopes</CardTitle>
          <Badge variant="secondary" className="ml-auto tabular-nums">
            {data?.scopes.length ?? 0}
          </Badge>
        </CardHeader>
        <DocList docs={data?.scopes ?? []} emptyLabel="No project scopes on file." userId={userId} />
      </Card>
    </div>
  );
}
