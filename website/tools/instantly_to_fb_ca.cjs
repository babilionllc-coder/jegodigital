#!/usr/bin/env node
/**
 * instantly_to_fb_ca.cjs
 *
 * Pulls ALL Instantly leads, segments MX vs USA, hashes emails (SHA256),
 * pushes to two Facebook Custom Audiences for retargeting:
 *   - JD_Instantly_MX_2026-05  (Mexican real estate inmobiliarias)
 *   - JD_Instantly_USA_2026-05 (Miami/USA Hispanic luxury)
 *
 * Idempotent: if the CA already exists by name, reuses its ID and APPENDS users
 * (Meta dedupes server-side on hashed email).
 *
 * Geo segmentation rules (in order of precedence):
 *   1. email TLD ".mx"           → MX
 *   2. website ".mx" / ".com.mx" → MX
 *   3. phone "+52..."            → MX
 *   4. company list_name has "Mexico" / "Cancun" / "CDMX" / "Tulum" → MX
 *   5. email/site ".com" + list has "Miami" / "USA" / "US"          → USA
 *   6. default fallback                                             → MX
 *
 * Usage:
 *   node tools/instantly_to_fb_ca.cjs            # full sync (one-shot seed)
 *   node tools/instantly_to_fb_ca.cjs --dry-run  # count + segment only, no push
 *   node tools/instantly_to_fb_ca.cjs --since=2026-04-01  # delta from date
 *
 * Env required (auto-loaded from website/functions/.env):
 *   INSTANTLY_API_KEY
 *   FB_USER_TOKEN
 *   META_AD_ACCOUNT_ID  (default 968739288838315)
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ---------- Load .env ----------
function loadEnv() {
  const envPath = path.join(__dirname, "..", "functions", ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const FB_TOKEN = process.env.FB_USER_TOKEN || process.env.META_USER_TOKEN;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || "968739288838315";
const API_VERSION = "v22.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

if (!INSTANTLY_API_KEY) throw new Error("INSTANTLY_API_KEY missing");
if (!FB_TOKEN) throw new Error("FB_USER_TOKEN missing");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SINCE_FLAG = args.find((a) => a.startsWith("--since="));
const SINCE_TS = SINCE_FLAG
  ? Math.floor(new Date(SINCE_FLAG.split("=")[1]).getTime() / 1000)
  : null;

// ---------- Geo segmentation ----------
function segmentGeo(lead) {
  const email = (lead.email || "").toLowerCase();
  const website = (lead.website || "").toLowerCase();
  const phone = (lead.phone || "").replace(/[^\d+]/g, "");
  const listName = (lead.list_name || lead.campaign_name || "").toLowerCase();

  if (email.endsWith(".mx") || email.includes(".mx")) return "MX";
  if (website.endsWith(".mx") || website.includes(".com.mx")) return "MX";
  if (phone.startsWith("+52") || phone.startsWith("52")) return "MX";
  if (
    /\b(mexico|cancun|cdmx|tulum|guadalajara|monterrey|playa|merida|riviera|inmobiliaria)\b/.test(
      listName
    )
  )
    return "MX";
  if (/\b(miami|usa|florida|us\b|united states|hispanic)\b/.test(listName))
    return "USA";
  // Phone US format
  if (phone.startsWith("+1") || /^1\d{10}$/.test(phone)) return "USA";
  return "MX"; // default — most Instantly leads are MX RE
}

// ---------- SHA256 hash for Meta ----------
function hashEmail(email) {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

// ---------- Pull all Instantly leads (paginated) ----------
async function pullAllInstantlyLeads() {
  const all = [];
  let next = null;
  let page = 0;
  while (page < 100) {
    page++;
    const body = { limit: 100 };
    if (next) body.starting_after = next;
    const res = await fetch("https://api.instantly.ai/api/v2/leads/list", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${INSTANTLY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    const items = j.items || [];
    if (!items.length) break;
    all.push(...items);
    next = j.next_starting_after || null;
    process.stderr.write(
      `\r[instantly] pulled ${all.length} leads (page ${page})...`
    );
    if (!next) break;
  }
  process.stderr.write("\n");
  return all;
}

// ---------- Find or create CA ----------
async function findOrCreateCA(name, description) {
  // Search by name in account
  const r = await fetch(
    `${GRAPH}/act_${AD_ACCOUNT_ID}/customaudiences?fields=id,name&limit=200&access_token=${FB_TOKEN}`
  );
  const j = await r.json();
  if (j.error) throw new Error(`FB list CAs: ${j.error.message}`);
  const existing = (j.data || []).find((a) => a.name === name);
  if (existing) {
    console.log(`  ↻ Reusing existing CA "${name}" → ${existing.id}`);
    return existing.id;
  }
  // Create
  const create = await fetch(
    `${GRAPH}/act_${AD_ACCOUNT_ID}/customaudiences?access_token=${FB_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        subtype: "CUSTOM",
        customer_file_source: "USER_PROVIDED_ONLY",
      }),
    }
  );
  const cj = await create.json();
  if (cj.error) throw new Error(`FB create CA "${name}": ${cj.error.message}`);
  console.log(`  ✚ Created new CA "${name}" → ${cj.id}`);
  return cj.id;
}

// ---------- Push hashed emails to CA ----------
async function pushUsersToCA(caId, emails) {
  // Meta accepts up to 10K per call. Batch in 5K to be safe.
  const BATCH = 5000;
  let pushed = 0;
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const payload = {
      schema: ["EMAIL_SHA256"],
      data: batch.map((h) => [h]),
    };
    const url = `${GRAPH}/${caId}/users?access_token=${FB_TOKEN}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    const j = await res.json();
    if (j.error) {
      console.error(`  ❌ Batch push failed: ${j.error.message}`);
      throw new Error(j.error.message);
    }
    pushed += batch.length;
    console.log(
      `  ⚡ Pushed batch ${Math.floor(i / BATCH) + 1} → ${pushed}/${emails.length} (audience_id=${j.audience_id || caId}, num_received=${j.num_received || batch.length}, num_invalid=${j.num_invalid_entries || 0})`
    );
  }
  return pushed;
}

// ---------- Main ----------
(async () => {
  console.log("=".repeat(60));
  console.log("INSTANTLY → FB CUSTOM AUDIENCES (MX + USA)");
  console.log("=".repeat(60));
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE PUSH"}`);
  if (SINCE_TS)
    console.log(`Since: ${new Date(SINCE_TS * 1000).toISOString()}`);

  console.log("\n[1/4] Pulling all Instantly leads...");
  const leads = await pullAllInstantlyLeads();
  console.log(`Total leads: ${leads.length}`);

  console.log("\n[2/4] Segmenting MX vs USA...");
  const mxEmails = new Set();
  const usaEmails = new Set();
  let skippedNoEmail = 0;
  let skippedSince = 0;
  for (const l of leads) {
    if (!l.email) {
      skippedNoEmail++;
      continue;
    }
    if (SINCE_TS) {
      const ts = l.created_at
        ? Math.floor(new Date(l.created_at).getTime() / 1000)
        : 0;
      if (ts < SINCE_TS) {
        skippedSince++;
        continue;
      }
    }
    const geo = segmentGeo(l);
    const hashed = hashEmail(l.email);
    if (geo === "MX") mxEmails.add(hashed);
    else usaEmails.add(hashed);
  }
  console.log(
    `  MX: ${mxEmails.size}  USA: ${usaEmails.size}  skipped(no email): ${skippedNoEmail}  skipped(date): ${skippedSince}`
  );

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Done. No changes made.");
    return;
  }

  console.log("\n[3/4] Creating/finding Custom Audiences...");
  const mxCaId = await findOrCreateCA(
    "JD_Instantly_MX_2026-05",
    "All Instantly cold-email leads — Mexican real estate. Auto-synced daily by syncLeadsToFbCustomAudiences."
  );
  const usaCaId = await findOrCreateCA(
    "JD_Instantly_USA_2026-05",
    "All Instantly cold-email leads — Miami/USA Hispanic luxury. Auto-synced daily."
  );

  console.log("\n[4/4] Pushing hashed emails...");
  console.log(`MX CA (${mxCaId}):`);
  const mxPushed = await pushUsersToCA(mxCaId, [...mxEmails]);
  console.log(`USA CA (${usaCaId}):`);
  const usaPushed = await pushUsersToCA(usaCaId, [...usaEmails]);

  console.log("\n" + "=".repeat(60));
  console.log("✅ DONE");
  console.log(`  MX CA  ${mxCaId}: ${mxPushed} emails pushed`);
  console.log(`  USA CA ${usaCaId}: ${usaPushed} emails pushed`);
  console.log(
    "  Note: Meta will take 1-24h to fully process & match the audience."
  );
  console.log("=".repeat(60));
})().catch((e) => {
  console.error("\n❌ FATAL:", e.message);
  process.exit(1);
});
