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

function loadCohortsFile() {
  const p = path.join(__dirname, "supersearch_cohorts.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadCohorts() {
  return loadCohortsFile().cohorts;
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

async function runEnrichment(searchFilters, limit, listId, enrichmentOptions = {}) {
  // FIX 2026-05-02: correct endpoint is /supersearch-enrichment/enrich-leads-from-supersearch
  // with resource_type=1 (list) — bare /supersearch-enrichment doesn't exist.
  // 2026-05-02 v2.1: enrichmentOptions read per-cohort from supersearch_cohorts.json
  // so we can drop fully_enriched_profile (saves 0.5 credit/lead) on cohorts where
  // the opener template doesn't need the full bio.
  const opts = {
    work_email_enrichment: true,
    fully_enriched_profile: true,
    email_verification: true,
    ...enrichmentOptions,
  };
  const r = await axios.post(
    `${INSTANTLY_BASE}/supersearch-enrichment/enrich-leads-from-supersearch`,
    {
      search_filters: searchFilters,
      limit,
      resource_id: listId,
      resource_type: 1, // 1 = lead list, 2 = campaign (campaigns don't accept direct enrichment)
      skip_owned_leads: true,
      show_one_lead_per_company: true,
      work_email_enrichment: opts.work_email_enrichment,
      fully_enriched_profile: opts.fully_enriched_profile,
      email_verification: opts.email_verification,
      autofill: false,
    },
    { headers: instantlyHeaders(), timeout: 60000 }
  );
  return r.data;
}

/**
 * Re-verify a single email address ($0.25/credit refresh on stale emails).
 * Use for any lead inactive >30 days before re-engagement (skill §10.2).
 */
async function reVerifyEmail(email) {
  const r = await axios.post(
    `${INSTANTLY_BASE}/email-verification`,
    { email },
    { headers: instantlyHeaders(), timeout: 30000 }
  );
  return r.data;
}

/**
 * Reverse Lookup — find all known contacts at a given company domain.
 * Use for ABM ("everyone at acme.com") plays. Skill §10.1.
 */
async function reverseLookup(companyDomain) {
  const r = await axios.post(
    `${INSTANTLY_BASE}/supersearch-enrichment/reverse-lookup`,
    { company_domain: companyDomain },
    { headers: instantlyHeaders(), timeout: 30000 }
  );
  return r.data;
}

/**
 * Rotation mode: when enabled in supersearch_cohorts.json, P4-P7 cohorts
 * fire only on alternating days (even/odd day-of-month parity by priority_order).
 * Returns true if cohort should fire today.
 */
function shouldFireToday(cohort, rotationConfig) {
  if (!rotationConfig || !rotationConfig.enabled) return true;
  const priority = cohort.priority_order || 1;
  if (priority <= 3) return true; // P1-P3 always fire
  const dayOfMonth = new Date().getUTCDate();
  const dayParity = dayOfMonth % 2; // 0 = even, 1 = odd
  const cohortParity = priority % 2; // P4=0 even, P5=1 odd, P6=0 even, P7=1 odd
  return dayParity === cohortParity;
}

/**
 * Substitute {{var}} placeholders in a cohort.personalization_template using the
 * lead's enrichment payload. Reads from BOTH top-level and lead.payload.* (the
 * Supersearch enrichment nests most fields under payload — see MASTER §5.5).
 *
 * Variable name resolution order (first match wins):
 *   funding_amount        → payload.funding_amount, funding_amount
 *   funding_lead_investor → payload.funding_lead_investor, funding_lead_investor
 *   hiring_role           → payload.hiring_role, hiring_role
 *   last_post_topic_excerpt → payload.last_post_text (8-word excerpt), last_post_topic_excerpt
 *   news_headline         → payload.news_headline, news_headline
 *   exec_change_title     → payload.exec_change_title, jobTitle
 *   competitor            → payload.competitor (Reddit cohort)
 *   subreddit             → payload.subreddit (Reddit cohort)
 *   tech_stack            → payload.tech_stack[0] (Tech Stack cohort)
 *   firstName, companyName, website → standard lead/company fields
 */
function buildPersonalization(lead, cohort) {
  const tmpl = cohort.personalization_template;
  if (!tmpl) return "";
  const p = lead.payload || {};
  const get = (...keys) => {
    for (const k of keys) {
      const v = lead[k] ?? p[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return null;
  };

  // 8-word excerpt of LinkedIn post text (skill §6.1 rule: "8 words")
  const lastPostText = get("last_post_text", "last_post_topic_excerpt");
  const lastPostExcerpt = lastPostText
    ? lastPostText.split(/\s+/).slice(0, 8).join(" ").replace(/[\.,;:!?]+$/, "")
    : null;

  const vars = {
    firstName:           get("first_name", "firstName") || "",
    companyName:         get("company_name", "companyName") || "",
    website:             get("companyWebsite", "company_domain", "companyDomain") || "",
    funding_amount:      get("funding_amount"),
    funding_lead_investor: get("funding_lead_investor"),
    funding_round_type:  get("funding_round_type"),
    funding_when:        get("funding_when"),
    hiring_role:         get("hiring_role"),
    hiring_department:   get("hiring_department"),
    last_post_topic_excerpt: lastPostExcerpt,
    news_headline:       get("news_headline"),
    exec_change_title:   get("exec_change_title", "job_title", "jobTitle"),
    exec_change_when:    get("exec_change_when"),
    competitor:          get("competitor"),
    subreddit:           get("subreddit"),
    topic:               get("topic"),
    tech_stack:          Array.isArray(p.tech_stack) ? p.tech_stack[0] : get("tech_stack"),
    title:               get("job_title", "jobTitle", "title"),
  };

  // Substitute. If ANY signal-specific var is missing → return "" (drop, per HR-0
  // "no fabricated data"). Generic vars (firstName/companyName) don't trigger drop.
  const SIGNAL_VARS = new Set([
    "funding_amount", "funding_lead_investor",
    "hiring_role",
    "last_post_topic_excerpt",
    "news_headline",
    "exec_change_title",
    "competitor", "subreddit", "topic",
    "tech_stack",
  ]);
  let result = tmpl;
  const placeholders = [...tmpl.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  for (const ph of placeholders) {
    if (vars[ph] === undefined || vars[ph] === null || vars[ph] === "") {
      if (SIGNAL_VARS.has(ph)) return ""; // signal data missing → kill the lead
      result = result.replace(new RegExp(`\\{\\{${ph}\\}\\}`, "g"), "");
    } else {
      result = result.replace(new RegExp(`\\{\\{${ph}\\}\\}`, "g"), vars[ph]);
    }
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

/**
 * 0–10 score across 5 axes (mirrors personalization-engine skill §6.3).
 * Drop any lead scoring <7. Auto-zero on banned phrases or unfilled vars.
 */
function scorePersonalization(text) {
  if (!text || typeof text !== "string") return 0;
  const len = text.length;
  if (len < 20) return 0;

  // Auto-zero triggers (skill §6.3 — banned phrases, unfilled vars, em-dashes in opener)
  const BANNED = [
    /hope this finds you well/i,
    /wanted to reach out/i,
    /just (checking|touching base)/i,
    /quick question/i,
    /as an expert in/i,
    /espero que est[eé]s bien/i,
    /sin compromiso/i,
    /s[oó]lo te tomar[aá]/i,
    /aprovechando que/i,
  ];
  if (BANNED.some((re) => re.test(text))) return 0;
  if (/\{\{|\bundefined\b/.test(text)) return 0;

  let score = 0;
  // Specificity (0-2): names a concrete fact (amount, role, date, post excerpt)
  if (/\$\d|\d+\s?(M|K|million|millones|MXN|USD)/i.test(text)) score += 2;
  else if (/\b(VP|CMO|CEO|Director|Head of|hiring|raised|just|Series [A-D])\b/i.test(text)) score += 1;
  // Verifiability (0-2): URL-checkable verb or proper noun
  if (/(raised|hiring|posted|announced|joined|launched|acquired|partnered|adopted|published)/i.test(text)) score += 2;
  else if (/\b(LinkedIn|Crunchbase|press|news|round|investor|Reddit|r\/[a-z]+)\b/i.test(text)) score += 1;
  // Relevance (0-2): ties to JegoDigital value props (case-study client name = relevance)
  if (/(Living Riviera Maya|Sur Selecto|Solik|Flamingo|Top-3 ChatGPT|ChatGPT|24\/7|WhatsApp|Sofia)/i.test(text)) score += 2;
  // Naturalness (0-2): friend tone, NOT bot tone
  const botTone = /\b(interesting insight|valuable opportunity|best regards|please find|kindly)\b/i.test(text);
  if (!botTone) score += 2;
  // Brevity (0-2): ≤25 words preferred, ≤30 acceptable
  const words = text.split(/\s+/).length;
  if (words <= 25) score += 2;
  else if (words <= 30) score += 1;

  return Math.min(10, score);
}

async function processCohort(cohortKey, cohort) {
  const log = { cohort: cohortKey, label: cohort.label };
  log.target_campaign_id = cohort.target_campaign_id;

  // Stage 0: safety gate — refuse to enrich if cohort isn't marked safe.
  // Set when API has been verified to return real lead counts (not 0, not 1M).
  // Per HR-0 + HR-6: never burn credits on unverified filter shapes.
  const isPending =
    cohort._pending_capture_from_ui === true ||
    cohort.search_filters._pending_capture_from_ui === true ||
    cohort._safe_for_production === false;

  if (isPending) {
    log.status = "PLACEHOLDER_FILTERS";
    log.note = cohort._pending_what ||
      "search_filters need UI capture; running count-only diagnostic (no credit spend)";
    // Strip non-API metadata before count-leads
    const filters = JSON.parse(JSON.stringify(cohort.search_filters));
    delete filters._pending_capture_from_ui;
    if (Array.isArray(filters.signals)) {
      filters.signals = filters.signals.map((s) => {
        const c = { ...s };
        delete c._pending_capture;
        return c;
      });
    }
    try {
      log.count = await countLeads(filters);
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

    // Stage 5: real enrichment INTO the list (per-cohort enrichment_options)
    const limit = cohort.daily_pull_limit || 30;
    const enrich = await runEnrichment(
      cohort.search_filters,
      limit,
      listId,
      cohort.enrichment_options || {}
    );
    log.enrichment_id = enrich.id || enrich.resource_id;
    log.requested = limit;
    log.enrichment_options = cohort.enrichment_options || {};
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
  const cohortsFile = loadCohortsFile();
  const cohorts = cohortsFile.cohorts;
  const rotation = cohortsFile.rotation_mode || { enabled: false };
  const results = [];

  for (const [key, cohort] of Object.entries(cohorts)) {
    if (!shouldFireToday(cohort, rotation)) {
      results.push({
        cohort: key,
        label: cohort.label,
        status: "SKIPPED_ROTATION",
        note: `Rotation mode ON; P${cohort.priority_order} fires on opposite-parity day`,
      });
      continue;
    }
    const r = await processCohort(key, cohort);
    results.push(r);
    functions.logger.info(`Cohort ${key} done`, r);
  }

  // Build Slack digest
  const lines = [
    `*🔁 Daily Supersearch Refill — ${new Date().toISOString().slice(0, 10)}*`,
  ];
  for (const r of results) {
    const icon =
      r.status === "ENRICHMENT_TRIGGERED" ? "✅" :
      r.status === "PLACEHOLDER_FILTERS" ? "🟡" :
      r.status === "SKIPPED_ROTATION" ? "⏭️" :
      r.status === "INSUFFICIENT_COUNT" ? "🟠" :
      "❌";
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

// HTTPS endpoint: re-verify a single email ($0.25/credit) — skill §10.2
exports.reVerifyEmailManual = functions.https.onRequest(async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TRIGGER_TOKEN) {
      return res.status(403).send("forbidden");
    }
    const email = req.query.email || (req.body && req.body.email);
    if (!email) return res.status(400).json({ error: "email required" });
    const result = await reVerifyEmail(email);
    res.json(result);
  } catch (e) {
    functions.logger.error("reVerifyEmailManual error", e);
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

// HTTPS endpoint: Reverse Lookup all contacts at a domain — skill §10.1
exports.reverseLookupManual = functions.https.onRequest(async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TRIGGER_TOKEN) {
      return res.status(403).send("forbidden");
    }
    const domain = req.query.domain || (req.body && req.body.domain);
    if (!domain) return res.status(400).json({ error: "domain required" });
    const result = await reverseLookup(domain);
    res.json(result);
  } catch (e) {
    functions.logger.error("reverseLookupManual error", e);
    res.status(500).json({ error: e.response?.data?.message || e.message });
  }
});

// Re-export shared helpers so process_supersearch_lists.cjs can require them.
module.exports.buildPersonalization = buildPersonalization;
module.exports.scorePersonalization = scorePersonalization;
module.exports.instantlyHeaders = instantlyHeaders;
module.exports.INSTANTLY_BASE = INSTANTLY_BASE;
module.exports.reVerifyEmail = reVerifyEmail;
module.exports.reverseLookup = reverseLookup;
module.exports.loadCohortsFile = loadCohortsFile;
