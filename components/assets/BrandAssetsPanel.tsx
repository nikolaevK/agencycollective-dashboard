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

function Card({
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
    <section className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm dark:border-white/[0.06]">
      <div className="flex flex-col gap-3 border-b border-border/50 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">
              {title}
              <span className="ml-2 text-xs font-medium text-muted-foreground">{count}</span>
            </h3>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
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
        <div className="border-b border-border/50 p-4 sm:px-5">
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
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
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
            <FileText className="h-5 w-5" />
          ) : (
            <ImageIcon className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">{asset.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {formatBytes(asset.fileSize)} · {formatDate(asset.createdAt)} · {uploaderLabel(asset, viewer)}
          </span>
        </span>
      </button>
      <a
        href={assetFileUrl(apiBase, asset.id, "original", true)}
        download={asset.fileName ?? undefined}
        className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        aria-label={`Download ${asset.title}`}
        title="Download"
      >
        <Download className="h-4 w-4" />
      </a>
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
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FolderOpen className="h-5 w-5" />
      </span>
      <a
        href={asset.linkUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="group min-w-0 flex-1"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground group-hover:text-primary">
          <span className="truncate">{asset.title}</span>
          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {host} · {formatDate(asset.createdAt)} · {uploaderLabel(asset, viewer)}
        </span>
      </a>
      {asset.canDelete &&
        (confirming ? (
          <span className="flex shrink-0 items-center gap-1.5">
            {remove.error && (
              <span className="text-xs text-red-600 dark:text-red-400">{remove.error.message}</span>
            )}
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(asset.id)}
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {remove.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Remove
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/50"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:border-red-500/40 hover:text-red-600"
            aria-label={`Remove ${asset.title}`}
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ))}
    </li>
  );
}

const INPUT_CLS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 sm:text-sm";

function AddLinkForm({ apiBase }: { apiBase: string }) {
  const add = useAddLink(apiBase);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  return (
    <form
      className="flex flex-col gap-2 border-t border-border/50 p-4 sm:flex-row sm:px-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!url.trim()) return;
        add.mutate(
          { url: url.trim(), title: title.trim() },
          { onSuccess: () => { setUrl(""); setTitle(""); } }
        );
      }}
    >
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://drive.google.com/…"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        className={cn(INPUT_CLS, "sm:flex-[2]")}
        aria-label="Link URL"
      />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Label (optional)"
        maxLength={200}
        className={cn(INPUT_CLS, "sm:flex-1")}
        aria-label="Link label"
      />
      <button
        type="submit"
        disabled={add.isPending || !url.trim()}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Add link
      </button>
      {add.error && (
        <p className="text-xs text-red-600 dark:text-red-400 sm:self-center">{add.error.message}</p>
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
          <div key={i} className="h-32 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }
  if (list.error) {
    return (
      <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
        {list.error.message}
      </p>
    );
  }

  const empty = (text: string) => (
    <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">{text}</p>
  );

  return (
    <div className="space-y-5">
      <Card
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
          <ul className="divide-y divide-border/40">
            {byCategory.brand_book.map((a) => (
              <FileRow key={a.id} apiBase={apiBase} asset={a} viewer={viewer} onOpen={() => setOpen(a)} />
            ))}
          </ul>
        )}
      </Card>

      <Card
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
          <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 sm:gap-3 sm:p-5 md:grid-cols-6">
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
      </Card>

      <Card
        icon={Link2}
        title="Google Drive & links"
        hint="Shared folders with logos, product photos, past ads or raw footage."
        count={byCategory.link.length}
      >
        {byCategory.link.length === 0 ? (
          empty("No links yet. Paste a Google Drive or Dropbox folder link below.")
        ) : (
          <ul className="divide-y divide-border/40">
            {byCategory.link.map((a) => (
              <LinkRow key={a.id} apiBase={apiBase} asset={a} viewer={viewer} />
            ))}
          </ul>
        )}
        <AddLinkForm apiBase={apiBase} />
      </Card>

      {list.hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted/50 disabled:opacity-60"
          >
            {list.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Load more
          </button>
        </div>
      )}

      <AssetViewer apiBase={apiBase} asset={open} onClose={() => setOpen(null)} />
    </div>
  );
}
