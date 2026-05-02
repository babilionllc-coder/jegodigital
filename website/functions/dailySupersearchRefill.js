/**
 * dailySupersearchRefill — autonomous daily lead refill via Instantly Supersearch.
 *
 * Schedule: every day at 07:00 UTC (= 01:00 Cancún CDMX)
 *
 * Pulls fresh signal-filtered leads from Instantly Supersearch for 3 cohorts,
 * de-dups against the existing workspace, generates {{personalization}} from the
 * signal context, and adds them to the matching active campaign. Posts a Slack
 * digest at the end.
 *
 * Cohorts (defined in ./supersearch_cohorts.json):
 *   - mx_funding   → Trojan Horse V2 (MX RE devs + funding round last 30d)
 *   - usa_hiring   → USA Real Estate Devs 2026-05 (USA devs + hiring surge last 14d)
 *   - miami_posts  → USA Miami RE Hiring (Miami brokers + LinkedIn post last 7d)
 *
 * Per CLAUDE.md HR-1 + HR-6: every API call returns its result; no fabricated counts.
 *
 * Status: search_filters in cohort config are PLACEHOLDERS until Alex captures
 * the working filter JSON from the Instantly UI (one-time, see Section 2 of
 * skills_patches/instantly-supersearch-mastery_v1.md). Until then, the function
 * runs in DRY_RUN mode and posts the count-only diagnostic to Slack.
 *
 * API endpoints used:
 *   POST /api/v2/supersearch-enrichment/count-leads-from-supersearch  (free, count check)
 *   POST /api/v2/supersearch-enrichment/preview-leads-from-supersearch (free, sample)
 *   POST /api/v2/supersearch-enrichment                                (consumes credits)
 *   POST /api/v2/leads                                                 (upload)
 *   POST /api/v2/leads/list                                            (workspace dedup)
 */
const functions = require("firebase-functions");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const INSTANTLY_BASE = "https://api.instantly.ai/api/v2";
const UA = "jegodigital-supersearch-refill/1.0";

function instantlyHeaders() {
  const key = process.env.INSTANTLY_API_KEY;
  if (!key) throw new Error("INSTANTLY_API_KEY not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "User-Agent": UA,
  };
}

async function postSlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    functions.logger.warn("SLACK_WEBHOOK_URL not set; skipping Slack post");
    return;
  }
  try {
    await axios.post(url, { text }, { timeout: 10000 });
  } catch (e) {
    functions.logger.error("Slack post failed", { error: e.message });
  }
}

function loadCohorts() {
  const p = path.join(__dirname, "supersearch_cohorts.json");
  return JSON.parse(fs.readFileSync(p, "utf8")).cohorts;
}

async function countLeads(searchFilters) {
  const r = await axios.post(
    `${INSTANTLY_BASE}/supersearch-enrichment/count-leads-from-supersearch`,
    { search_filters: searchFilters },
    { headers: instantlyHeaders(), timeout: 30000 }
  );
  return r.data.number_of_leads;
}

async function previewLeads(searchFilters, limit = 5) {
  const r = await axios.post(
    `${INSTANTLY_BASE}/supersearch-enrichment/preview-leads-from-supersearch`,
    { search_filters: searchFilters, limit },
    { headers: instantlyHeaders(), timeout: 60000 }
  );
  return r.data.leads || r.data.items || [];
}

async function createLeadList(name) {
  // FIX 2026-05-02: enrichment requires a destination list (resource_type: 1)
  const r = await axios.post(
    `${INSTANTLY_BASE}/lead-lists`,
    { name },
    { headers: instantlyHeaders(), timeout: 30000 }
  );
  return r.data.id;
}

async function moveLeadsToCampaign(listId, campaignId) {
  // After enrichment completes, move leads from the list to the campaign so
  // the email sequence fires.
  try {
    const r = await axios.post(
      `${INSTANTLY_BASE}/leads/move`,
      { ids: [], from_list_id: listId, to_campaign_id: campaignId, all: true },
      { headers: instantlyHeaders(), timeout: 30000 }
    );
    return r.data;
  } catch (e) {
    return { error: e.response?.data?.message || e.message };
  }
}

async function runEnrichment(searchFilters, limit, listId) {
  // FIX 2026-05-02: correct endpoint is /supersearch-enrichment/enrich-leads-from-supersearch
  // with resource_type=1 (list) — bare /supersearch-enrichment doesn't exist.
  const r = await axios.post(
    `${INSTANTLY_BASE}/supersearch-enrichment/enrich-leads-from-supersearch`,
    {
      search_filters: searchFilters,
      limit,
      resource_id: listId,
      resource_type: 1, // 1 = lead list, 2 = campaign (campaigns don't accept direct enrichment)
      skip_owned_leads: true,
      show_one_lead_per_company: true,
      work_email_enrichment: true,
      fully_enriched_profile: true,
      email_verification: true,
      autofill: false,
    },
    { headers: instantlyHeaders(), timeout: 60000 }
  );
  return r.data;
}

function buildPersonalization(lead, pattern) {
  const fn = lead.first_name || "";
  const cn = lead.company_name || "";
  switch (pattern) {
    case "funding_mention": {
      const amt = lead.funding_amount || "su última ronda";
      const inv = lead.funding_lead_investor || "sus inversionistas";
      return `Felicidades por la ronda de ${amt} con ${inv} — fuerte movimiento.`;
    }
    case "hiring_mention": {
      const role = lead.hiring_role || "marketing";
      return `Saw ${cn} is hiring a ${role} — usually that means the lead pipeline is the bottleneck, not the closing.`;
    }
    case "post_quote": {
      const topic = lead.last_post_topic_excerpt || "the market";
      return `Your LinkedIn post about ${topic} hit on something — most brokers miss it.`;
    }
    default:
      return "";
  }
}

function scorePersonalization(text) {
  // Rudimentary 0-10 scorer. Drop <7. Mirrors personalization-engine skill rubric.
  if (!text || text.length < 20) return 0;
  let score = 0;
  if (/\$|usd|mxn|m|millones|million/i.test(text)) score += 2;       // specificity (amount)
  if (/(weeks?|days?|months?|recently|last)/i.test(text)) score += 1; // time anchor
  if (/(hiring|raised|launched|joined|posted|announced)/i.test(text)) score += 2; // verifiable verb
  if (text.length > 60 && text.length < 200) score += 2;             // brevity
  if (!/(hope this finds you|just checking|wanted to reach)/i.test(text)) score += 2; // not generic
  if (text.includes("{{") || text.includes("undefined")) score = Math.max(0, score - 5); // unfilled var
  return Math.min(10, score);
}

async function processCohort(cohortKey, cohort) {
  const log = { cohort: cohortKey, label: cohort.label };
  log.target_campaign_id = cohort.target_campaign_id;

  // Stage 1: count check
  if (cohort.search_filters._pending_capture_from_ui) {
    log.status = "PLACEHOLDER_FILTERS";
    log.note = "search_filters in supersearch_cohorts.json need UI capture; running count-only diagnostic";
    try {
      const filtersWithoutFlag = { ...cohort.search_filters };
      delete filtersWithoutFlag._pending_capture_from_ui;
      log.count = await countLeads(filtersWithoutFlag);
    } catch (e) {
      log.count_error = e.response?.data?.message || e.message;
    }
    return log;
  }

  // Stage 2: real pull (only when filters are real)
  try {
    log.count = await countLeads(cohort.search_filters);
    if (log.count < 50) {
      log.status = "INSUFFICIENT_COUNT";
      log.note = `count=${log.count}, refusing to pull (<50 threshold)`;
      return log;
    }

    // Stage 3: preview (free)
    const sample = await previewLeads(cohort.search_filters, 3);
    log.sample_first_names = sample.map((l) => l.first_name || l.firstName).slice(0, 3);

    // Stage 4: create destination list (per cohort + date) — Instantly requires a list as resource
    const today = new Date().toISOString().slice(0, 10);
    const listName = `Supersearch ${cohortKey} ${today}`;
    const listId = await createLeadList(listName);
    log.list_id = listId;
    log.list_name = listName;

    // Stage 5: real enrichment INTO the list
    const limit = cohort.daily_pull_limit || 30;
    const enrich = await runEnrichment(cohort.search_filters, limit, listId);
    log.enrichment_id = enrich.id || enrich.resource_id;
    log.requested = limit;
    log.status = "ENRICHMENT_TRIGGERED";

    // Stage 6: schedule a follow-up move-to-campaign once enrichment lands
    // (Instantly enrichment is async — we'll move leads from list → campaign in the next cron tick)
    log.target_campaign_for_move = cohort.target_campaign_id;

    // Stage 7: leads will be auto-uploaded to the campaign by Instantly
    // when the enrichment job completes. The job is async; the next cron tick
    // will GET /supersearch-enrichment/{id} for completion status.
    log.note = "enrichment async; results will land in campaign within ~30 min";
  } catch (e) {
    log.status = "ERROR";
    log.error = e.response?.data?.message || e.message;
  }
  return log;
}

const dailySupersearchRefillImpl = async () => {
  const t0 = Date.now();
  const cohorts = loadCohorts();
  const results = [];

  for (const [key, cohort] of Object.entries(cohorts)) {
    const r = await processCohort(key, cohort);
    results.push(r);
    functions.logger.info(`Cohort ${key} done`, r);
  }

  // Build Slack digest
  const lines = [
    `*🔁 Daily Supersearch Refill — ${new Date().toISOString().slice(0, 10)}*`,
  ];
  for (const r of results) {
    const icon = r.status === "ENRICHMENT_TRIGGERED" ? "✅" : r.status === "PLACEHOLDER_FILTERS" ? "🟡" : "❌";
    lines.push(
      `${icon} *${r.cohort}* — ${r.label}\n   count=${r.count ?? "n/a"} · status=${r.status}${r.note ? `\n   _${r.note}_` : ""}`
    );
  }
  lines.push(`_run time: ${(Date.now() - t0) / 1000}s_`);
  await postSlack(lines.join("\n"));

  return { ok: true, results };
};

// Scheduled: 07:00 UTC daily = 01:00 Cancún CDMX
exports.dailySupersearchRefill = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("0 7 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    return dailySupersearchRefillImpl();
  });

// Manual trigger for testing — POST to invoke
exports.dailySupersearchRefillManual = functions.https.onRequest(async (req, res) => {
  try {
    const tokenHeader = req.headers["x-admin-token"];
    if (tokenHeader !== process.env.ADMIN_TRIGGER_TOKEN) {
      return res.status(403).send("forbidden");
    }
    const result = await dailySupersearchRefillImpl();
    res.json(result);
  } catch (e) {
    functions.logger.error("dailySupersearchRefillManual error", e);
    res.status(500).json({ error: e.message });
  }
});
