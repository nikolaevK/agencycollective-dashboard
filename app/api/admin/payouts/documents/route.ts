export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { readDocumentsByBrand } from "@/lib/payoutDocuments";
import {
  uploadPayoutDocumentAction,
  deletePayoutDocumentAction,
} from "@/app/actions/payoutDocuments";

async function requireCloserAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  if (!session.isSuper && !session.permissions.closers) return null;
  const admin = await findAdmin(session.adminId);
  if (!admin) return null;
  return admin;
}

export async function GET(request: Request) {
  const admin = await requireCloserAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const brandName = searchParams.get("brandName");
  if (!brandName)
    return NextResponse.json(
      { error: "brandName is required" },
      { status: 400 }
    );

  try {
    const docs = await readDocumentsByBrand(brandName);
    return NextResponse.json({ data: docs });
  } catch (err) {
    console.error("[admin/payouts/documents GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const admin = await requireCloserAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const result = await uploadPayoutDocumentAction(formData);
    if (result.error)
      return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ data: result.data });
  } catch (err) {
    console.error("[admin/payouts/documents POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await requireCloserAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    const result = await deletePayoutDocumentAction(id);
    if (result.error)
      return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/payouts/documents DELETE]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
