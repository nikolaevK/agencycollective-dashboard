export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import {
  listDocuments,
  isMediaDocType,
  isMediaPlatform,
} from "@/lib/mediaDocuments";
import { listFoldersWithColors } from "@/lib/mediaFolders";
import { countReadsByDocument, docIdsAckedBy } from "@/lib/mediaReads";
import type { MediaDocType, MediaPlatform } from "@/lib/mediaDocuments";
import {
  uploadMediaDocumentAction,
  deleteMediaDocumentAction,
  updateMediaDocumentAction,
  setDocumentImportantAction,
} from "@/app/actions/mediaDocuments";

/** Any media-buyer (read/create). */
function requireMediaAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.media && !session.permissions.media_manage) {
    return null;
  }
  return session;
}

export async function GET(request: Request) {
  const session = requireMediaAdmin();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder")?.trim() || undefined;
  const docTypeRaw = searchParams.get("docType")?.trim() || "";
  const platformRaw = searchParams.get("platform")?.trim() || "";

  const docType: MediaDocType | undefined = isMediaDocType(docTypeRaw) ? docTypeRaw : undefined;
  const platform: MediaPlatform | undefined = isMediaPlatform(platformRaw) ? platformRaw : undefined;

  try {
    const [documents, folders, counts, myAcks] = await Promise.all([
      listDocuments({ folder, docType, platform }),
      listFoldersWithColors(),
      countReadsByDocument(),
      docIdsAckedBy(session.adminId),
    ]);
    const enriched = documents.map((d) => ({
      ...d,
      ackCount: counts.get(d.id) ?? 0,
      ackByMe: myAcks.has(d.id),
    }));
    return NextResponse.json({ data: { documents: enriched, folders } });
  } catch (err) {
    console.error("[admin/media-buyers/documents GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = requireMediaAdmin();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const result = await uploadMediaDocumentAction(formData);
    if (result.error)
      return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[admin/media-buyers/documents POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  // Delete authorization (media_manage) is enforced inside the action.
  const session = requireMediaAdmin();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const result = await deleteMediaDocumentAction(id);
    if (result.error) {
      const status = result.error === "Forbidden" ? 403 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/media-buyers/documents DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = requireMediaAdmin();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object")
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const { id, important, ...changes } = body as Record<string, unknown>;
    if (!id || typeof id !== "string")
      return NextResponse.json({ error: "id is required" }, { status: 400 });

    // Importance is manager-gated and handled by a dedicated action.
    if (typeof important === "boolean") {
      const result = await setDocumentImportantAction(id, important);
      if (result.error) {
        const status = result.error === "Forbidden" ? 403 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ ok: true });
    }

    const result = await updateMediaDocumentAction(id, changes as never);
    if (result.error) {
      const status = result.error === "Unauthorized" ? 401 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/media-buyers/documents PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
