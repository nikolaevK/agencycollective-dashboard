#!/usr/bin/env node
// One-off backfill: for deal-imported payouts in ONE payout month, move each
// deal to the closer named in the payout's Sales Rep — the same rule the app
// now applies on import / Sales Rep edit (lib/dealCloserReassign.ts), using
// the same matcher (lib/salesRepMatch.ts). Reads .env.local.
//
// Additive only: adds the three deals columns if missing (same as
// ensureCriticalColumns), then UPDATEs closer_id with the submitter kept in
// original_closer_id. Nothing is dropped or rewritten otherwise.
//
// Usage (Node >= 23.6 for the .ts import):
//   node scripts/backfill-deal-closer-from-payouts.mjs --month 9 --year 2026          # preview
//   node scripts/backfill-deal-closer-from-payouts.mjs --month 9 --year 2026 --apply  # write

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@libsql/client";
import { matchCloserBySalesRep } from "../lib/salesRepMatch.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
  if (!m || process.env[m[1]] !== undefined) continue;
  let val = m[2];
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const month = Number(arg("--month"));
const year = Number(arg("--year"));
const apply = process.argv.includes("--apply");
if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
  console.error("Usage: --month <1-12> --year <yyyy> [--apply]");
  process.exit(1);
}

const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const closers = (await db.execute("SELECT * FROM closers WHERE is_system = 0")).rows.map((r) => ({
  id: String(r.id),
  displayName: String(r.display_name),
  slug: String(r.slug),
  role: String(r.role || "closer"),
  status: String(r.status || "active"),
}));
const nameOf = (id) => closers.find((c) => c.id === id)?.displayName ?? id;

const rows = (
  await db.execute({
    sql: `SELECT p.brand_name, p.sales_rep, p.source_deal_id, d.closer_id, d.client_name
            FROM payouts p JOIN deals d ON d.id = p.source_deal_id
           WHERE p.payout_month = ? AND p.payout_year = ? AND p.source_deal_id IS NOT NULL
           ORDER BY p.brand_name`,
    args: [month, year],
  })
).rows;

const moves = [];
console.log(`Deal-imported payouts for ${year}-${String(month).padStart(2, "0")}: ${rows.length}\n`);
for (const r of rows) {
  const salesRep = r.sales_rep == null ? null : String(r.sales_rep);
  const current = String(r.closer_id);
  const target = matchCloserBySalesRep(salesRep, closers);
  const action = !target ? "keep (no active match)" : target === current ? "keep (already credited)" : `MOVE → ${nameOf(target)}`;
  console.log(`  ${String(r.brand_name).padEnd(24)} rep=${String(salesRep).padEnd(18)} closer=${nameOf(current).padEnd(18)} ${action}`);
  if (target && target !== current) moves.push({ dealId: String(r.source_deal_id), from: current, to: target, salesRep });
}

if (!apply) {
  console.log(`\n${moves.length} deal(s) would move. Re-run with --apply to write.`);
  process.exit(0);
}

for (const col of ["original_closer_id", "closer_reassigned_at", "closer_reassigned_source"]) {
  try {
    await db.execute(`SELECT ${col} FROM deals LIMIT 0`);
  } catch {
    await db.execute(`ALTER TABLE deals ADD COLUMN ${col} TEXT`);
    console.log(`Added deals.${col}`);
  }
}

let moved = 0;
for (const m of moves) {
  const res = await db.execute({
    sql: `UPDATE deals
             SET closer_id = ?, original_closer_id = COALESCE(original_closer_id, ?),
                 closer_reassigned_at = datetime('now'), closer_reassigned_source = 'payout',
                 updated_at = datetime('now')
           WHERE id = ? AND closer_id = ?`,
    args: [m.to, m.from, m.dealId, m.from],
  });
  if (res.rowsAffected === 0) {
    console.log(`  skipped ${m.dealId} (closer changed meanwhile)`);
    continue;
  }
  await db.execute({
    sql: `INSERT INTO audit_log (admin_id, admin_username, action, target_type, target_id, details)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: ["script", "script:backfill-deal-closer", "deal.closer_reassign", "deal", m.dealId,
      JSON.stringify({ from: m.from, to: m.to, salesRep: m.salesRep, source: "payout-backfill" })],
  });
  moved++;
}
console.log(`\nMoved ${moved}/${moves.length} deal(s).`);
