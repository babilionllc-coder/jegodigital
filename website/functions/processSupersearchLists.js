/**
 * processSupersearchLists — second half of the Supersearch pipeline.
 *
 * The first half (dailySupersearchRefill.js) creates a "Supersearch <cohort> <date>"
 * lead list and triggers async enrichment INTO that list. Enrichment lands within
 * ~30 min. This function (scheduled 90 min after the refill) walks each new list,
 * builds {{personalization}} per lead via the cohort template, scores it 0-10,
 * drops anything below 7, updates the lead with the personalization variable, and
 * moves passing leads to the cohort's target campaign.
 *
 * Schedule: 08:30 UTC daily (= 02:30 Cancún CDMX) — 90 min after dailySupersearchRefill.
 *
 * This is the file the MASTER skill §7.4 has referenced for weeks but that never
 * existed. Without it, enriched leads sit in lead-lists forever and never land in
 * a campaign — the email sequence never fires. Built 2026-05-02.
 *
 * Per CLAUDE.md HR-1 + HR-6: every API call returns its result; no fabricated
 * counts. Per HR-0: leads with empty/missing signal data are dropped, never
 * hallucinated.
 */
const functions = require("firebase-functions");
const axios = require("axios");
const {
  buildPersonalization,
  scorePersonalization,
  instantlyHeaders,
  INSTANTLY_BASE,
  loadCohortsFile,
} = require("./dailySupersearchRefill");

const MIN_SCORE = 7;            // skill §6.3 — drop personalization scoring <7
const LOOKBACK_DAYS = 3;        // walk lists from the past N days

async function postSlack(text) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await axios.post(url, { text }, { timeout: 10000 });
  } catch (e) {
    functions.logger.error("Slack post failed", { error: e.message });
  }
}

/**
 * List all lead lists in the workspace. Returns array of {id, name, ...}.
 */
async function listAllLeadLists() {
  const all = [];
  let next = null;
  let page = 0;
  do {
    const params = { limit: 100 };
    if (next) params.starting_after = next;
    const r = await axios.get(`${INSTANTLY_BASE}/lead-lists`, {
      headers: instantlyHeaders(),
      params,
      timeout: 30000,
    });
    const items = r.data?.items || r.data?.data || [];
    all.push(...items);
    next = r.data?.next_starting_after || null;
    page += 1;
    if (page > 10) break; // safety
  } while (next);
  return all;
}

/**
 * Filter lists matching "Supersearch <cohort> YYYY-MM-DD" naming convention,
 * scoped to the past LOOKBACK_DAYS days.
 */
function filterSupersearchLists(lists, cohortKey) {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const re = new RegExp(`^Supersearch\\s+${cohortKey}\\s+(\\d{4}-\\d{2}-\\d{2})$`);
  return lists.filter((l) => {
    const m = (l.name || "").match(re);
    if (!m) return false;
    return m[1] >= cutoffStr;
  });
}

/**
 * List leads in a given lead-list. Paginated (Instantly v2 returns 100/page).
 */
async function listLeadsInList(listId) {
  const all = [];
  let next = null;
  let page = 0;
  do {
    const body = { list_id: listId, limit: 100 };
    if (next) body.starting_after = next;
    const r = await axios.post(`${INSTANTLY_BASE}/leads/list`, body, {
      headers: instantlyHeaders(),
      timeout: 30000,
    });
    const items = r.data?.items || [];
    all.push(...items);
    next = r.data?.next_starting_after || null;
    page += 1;
    if (page > 20) break; // safety: 2,000 leads per list ceiling
  } while (next);
  return all;
}

/**
 * Update a lead with the personalization variable. Instantly v2 stores
 * variables under `personalization` (top-level) or under `custom_variables`
 * — we set both for safety.
 */
async function updateLeadPersonalization(leadId, personalizationText) {
  try {
    const r = await axios.patch(
      `${INSTANTLY_BASE}/leads/${leadId}`,
      {
        personalization: personalizationText,
        custom_variables: { personalization: personalizationText },
      },
      { headers: instantlyHeaders(), timeout: 20000 }
    );
    return { ok: true, data: r.data };
  } catch (e) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}

/**
 * Move a single lead from list → campaign.
 */
async function moveLeadToCampaign(leadId, fromListId, toCampaignId) {
  try {
    const r = await axios.post(
      `${INSTANTLY_BASE}/leads/move`,
      {
        ids: [leadId],
        from_list_id: fromListId,
        to_campaign_id: toCampaignId,
      },
      { headers: instantlyHeaders(), timeout: 20000 }
    );
    return { ok: true, data: r.data };
  } catch (e) {
    return { ok: false, error: e.response?.data?.message || e.message };
  }
}

/**
 * Process a single Supersearch list for one cohort.
 * Returns counts: scanned, personalized, dropped_low_score, dropped_no_signal,
 *                 update_failed, moved, move_failed.
 */
async function processList(list, cohortKey, cohort) {
  const log = {
    list_id: list.id,
    list_name: list.name,
    cohort: cohortKey,
    scanned: 0,
    personalized: 0,
    dropped_low_score: 0,
    dropped_no_signal: 0,
    update_failed: 0,
    moved: 0,
    move_failed: 0,
    sample_scores: [],
  };

  let leads;
  try {
    leads = await listLeadsInList(list.id);
  } catch (e) {
    log.error = `list-fetch failed: ${e.response?.data?.message || e.message}`;
    return log;
  }
  log.scanned = leads.length;

  for (const lead of leads) {
    // Skip leads that already have personalization (re-run safety)
    if (lead.personalization && lead.personalization.length > 10) {
      continue;
    }

    // 1. Build personalization text from cohort template + lead enrichment
    const text = buildPersonalization(lead, cohort);
    if (!text || text.length < 20) {
      log.dropped_no_signal += 1;
      continue;
    }

    // 2. Score
    const score = scorePersonalization(text);
    log.sample_scores.push(score);
    if (score < MIN_SCORE) {
      log.dropped_low_score += 1;
      continue;
    }

    // 3. Update lead with personalization variable
    const upd = await updateLeadPersonalization(lead.id, text);
    if (!upd.ok) {
      log.update_failed += 1;
      functions.logger.warn(`update failed lead=${lead.id}`, { error: upd.error });
      continue;
    }
    log.personalized += 1;

    // 4. Move to target campaign
    const mv = await moveLeadToCampaign(lead.id, list.id, cohort.target_campaign_id);
    if (!mv.ok) {
      log.move_failed += 1;
      functions.logger.warn(`move failed lead=${lead.id}`, { error: mv.error });
      continue;
    }
    log.moved += 1;
  }

  // Summarize score distribution
  if (log.sample_scores.length) {
    const avg = log.sample_scores.reduce((s, x) => s + x, 0) / log.sample_scores.length;
    log.avg_score = Math.round(avg * 10) / 10;
  }
  delete log.sample_scores; // keep digest tight
  return log;
}

const processSupersearchListsImpl = async () => {
  const t0 = Date.now();
  const cohortsFile = loadCohortsFile();
  const cohorts = cohortsFile.cohorts;

  let allLists;
  try {
    allLists = await listAllLeadLists();
  } catch (e) {
    await postSlack(`❌ *Supersearch processor* — failed to list lead-lists: ${e.message}`);
    return { ok: false, error: e.message };
  }

  const results = [];
  for (const [key, cohort] of Object.entries(cohorts)) {
    const matchingLists = filterSupersearchLists(allLists, key);
    if (matchingLists.length === 0) {
      results.push({
        cohort: key,
        list_id: null,
        scanned: 0,
        moved: 0,
        note: "no matching lists in lookback window",
      });
      continue;
    }
    for (const list of matchingLists) {
      const r = await processList(list, key, cohort);
      results.push(r);
      functions.logger.info(`Processed ${list.name}`, r);
    }
  }

  // Slack digest
  const totalMoved = results.reduce((s, r) => s + (r.moved || 0), 0);
  const totalDroppedLow = results.reduce((s, r) => s + (r.dropped_low_score || 0), 0);
  const totalDroppedNoSig = results.reduce((s, r) => s + (r.dropped_no_signal || 0), 0);
  const totalScanned = results.reduce((s, r) => s + (r.scanned || 0), 0);

  const lines = [
    `*🎯 Supersearch List Processor — ${new Date().toISOString().slice(0, 10)}*`,
    `_Scanned ${totalScanned} enriched leads across ${results.length} list-cohorts_`,
    `_Moved to campaigns: *${totalMoved}* · Dropped low-score: ${totalDroppedLow} · Dropped no-signal: ${totalDroppedNoSig}_`,
    "",
  ];
  for (const r of results) {
    if (!r.list_id) {
      lines.push(`⏭️  *${r.cohort}* — _${r.note}_`);
      continue;
    }
    const icon = r.moved > 0 ? "✅" : r.scanned === 0 ? "⏳" : "🟠";
    lines.push(
      `${icon} *${r.cohort}* (${r.list_name}) — scanned=${r.scanned} · moved=${r.moved} · drop_low=${r.dropped_low_score} · drop_nosig=${r.dropped_no_signal} · avg_score=${r.avg_score ?? "n/a"}${r.error ? `\n   _ERROR: ${r.error}_` : ""}`
    );
  }
  lines.push(`_run time: ${(Date.now() - t0) / 1000}s_`);
  await postSlack(lines.join("\n"));

  return { ok: true, results, totals: { totalScanned, totalMoved, totalDroppedLow, totalDroppedNoSig } };
};

// Scheduled: 08:30 UTC daily = 02:30 Cancún CDMX (90 min after dailySupersearchRefill)
exports.processSupersearchLists = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("30 8 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    return processSupersearchListsImpl();
  });

// Manual trigger
exports.processSupersearchListsManual = functions.https.onRequest(async (req, res) => {
  try {
    if (req.headers["x-admin-token"] !== process.env.ADMIN_TRIGGER_TOKEN) {
      return res.status(403).send("forbidden");
    }
    const result = await processSupersearchListsImpl();
    res.json(result);
  } catch (e) {
    functions.logger.error("processSupersearchListsManual error", e);
    res.status(500).json({ error: e.message });
  }
});

// Re-export internals for testing
module.exports.processList = processList;
module.exports.filterSupersearchLists = filterSupersearchLists;
module.exports.listAllLeadLists = listAllLeadLists;
module.exports.processSupersearchListsImpl = processSupersearchListsImpl;
