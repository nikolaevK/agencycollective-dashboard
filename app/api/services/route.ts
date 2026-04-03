export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readInvoiceServices } from "@/lib/invoiceServices";

/** Public read-only endpoint for service names. Used by closer deal form. */
export async function GET() {
  const services = await readInvoiceServices();
  return NextResponse.json({
    data: services.map((s) => ({ id: s.id, name: s.name, rate: s.rate })),
  });
}
