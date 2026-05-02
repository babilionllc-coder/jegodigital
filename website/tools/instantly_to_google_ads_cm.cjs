#!/usr/bin/env node
/**
 * instantly_to_google_ads_cm.cjs
 *
 * Mirror of instantly_to_fb_ca.cjs — pushes Instantly leads to Google Ads
 * Customer Match user lists for retargeting on Search/Display/YouTube.
 *
 * Creates / reuses two user lists:
 *   - JD_Instantly_MX_2026-05
 *   - JD_Instantly_USA_2026-05
 *
 * Uses Google Ads API v20 OfflineUserDataJobService:
 *   1. Create user list (type CRM_BASED) if missing
 *   2. Create OfflineUserDataJob (type CUSTOMER_MATCH_USER_LIST)
 *   3. Add operations in batches of ≤100
 *   4. Run job
 *
 * Email normalization: lowercase + trim + SHA-256 hex
 *
 * Usage:
 *   node tools/instantly_to_google_ads_cm.cjs            # full sync
 *   node tools/instantly_to_google_ads_cm.cjs --dry-run  # count only
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ---------- Load .env ----------
function loadEnv() {
  const envPath = path.join(__dirname, "..", "functions", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const INSTANTLY_API_KEY = process.env.INSTANTLY_API_KEY;
const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN;
const DEV_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
const LOGIN_CID = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "7997995839";
const CUSTOMER_ID = (
  process.env.GOOGLE_ADS_CUSTOMER_ID || "4715272770"
).replace(/-/g, "");

if (
  !INSTANTLY_API_KEY ||
  !CLIENT_ID ||
  !CLIENT_SECRET ||
  !REFRESH_TOKEN ||
  !DEV_TOKEN
) {
  throw new Error("Missing required env vars (INSTANTLY_API_KEY + Google Ads creds)");
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const API_BASE = `https://googleads.googleapis.com/v20/customers/${CUSTOMER_ID}`;

// ---------- Helpers ----------
function hashEmail(email) {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

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
  if (phone.startsWith("+1") || /^1\d{10}$/.test(phone)) return "USA";
  return "MX";
}

async function refreshAccessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("OAuth refresh failed: " + JSON.stringify(j));
  return j.access_token;
}

let _accessToken = null;
async function getHeaders() {
  if (!_accessToken) _accessToken = await refreshAccessToken();
  return {
    Authorization: `Bearer ${_accessToken}`,
    "developer-token": DEV_TOKEN,
    "login-customer-id": LOGIN_CID,
    "Content-Type": "application/json",
  };
}

async function googleAdsCall(method, urlPath, body = null) {
  const url = urlPath.startsWith("http") ? urlPath : API_BASE + urlPath;
  const init = { method, headers: await getHeaders() };
  if (body) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `Google Ads ${method} ${urlPath}: ${res.status} — ${text.slice(0, 400)}`
    );
  }
  return json;
}

// ---------- Pull Instantly leads (paginated) ----------
async function pullAllInstantlyLeads() {
  const all = [];
  let next = null;
  let page = 0;
  while (page < 200) {
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

// ---------- Find or create Customer Match user list ----------
async function findUserListByName(name) {
  // Use GAQL search to find by name
  const query = `SELECT user_list.id, user_list.name FROM user_list WHERE user_list.name = '${name.replace(/'/g, "\\'")}' LIMIT 1`;
  const r = await googleAdsCall(
    "POST",
    `/googleAds:search`,
    { query }
  );
  const results = r.results || [];
  if (!results.length) return null;
  return results[0].userList;
}

async function createCustomerMatchUserList(name, description) {
  // Use UserListService:mutate
  const body = {
    operations: [
      {
        create: {
          name,
          description,
          membershipLifeSpan: 540, // max for Customer Match
          crmBasedUserList: {
            uploadKeyType: "CONTACT_INFO",
          },
        },
      },
    ],
  };
  const r = await googleAdsCall("POST", `/userLists:mutate`, body);
  const resourceName = r.results[0].resourceName;
  const id = resourceName.split("/").pop();
  return { id, resourceName };
}

async function findOrCreateCustomerMatchList(name, description) {
  const existing = await findUserListByName(name);
  if (existing) {
    console.log(`  ↻ Reusing existing list "${name}" → ${existing.id}`);
    return {
      id: existing.id,
      resourceName: `customers/${CUSTOMER_ID}/userLists/${existing.id}`,
    };
  }
  const created = await createCustomerMatchUserList(name, description);
  console.log(`  ✚ Created new list "${name}" → ${created.id}`);
  return created;
}

// ---------- Upload via OfflineUserDataJob ----------
async function uploadHashedEmails(userListResource, hashedEmails) {
  if (!hashedEmails.length) return { uploaded: 0, jobName: null };

  // 1. Create job
  const createResp = await googleAdsCall(
    "POST",
    `/offlineUserDataJobs:create`,
    {
      job: {
        type: "CUSTOMER_MATCH_USER_LIST",
        customerMatchUserListMetadata: { userList: userListResource },
      },
    }
  );
  const jobResource = createResp.resourceName;
  console.log(`  ⚡ Created job: ${jobResource}`);

  // 2. Add operations in batches
  const BATCH = 100;
  let uploaded = 0;
  for (let i = 0; i < hashedEmails.length; i += BATCH) {
    const batch = hashedEmails.slice(i, i + BATCH);
    const operations = batch.map((h) => ({
      create: { userIdentifiers: [{ hashedEmail: h }] },
    }));
    await googleAdsCall("POST", `/${jobResource}:addOperations`, {
      operations,
      enable_partial_failure: true,
    });
    uploaded += batch.length;
    if (i % 1000 === 0 || uploaded === hashedEmails.length) {
      process.stderr.write(
        `\r    added ${uploaded}/${hashedEmails.length} ops...`
      );
    }
  }
  process.stderr.write("\n");

  // 3. Run job
  await googleAdsCall("POST", `/${jobResource}:run`, {});
  console.log(`  ✅ Job started — Google will process within 24h`);
  return { uploaded, jobName: jobResource };
}

// ---------- Main ----------
(async () => {
  console.log("=".repeat(60));
  console.log("INSTANTLY → GOOGLE ADS CUSTOMER MATCH (MX + USA)");
  console.log("=".repeat(60));
  console.log(`Customer: ${CUSTOMER_ID} (login MCC: ${LOGIN_CID})`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "LIVE PUSH"}`);

  console.log("\n[1/4] Pulling all Instantly leads...");
  const leads = await pullAllInstantlyLeads();
  console.log(`Total leads: ${leads.length}`);

  console.log("\n[2/4] Segmenting MX vs USA + hashing...");
  const mxHashes = new Set();
  const usaHashes = new Set();
  let skipped = 0;
  for (const l of leads) {
    if (!l.email) {
      skipped++;
      continue;
    }
    const geo = segmentGeo(l);
    const h = hashEmail(l.email);
    if (geo === "MX") mxHashes.add(h);
    else usaHashes.add(h);
  }
  console.log(
    `  MX: ${mxHashes.size}  USA: ${usaHashes.size}  skipped: ${skipped}`
  );

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No changes made.");
    return;
  }

  console.log("\n[3/4] Find/create Customer Match user lists...");
  const mxList = await findOrCreateCustomerMatchList(
    "JD_Instantly_MX_2026-05",
    "All Instantly cold-email leads — Mexican real estate. Auto-synced."
  );
  const usaList = await findOrCreateCustomerMatchList(
    "JD_Instantly_USA_2026-05",
    "All Instantly cold-email leads — Miami/USA Hispanic luxury."
  );

  console.log("\n[4/4] Uploading hashed emails...");
  console.log(`MX list ${mxList.id}:`);
  const mxRes = await uploadHashedEmails(mxList.resourceName, [...mxHashes]);
  console.log(`USA list ${usaList.id}:`);
  const usaRes = await uploadHashedEmails(usaList.resourceName, [...usaHashes]);

  console.log("\n" + "=".repeat(60));
  console.log("✅ DONE");
  console.log(`  MX  list ${mxList.id}: ${mxRes.uploaded} ops queued`);
  console.log(`  USA list ${usaList.id}: ${usaRes.uploaded} ops queued`);
  console.log(
    "  Google will hash-match within 24-48h. Match rate ~50-70% typical."
  );
  console.log("=".repeat(60));
})().catch((e) => {
  console.error("\n❌ FATAL:", e.message);
  process.exit(1);
});
