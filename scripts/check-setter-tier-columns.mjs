#!/usr/bin/env node
// One-off diagnostic for the setter-tier migration. Reads .env.local, connects
// to the same Turso DB the dev server uses, prints what's in the relevant
// tables, and adds any missing columns. Strictly additive — `ALTER TABLE
// ADD COLUMN` only. No data is rewritten or dropped.
//
// Usage:
//   node scripts/check-setter-tier-columns.mjs            # report only
//   node scripts/check-setter-tier-columns.mjs --fix       # add missing columns

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@libsql/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");

// Tiny .env.local parser — avoids pulling in dotenv as a dep just for a script.
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
  if (!m) continue;
  const [, key, raw] = m;
  if (process.env[key] !== undefined) continue;
  let val = raw;
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  process.env[key] = val;
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("TURSO_DATABASE_URL not set in .env.local");
  process.exit(1);
}

const fix = process.argv.includes("--fix");
const db = createClient({ url, authToken });

const REQUIRED = [
  { table: "appointments", column: "setter_tier",    defn: "TEXT" },
  { table: "appointments", column: "setter_tier_at", defn: "TEXT" },
  { table: "deals",        column: "setter_tier",    defn: "TEXT" },
  { table: "deals",        column: "no_retainer",    defn: "INTEGER NOT NULL DEFAULT 0" },
];

console.log("DB URL:", url);
console.log("Mode:", fix ? "FIX (will run ALTER TABLE)" : "REPORT ONLY (run with --fix to add missing)");
console.log();

// Schema version stamped in schema_meta.
try {
  const sv = await db.execute("SELECT version FROM schema_meta WHERE id = 1");
  console.log("schema_meta.version:", sv.rows[0]?.version ?? "(none)");
} catch (e) {
  console.log("schema_meta:", "table missing (fresh DB?)");
}
console.log();

for (const table of ["appointments", "deals"]) {
  try {
    const info = await db.execute(`PRAGMA table_info(${table})`);
    const cols = info.rows.map((r) => r.name);
    console.log(`${table} columns (${cols.length}):`, cols.join(", "));
  } catch (e) {
    console.log(`${table}: ERROR`, e.message);
  }
}
console.log();

let missing = 0;
for (const { table, column, defn } of REQUIRED) {
  let exists = false;
  try {
    await db.execute(`SELECT ${column} FROM ${table} LIMIT 0`);
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) {
    console.log(`✓ ${table}.${column} exists`);
    continue;
  }
  missing++;
  if (!fix) {
    console.log(`✗ ${table}.${column} MISSING — re-run with --fix to add`);
    continue;
  }
  try {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${defn}`);
    console.log(`+ ${table}.${column} added (${defn})`);
  } catch (e) {
    console.log(`! ${table}.${column} ALTER FAILED:`, e.message);
  }
}

console.log();
if (missing === 0) {
  console.log("All required columns present. If runtime queries still fail, the dev server is using a different DB — print TURSO_DATABASE_URL there and compare.");
} else if (fix) {
  console.log(`Done. ${missing} column(s) attempted. Re-run without --fix to verify.`);
} else {
  console.log(`${missing} column(s) missing. Run again with --fix to add them.`);
}

process.exit(0);
