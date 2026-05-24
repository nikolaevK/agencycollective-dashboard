export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/adminSession";
import { findAdmin } from "@/lib/admins";
import { ensureMigrated } from "@/lib/db";
import {
  clearWelcomeKitPdf,
  getWelcomeKitRecord,
  setWelcomeKitPdf,
  MAX_WELCOME_KIT_PDF_BYTES,
} from "@/lib/welcomeKit";

async function requireAdmin() {
  const session = getAdminSession();
  if (!session) return null;
  return findAdmin(session.adminId);
}

/** Upload (or replace) the Welcome Kit's downloadable PDF (multipart `file`). */
export async function POST(request: Request) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!isPdf) {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }
    if (file.size > MAX_WELCOME_KIT_PDF_BYTES) {
      return NextResponse.json(
        { error: "PDF exceeds the 10 MB limit" },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Re-check the actual byte length (file.size is client-reported).
    if (buffer.length > MAX_WELCOME_KIT_PDF_BYTES) {
      return NextResponse.json(
        { error: "PDF exceeds the 10 MB limit" },
        { status: 413 }
      );
    }

    const name = (file.name || "welcome-kit.pdf").slice(0, 240);
    await setWelcomeKitPdf(buffer, name, buffer.length);

    const record = await getWelcomeKitRecord();
    return NextResponse.json({
      data: { pdf: record.pdf, updatedAt: record.updatedAt },
    });
  } catch (err) {
    console.error("[welcome-kit] PDF upload failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Remove the uploaded PDF. */
export async function DELETE() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureMigrated();
  try {
    await clearWelcomeKitPdf();
    const record = await getWelcomeKitRecord();
    return NextResponse.json({
      data: { pdf: record.pdf, updatedAt: record.updatedAt },
    });
  } catch (err) {
    console.error("[welcome-kit] PDF delete failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
