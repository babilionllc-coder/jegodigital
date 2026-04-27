#!/usr/bin/env node
/**
 * monitor_fb_batch.cjs — Live monitor + hot-lead auto-alerter for active FB Brokers batch.
 *
 * Runs in a loop while a batch is active:
 *   1. Polls /fbBrokerBatchStatus + /v1/convai/conversations every 30s
 *   2. For any call >30s with warm_transfer / hot signals in the summary,
 *      MANUALLY POSTs postCallWhatsAppFollowup (overrides classification quirks
 *      that are pending deploy)
 *   3. Tracks which conversation IDs already alerted in /tmp/monitor_seen.json
 *   4. Stops when batch state == "completed" / "aborted" / "auto_paused"
 *
 * Usage:  node tools/monitor_fb_batch.cjs   # runs until batch ends
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../website/functions/.env") });

const ELEVEN = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = "agent_7301kq5jxe0gf3vbmp92c974stzc";
const STATUS_URL = "https://us-central1-jegodigital-e02fb.cloudfunctions.net/fbBrokerBatchStatus";
const FOLLOWUP_URL = "https://us-central1-jegodigital-e02fb.cloudfunctions.net/postCallWhatsAppFollowup";
const SEEN_PATH = "/tmp/monitor_seen.json";
const POLL_S = 30;

const HOT_PATTERNS = /agreed.*(transfer|alex)|si.*alex|paso con alex|transfer.*director|interested|wants.*trial|prueba gratuit|wants.*more info|le gustaria.*pasar|le gustaría.*pasar|sí me interesa|si me interesa|conversion|convertirse|tripli.*lead|increase.*lead|si.*sí|claro que sí/i;
const DECLINE_PATTERNS = /declined|no me interesa|ya tengo|already have|sufficient|unable to commit|not interested|no estoy interesad|no gracias/i;

// Load lead lookup
const LEADS = JSON.parse(fs.readFileSync(path.join(__dirname, "../leads/fb_groups_2026-04-25/call_list_cleaned.json"), "utf8"));
const LEAD_BY_PHONE = Object.fromEntries(LEADS.map(l => [l.phone, l]));

// De-dup state
let seen = {};
try { seen = JSON.parse(fs.readFileSync(SEEN_PATH, "utf8")); } catch (e) { seen = {}; }
function saveSeen() { fs.writeFileSync(SEEN_PATH, JSON.stringify(seen, null, 2)); }

function getJSON(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers }, (res) => {
            let data = "";
            res.on("data", (c) => (data += c));
            res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve({ _raw: data, _status: res.statusCode }); }
            });
        });
        req.on("error", reject);
        req.setTimeout(15000, () => req.destroy(new Error("timeout")));
    });
}

function postJSON(url, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname,
            method: "POST",
            headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data, "utf8") },
        }, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => {
                try { resolve(JSON.parse(body)); } catch (e) { resolve({ _raw: body, _status: res.statusCode }); }
            });
        });
        req.on("error", reject);
        req.setTimeout(15000, () => req.destroy(new Error("timeout")));
        req.write(data);
        req.end();
    });
}

async function checkStatus() {
    return getJSON(STATUS_URL);
}

async function getRecentConvs() {
    return getJSON(
        `https://api.elevenlabs.io/v1/convai/conversations?agent_id=${AGENT_ID}&page_size=30`,
        { "xi-api-key": ELEVEN }
    );
}

async function getConvDetail(cid) {
    return getJSON(`https://api.elevenlabs.io/v1/convai/conversations/${cid}`, { "xi-api-key": ELEVEN });
}

async function fireHotLeadAlert(conv, lead) {
    const phone = conv.metadata?.phone_call?.external_number || lead?.phone;
    if (!phone) return { ok: false, error: "no phone" };

    const summary = conv.analysis?.transcript_summary || "";
    const dur = conv.metadata?.call_duration_secs || 0;

    return postJSON(FOLLOWUP_URL, {
        conversation_id: `auto_${conv.conversation_id}`,
        phone_number: phone,
        conversation_initiation_client_data: {
            dynamic_variables: {
                first_name: lead?.first_name || "",
                source_group: lead?.source_group || "",
                zone: lead?.zone || "Cancún",
            },
        },
        analysis: {
            transcript_summary: `[Auto-alert from monitor — call ${dur}s] ${summary.slice(0, 300)} — Send WhatsApp follow-up.`,
        },
    });
}

async function tick() {
    const ts = new Date().toISOString().slice(11, 19);
    let st;
    try { st = await checkStatus(); }
    catch (e) { console.log(`[${ts}] status fetch failed: ${e.message}`); return true; }

    if (!st.ok) { console.log(`[${ts}] status not ok:`, st); return true; }

    const fired = st.fired || 0;
    const total = st.total || 90;
    const state = st.state || "?";
    console.log(`[${ts}] state=${state}  fired=${fired}/${total}  ok=${st.successful || 0}  fail=${st.failed || 0}`);

    if (["completed", "aborted", "auto_paused"].includes(state)) {
        console.log(`[${ts}] terminal state — stopping monitor`);
        return false;
    }

    // Scan recent conversations for hot leads
    let convs;
    try { convs = await getRecentConvs(); }
    catch (e) { console.log(`  conv fetch failed: ${e.message}`); return true; }

    const list = convs?.conversations || [];
    const now = Math.floor(Date.now() / 1000);

    for (const c of list) {
        const cid = c.conversation_id;
        if (!cid) continue;
        const age = (now - (c.start_time_unix_secs || 0)) / 60;
        if (age > 35) continue; // only today's batch
        if (seen[cid]) continue;

        const dur = c.call_duration_secs || 0;
        if (dur < 30) {
            seen[cid] = "skipped_short";
            continue;
        }
        if (c.call_successful !== "success") {
            seen[cid] = "skipped_not_success";
            continue;
        }

        // Pull full detail to check summary
        const detail = await getConvDetail(cid);
        const summary = detail?.analysis?.transcript_summary || "";
        if (!summary) {
            // Not yet analyzed — try again next tick
            continue;
        }

        const phone = detail?.metadata?.phone_call?.external_number || "?";
        const lead = LEAD_BY_PHONE[phone];

        if (DECLINE_PATTERNS.test(summary)) {
            console.log(`  ❌ ${phone} (${dur}s) ${lead?.first_name || "?"} — declined, skip`);
            seen[cid] = "declined";
            continue;
        }

        if (HOT_PATTERNS.test(summary)) {
            console.log(`  🔥 HOT LEAD ${phone} (${dur}s) ${lead?.first_name || "?"} — firing alert!`);
            const r = await fireHotLeadAlert(detail, lead);
            if (r.ok && r.queued) {
                console.log(`     ✅ queued telegram_msg=${r.telegram_message_id} slack=${r.slack_sent}`);
                seen[cid] = `alerted_${Date.now()}`;
            } else {
                console.log(`     ⚠️  alert failed:`, r);
                seen[cid] = `alert_failed`;
            }
            saveSeen();
        } else {
            console.log(`  ○  ${phone} (${dur}s) ${lead?.first_name || "?"} — engaged but no clear hot signal`);
            seen[cid] = "engaged_neutral";
        }
    }

    saveSeen();
    return true;
}

const ONESHOT = process.argv.includes("--once");

(async () => {
    console.log(`Monitor starting — ${ONESHOT ? "one-shot" : `polling every ${POLL_S}s`}`);
    console.log(`Seen state: ${Object.keys(seen).length} convs already processed`);
    if (ONESHOT) {
        await tick();
    } else {
        while (true) {
            const cont = await tick();
            if (!cont) break;
            await new Promise((r) => setTimeout(r, POLL_S * 1000));
        }
    }
    console.log("Monitor stopped.");
})();
