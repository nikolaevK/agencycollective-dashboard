"use client";

import { useMemo, useState, type ElementType, type ReactNode } from "react";
import {
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  ImageIcon,
  Link2,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, badgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import { formatBytes, type AssetCategory, type AssetUploaderRole } from "@/lib/clientAssetRules";
import {
  assetFileUrl,
  useAddLink,
  useAssetList,
  useAssetUploads,
  useDeleteAsset,
  type AssetDto,
} from "@/hooks/useClientAssets";
import { AssetTile } from "./AssetTile";
import { AssetViewer } from "./AssetViewer";
import { UploadButton, UploadProgressList } from "./UploadControls";

function uploaderLabel(asset: AssetDto, viewer: AssetUploaderRole): string {
  if (viewer === "client") return asset.uploadedByRole === "client" ? "You" : "Agency Collective";
  return asset.uploadedByRole === "client" ? "Client" : asset.uploadedByName ?? "Admin";
}

function AssetSection({
  icon: Icon,
  title,
  hint,
  count,
  action,
  children,
}: {
  icon: ElementType;
  title: string;
  hint: string;
  count: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <Card>
        <CardHeader className="gap-3 space-y-0 border-b sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-2">
                {title}
                <Badge variant="secondary" className="tabular-nums">{count}</Badge>
              </CardTitle>
              <CardDescription className="text-xs">{hint}</CardDescription>
            </div>
          </div>
          {action}
        </CardHeader>
        {children}
      </Card>
    </section>
  );
}

/** Upload button + progress list for one category (a hook: owns the queue). */
function useUploadSlot({
  apiBase,
  category,
  label,
}: {
  apiBase: string;
  category: AssetCategory;
  label: string;
}) {
  const uploads = useAssetUploads(apiBase, category);
  return {
    button: (
      <UploadButton
        category={category}
        onFiles={uploads.upload}
        busy={uploads.busy}
        label={label}
        className="w-full sm:w-auto"
      />
    ),
    progress:
      uploads.items.length > 0 ? (
        <div className="border-b p-4 md:px-6">
          <UploadProgressList items={uploads.items} onDismiss={uploads.dismiss} />
        </div>
      ) : null,
  };
}

function FileRow({
  apiBase,
  asset,
  viewer,
  onOpen,
}: {
  apiBase: string;
  asset: AssetDto;
  viewer: AssetUploaderRole;
  onOpen: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 md:px-6">
      <button
        type="button"
        onClick={onOpen}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/50 text-muted-foreground ring-1 ring-foreground/5 dark:ring-foreground/10">
          {asset.hasThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetFileUrl(apiBase, asset.id, "thumb")}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : asset.mediaType === "pdf" ? (
            <FileText className="size-5" />
          ) : (
            <ImageIcon className="size-5" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground underline-offset-4 group-hover:underline">{asset.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {formatBytes(asset.fileSize)} · {formatDate(asset.createdAt)} · {uploaderLabel(asset, viewer)}
          </span>
        </span>
      </button>
      <Button asChild variant="outline" size="icon-sm" className="shrink-0 text-muted-foreground">
        <a
          href={assetFileUrl(apiBase, asset.id, "original", true)}
          download={asset.fileName ?? undefined}
          aria-label={`Download ${asset.title}`}
          title="Download"
        >
          <Download />
        </a>
      </Button>
    </li>
  );
}

function LinkRow({
  apiBase,
  asset,
  viewer,
}: {
  apiBase: string;
  asset: AssetDto;
  viewer: AssetUploaderRole;
}) {
  const remove = useDeleteAsset(apiBase);
  const [confirming, setConfirming] = useState(false);
  const host = (() => {
    try {
      return new URL(asset.linkUrl ?? "").hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  return (
    <li className="flex items-center gap-3 px-4 py-3 md:px-6">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-muted-foreground ring-1 ring-foreground/5 dark:ring-foreground/10">
        <FolderOpen className="size-5" />
      </span>
      <a
        href={asset.linkUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="group min-w-0 flex-1 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <span className="truncate underline-offset-4 group-hover:underline">{asset.title}</span>
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {host} · {formatDate(asset.createdAt)} · {uploaderLabel(asset, viewer)}
        </span>
      </a>
      {asset.canDelete &&
        (confirming ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {remove.error && (
              <span className="text-xs text-destructive">{remove.error.message}</span>
            )}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate(asset.id)}
            >
              {remove.isPending && <Loader2 className="animate-spin" />}
              Remove
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setConfirming(true)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${asset.title}`}
            title="Remove"
          >
            <Trash2 />
          </Button>
        ))}
    </li>
  );
}

function AddLinkForm({ apiBase }: { apiBase: string }) {
  const add = useAddLink(apiBase);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  return (
    <form
      className="flex flex-col gap-2 border-t p-4 sm:flex-row md:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!url.trim()) return;
        add.mutate(
          { url: url.trim(), title: title.trim() },
          { onSuccess: () => { setUrl(""); setTitle(""); } }
        );
      }}
    >
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://drive.google.com/…"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        className="sm:flex-[2]"
        aria-label="Link URL"
      />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Label (optional)"
        maxLength={200}
        className="sm:flex-1"
        aria-label="Link label"
      />
      <Button
        type="submit"
        disabled={add.isPending || !url.trim()}
      >
        {add.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
        Add link
      </Button>
      {add.error && (
        <p className="text-xs text-destructive sm:self-center">{add.error.message}</p>
      )}
    </form>
  );
}

/**
 * My Brand — brand book files, product (vial) photos and Google Drive /
 * asset-folder links. Clients and admins can both add; each item's
 * canDelete comes from the server (clients remove only their own uploads).
 */
export function BrandAssetsPanel({ apiBase, viewer }: { apiBase: string; viewer: AssetUploaderRole }) {
  const list = useAssetList(apiBase, "brand", { limit: 100 });
  const [open, setOpen] = useState<AssetDto | null>(null);
  const bookUpload = useUploadSlot({ apiBase, category: "brand_book", label: "Upload brand book" });
  const photoUpload = useUploadSlot({ apiBase, category: "product_photo", label: "Upload photos" });

  const byCategory = useMemo(() => {
    const groups: Record<string, AssetDto[]> = { brand_book: [], product_photo: [], link: [] };
    for (const page of list.data?.pages ?? []) for (const a of page.items) groups[a.category]?.push(a);
    return groups;
  }, [list.data]);

  if (list.isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
    );
  }
  if (list.error) {
    return (
      <p className={cn("rounded-2xl border px-4 py-3 text-sm", badgeTone.danger)}>
        {list.error.message}
      </p>
    );
  }

  const empty = (text: string) => (
    <p className="px-4 py-8 text-center text-sm text-muted-foreground md:px-6">{text}</p>
  );

  return (
    <div className="space-y-5">
      <AssetSection
        icon={BookOpen}
        title="Brand book"
        hint="Guidelines, logos, fonts and colors — PDF or images, up to 25 MB each."
        count={byCategory.brand_book.length}
        action={bookUpload.button}
      >
        {bookUpload.progress}
        {byCategory.brand_book.length === 0 ? (
          empty(viewer === "client" ? "Upload your brand book so our designers stay on-brand." : "No brand book yet.")
        ) : (
          <ul className="divide-y">
            {byCategory.brand_book.map((a) => (
              <FileRow key={a.id} apiBase={apiBase} asset={a} viewer={viewer} onOpen={() => setOpen(a)} />
            ))}
          </ul>
        )}
      </AssetSection>

      <AssetSection
        icon={ImageIcon}
        title="Product photos"
        hint="Vials, packaging and product shots — JPG, PNG, WebP or GIF, up to 25 MB each."
        count={byCategory.product_photo.length}
        action={photoUpload.button}
      >
        {photoUpload.progress}
        {byCategory.product_photo.length === 0 ? (
          empty(viewer === "client" ? "Add clean product shots — they're the backbone of your ads." : "No product photos yet.")
        ) : (
          <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 sm:gap-3 md:grid-cols-6 md:p-6">
            {byCategory.product_photo.map((a) => (
              <AssetTile
                key={a.id}
                apiBase={apiBase}
                asset={a}
                onOpen={() => setOpen(a)}
                aspect="aspect-square"
                showTitle={false}
              />
            ))}
          </div>
        )}
      </AssetSection>

      <AssetSection
        icon={Link2}
        title="Google Drive & links"
        hint="Shared folders with logos, product photos, past ads or raw footage."
        count={byCategory.link.length}
      >
        {byCategory.link.length === 0 ? (
          empty("No links yet. Paste a Google Drive or Dropbox folder link below.")
        ) : (
          <ul className="divide-y">
            {byCategory.link.map((a) => (
              <LinkRow key={a.id} apiBase={apiBase} asset={a} viewer={viewer} />
            ))}
          </ul>
        )}
        <AddLinkForm apiBase={apiBase} />
      </AssetSection>

      {list.hasNextPage && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage && <Loader2 className="animate-spin" />}
            Load more
          </Button>
        </div>
      )}

      <AssetViewer apiBase={apiBase} asset={open} onClose={() => setOpen(null)} />
    </div>
  );
}
