#!/usr/bin/env node
/**
 * instantly_to_fb_ca_v2.cjs
 *
 * v2 — LIST-BASED geo segmentation. Walks each Instantly lead-list
 * by NAME, classifies the WHOLE list as MX / USA / SKIP, then
 * pulls leads filtered by list_id and pushes hashed emails to the
 * matching FB Custom Audience.
 *
 * Fixes v1's "only 7 USA" bug — lead objects don't carry list_name,
 * so .com emails (most US realtors) fell to MX default. v2 reads the
 * list NAME and trusts it.
 *
 * Usage:
 *   node tools/instantly_to_fb_ca_v2.cjs            # full sync — append to existing CAs
 *   node tools/instantly_to_fb_ca_v2.cjs --dry-run  # show MX/USA/SKIP buckets only
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.join(__dirname, "..", "functions", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const FB_TOKEN = process.env.FB_USER_TOKEN;
const AD_ACCOUNT_ID = "968739288838315";
const CA_MX_ID = "120241357699890662";
const CA_USA_ID = "120241357703100662";
const GRAPH = "https://graph.facebook.com/v22.0";

const DRY = process.argv.includes("--dry-run");

const hashEmail = (e) =>
  crypto.createHash("sha256").update(e.trim().toLowerCase()).digest("hex");

// ---------- LIST-NAME-based geo classification ----------
function classifyList(listName) {
  const n = (listName || "").toLowerCase();
  // USA signals — explicit
  if (
    /\b(usa|us[\s\-]|miami|florida|california|texas|new york|nyc|hispanic|us hispanic|us-hispanic|bilingual)\b/.test(
      n
    )
  )
    return "USA";
  // MX signals — explicit
  if (
    /\b(mexico|cancun|cdmx|tulum|guadalajara|monterrey|playa|merida|riviera|inmobiliaria|mx[\s\-])\b/.test(
      n
    )
  )
    return "MX";
  // Generic "supersearch", "real estate", "AI Sales Agent" etc — bucket as MX (most are MX)
  if (/\b(supersearch|trojan|preventa|wave|world cup)\b/.test(n)) return "MX";
  return "MX"; // safer default — most JD lists are MX
}

// ---------- Pull all lead lists ----------
async function fetchLeadLists() {
  const all = [];
  let next = null;
  while (true) {
    const url = next
      ? `https://api.instantly.ai/api/v2/lead-lists?limit=100&starting_after=${encodeURIComponent(next)}`
      : "https://api.instantly.ai/api/v2/lead-lists?limit=100";
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${INSTANTLY_API_KEY}` },
    });
    const j = await r.json();
    const items = j.items || [];
    if (!items.length) break;
    all.push(...items);
    next = j.next_starting_after || null;
    if (!next) break;
  }
  return all;
}

// ---------- Pull leads filtered by list_id ----------
async function fetchLeadsByListId(listId) {
  const all = [];
  let next = null;
  let page = 0;
  while (page < 200) {
    page++;
    const body = { limit: 100, list_id: listId };
    if (next) body.starting_after = next;
    const r = await fetch("https://api.instantly.ai/api/v2/leads/list", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${INSTANTLY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    const items = j.items || [];
    if (!items.length) break;
    all.push(...items);
    next = j.next_starting_after || null;
    if (!next) break;
  }
  return all;
}

async function pushToCA(caId, hashedEmails) {
  if (!hashedEmails.length) return { pushed: 0 };
  const BATCH = 5000;
  let pushed = 0;
  for (let i = 0; i < hashedEmails.length; i += BATCH) {
    const batch = hashedEmails.slice(i, i + BATCH);
    const payload = { schema: ["EMAIL_SHA256"], data: batch.map((h) => [h]) };
    const r = await fetch(`${GRAPH}/${caId}/users?access_token=${FB_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    pushed += j.num_received || batch.length;
  }
  return { pushed };
}

(async () => {
  console.log("=".repeat(60));
  console.log("INSTANTLY → FB CA v2 (LIST-BASED segmentation)");
  console.log("=".repeat(60));
  console.log(`Mode: ${DRY ? "DRY RUN" : "LIVE PUSH"}`);

  console.log("\n[1/3] Pulling all Instantly lead-lists...");
  const lists = await fetchLeadLists();
  console.log(`Found ${lists.length} lists`);

  const buckets = { MX: [], USA: [] };
  console.log("\n[2/3] Classifying lists + pulling leads...");
  for (const L of lists) {
    const geo = classifyList(L.name);
    const leads = await fetchLeadsByListId(L.id);
    const validHashes = leads
      .filter((l) => l.email)
      .map((l) => hashEmail(l.email));
    buckets[geo].push(...validHashes);
    console.log(
      `  [${geo}] ${L.name?.slice(0, 50).padEnd(50)} → ${leads.length} leads (${validHashes.length} w/email)`
    );
  }

  // Dedupe within each bucket
  buckets.MX = [...new Set(buckets.MX)];
  buckets.USA = [...new Set(buckets.USA)];

  console.log("\n[3/3] Summary:");
  console.log(`  🇲🇽 MX  unique:  ${buckets.MX.length}`);
  console.log(`  🇺🇸 USA unique:  ${buckets.USA.length}`);

  if (DRY) {
    console.log("\n[DRY RUN] No push.");
    return;
  }

  console.log("\n[push] Appending to existing FB CAs...");
  const mxRes = await pushToCA(CA_MX_ID, buckets.MX);
  console.log(`  MX  CA ${CA_MX_ID}: +${mxRes.pushed} (Meta dedupes server-side)`);
  const usaRes = await pushToCA(CA_USA_ID, buckets.USA);
  console.log(`  USA CA ${CA_USA_ID}: +${usaRes.pushed}`);
  console.log("\n✅ DONE — Meta will fully reprocess audiences within 24h");
})().catch((e) => {
  console.error("\n❌ FATAL:", e.message);
  process.exit(1);
});
