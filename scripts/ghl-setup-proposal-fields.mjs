#!/usr/bin/env node
// One-time GHL setup for the deal → GHL proposal sync (lib/ghlDealSync.ts),
// for EVERY configured sub-account: the contact custom fields the sync writes
// (Proposal Link / Status / Value / Sent Date, plus "Proposal Link 2" … "N"
// for the 2nd…Nth open contract) and the proposal_* tags (created up front so they show in
// the workflow "Contact Tag" trigger picker before the first proposal goes
// out). Names come from lib/ghlDealRules.ts, the same source the sync uses.
// Reads .env.local.
//
// Additive only: creates what's missing, never renames / deletes anything.
//
// Usage (Node >= 23.6 for the .ts import):
//   node scripts/ghl-setup-proposal-fields.mjs                   # preview
//   node scripts/ghl-setup-proposal-fields.mjs --apply           # create missing fields + tags
//   node scripts/ghl-setup-proposal-fields.mjs --links 6 --apply # link fields up to "Proposal Link 6"
// --links (default 4) only pre-creates fields so GHL templates can merge them:
// the sync itself creates any "Proposal Link N" a lead needs.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PROPOSAL_FIELDS, PROPOSAL_TAGS, proposalLinkFieldName } from "../lib/ghlDealRules.ts";

// GHL dataType per field (contact model).
const FIELD_TYPES = { link: "TEXT", status: "TEXT", value: "MONETORY", sentDate: "DATE" };

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
  if (!m || process.env[m[1]] !== undefined) continue;
  let val = m[2];
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  process.env[m[1]] = val;
}

const apply = process.argv.includes("--apply");
const linksArg = process.argv.indexOf("--links");
const LINK_FIELDS = linksArg > -1 ? Number(process.argv[linksArg + 1]) : 4;
if (!Number.isInteger(LINK_FIELDS) || LINK_FIELDS < 1 || LINK_FIELDS > 50) {
  console.error("--links must be a whole number from 1 to 50");
  process.exit(1);
}
const WANTED = [
  ...Object.entries(PROPOSAL_FIELDS).map(([key, name]) => [name, FIELD_TYPES[key]]),
  ...Array.from({ length: LINK_FIELDS - 1 }, (_, i) => [proposalLinkFieldName(i + 2), "TEXT"]),
];
const SUBS = [
  { id: "agency", pit: process.env.GHL_PIT_AGENCY, locationId: process.env.GHL_LOCATION_ID_AGENCY },
  { id: "peptide", pit: process.env.GHL_PIT, locationId: process.env.GHL_LOCATION_ID },
].filter((s) => s.pit && s.locationId);

async function ghl(sub, method, path, body) {
  const res = await fetch("https://services.leadconnectorhq.com" + path, {
    method,
    headers: {
      Authorization: `Bearer ${sub.pit}`,
      Version: "2021-07-28",
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} → ${res.status} ${json?.message ?? ""}`.trim());
  return json;
}

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

if (SUBS.length === 0) {
  console.error("No GHL sub-account configured in .env.local");
  process.exit(1);
}

for (const sub of SUBS) {
  console.log(`\n== ${sub.id} ==`);
  const fields = (await ghl(sub, "GET", `/locations/${sub.locationId}/customFields?model=contact`))?.customFields ?? [];
  const tags = (await ghl(sub, "GET", `/locations/${sub.locationId}/tags`))?.tags ?? [];

  for (const [name, dataType] of WANTED) {
    const found = fields.find((f) => norm(f.name) === norm(name));
    if (found) {
      const note = found.dataType === dataType ? "" : `  ← expected ${dataType}`;
      console.log(`  field "${name}": exists (${found.fieldKey}, ${found.dataType})${note}`);
      continue;
    }
    if (!apply) { console.log(`  field "${name}": MISSING — would create (${dataType}, contact)`); continue; }
    const created = await ghl(sub, "POST", `/locations/${sub.locationId}/customFields`, {
      name,
      dataType,
      model: "contact",
    });
    console.log(`  field "${name}": created (${created?.customField?.fieldKey ?? "ok"})`);
  }

  for (const name of Object.values(PROPOSAL_TAGS)) {
    if (tags.some((t) => norm(t.name) === norm(name))) { console.log(`  tag ${name}: exists`); continue; }
    if (!apply) { console.log(`  tag ${name}: MISSING — would create`); continue; }
    await ghl(sub, "POST", `/locations/${sub.locationId}/tags`, { name });
    console.log(`  tag ${name}: created`);
  }
}
if (!apply) console.log("\nPreview only — re-run with --apply to create what's missing.");
