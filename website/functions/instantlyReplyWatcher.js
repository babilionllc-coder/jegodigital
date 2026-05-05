/**
 * instantlyReplyWatcher — 5-min Unibox poller, auto-fires audits on positive replies.
 *
 * Closes the "Instantly active feed" gap identified by Alex on 2026-04-20:
 * systemHealthAudit already tracks campaign aggregate stats (bounce %, reply %),
 * but before this cron no automation watched INDIVIDUAL Unibox replies. So a
 * hand-raiser could ping "mándame info" on a Sunday and nothing fired for
 * 18 hours until Alex happened to open the tab.
 *
 * What this does:
 *   1. Every 5 minutes, pull recent Instantly replies via v2 API.
 *   2. Dedup against instantly_reply_activity Firestore collection.
 *   3. Classify sentiment with a lightweight Spanish/English rule set.
 *   4. If classified as POSITIVE and we have email + website: auto-fire
 *      an audit_requests doc with source="instantly_autofire" — the existing
 *      processAuditRequest pipeline picks it up and delivers in ~45min.
 *   5. Telegram-alert hot replies and anything the AI agent might have
 *      mishandled (positive reply but agent chose NEGATIVE, negative reply
 *      with no agent response, pricing questions, etc.).
 *
 * Design rule (per Alex 2026-04-20): NO approve-before-fire gate. The cron
 * logs everything to instantly_reply_activity; dailyDigest + autopilotReviewer
 * surface anomalies after the fact.
 *
 * Firestore shape:
 *   instantly_reply_activity/{replyId}   — per-reply ledger (dedup key)
 *   instantly_reply_summaries/{YYYY-MM-DD} — daily rollups
 *   audit_requests/{id}                  — audit queue (source=instantly_autofire)
 *
 * API reference:
 *   POST https://api.instantly.ai/api/v2/emails (filtered to replies via email_type="received")
 *   Headers: Authorization: Bearer ${INSTANTLY_API_KEY}
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const brevoNurture = require("./brevoNurture");
const notionLeadSync = require("./notionLeadSync");

// ---- Telegram ----
const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const r = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        if (r.data?.ok) return { ok: true };
        const r2 = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text,
        }, { timeout: 10000 });
        return { ok: !!r2.data?.ok };
    } catch (err) {
        functions.logger.error("instantlyReplyWatcher Telegram failed:", err.message);
        return { ok: false };
    }
}

// ---- Slack (added 2026-04-24 — Alex needs real-time Slack pings for every reply) ----
// Pattern borrowed from dailyRollupSlack.js. Falls back to Telegram if
// SLACK_WEBHOOK_URL isn't set so we never silently drop a reply alert.
async function sendSlack(text, blocks) {
    // 2026-04-25: routed to #leads-hot (warm replies) via slackPost helper.
    const { slackPost } = require('./slackPost');
    const payload = { text };
    if (blocks) payload.blocks = blocks;
    const result = await slackPost('leads-hot', payload);
    if (!result.ok) {
        functions.logger.error("instantlyReplyWatcher Slack send failed:", result.error || "unknown");
        return await sendTelegram(`[Slack failed] ${text}`);
    }
    return { ok: true, channel: result.channel, fallback_used: result.fallback_used };
}

// Build Slack Block Kit payload for a single reply — per-lead card
// with lead identity, their message, classification, action taken, Notion link.
function buildSlackReplyCard(ctx, outcome, body, subject, auditQueued, nurtureStarted, campaignName) {
    const outcomeEmoji = {
        positive: "🟢 POSITIVE",
        positive_with_objection: "💰 POSITIVE + OBJECTION (pricing)",
        question: "❓ QUESTION",
        tech_question: "🤖 TECH-CURIOUS QUESTION (qualified prospect)",
        referral: "↪️ REFERRAL (handed to colleague)",
        negative: "🔴 NEGATIVE",
        neutral: "⚪ NEUTRAL",
    }[outcome] || "⚪ UNKNOWN";

    const actionLine = outcome === "positive" && auditQueued
        ? "✅ Free audit auto-fired → will deliver in ~45 min"
        : outcome === "positive_with_objection"
            ? "⚠️ Pricing objection — Alex handles personally (NO auto-audit)"
            : outcome === "tech_question"
                ? "🤖 Tech-curious prospect — Alex respond personally on WhatsApp (high-intent)"
                : outcome === "referral"
                    ? "↪️ Referral — Alex spawn fresh outreach to forwarded contact (mention referrer name)"
                    : outcome === "question"
                        ? "👀 AI-agent answered their question — verify in Instantly Unibox"
                        : outcome === "positive"
                            ? "⚠️ Positive but no audit fired (missing email or website) — handle manually"
                            : outcome === "negative"
                                ? "🛑 Negative — unsubscribe handled, no further action"
                                : "— no automated action —";

    const preview = (body || "").slice(0, 400).replace(/\n{3,}/g, "\n\n");
    const firstLine = (body || "").split("\n").find((l) => l.trim())?.slice(0, 100) || "(no body)";

    return {
        text: `${outcomeEmoji} reply from ${ctx.firstName || ctx.email} (${ctx.company || "—"}): ${firstLine}`,
        blocks: [
            {
                type: "header",
                text: { type: "plain_text", text: `${outcomeEmoji} · New Instantly reply`, emoji: true },
            },
            {
                type: "section",
                fields: [
                    { type: "mrkdwn", text: `*Lead:*\n${ctx.firstName || "—"} ${ctx.company ? `· ${ctx.company}` : ""}` },
                    { type: "mrkdwn", text: `*Email:*\n\`${ctx.email || "unknown"}\`` },
                    { type: "mrkdwn", text: `*Website:*\n${ctx.website ? `<https://${ctx.website.replace(/^https?:\/\//, "")}|${ctx.website}>` : "—"}` },
                    { type: "mrkdwn", text: `*Campaign:*\n${campaignName || "—"}` },
                ],
            },
            {
                type: "section",
                text: { type: "mrkdwn", text: `*Subject:* ${subject ? `_${subject.slice(0, 120)}_` : "—"}` },
            },
            {
                type: "section",
                text: { type: "mrkdwn", text: `*What they wrote:*\n>>>${preview}` },
            },
            {
                type: "section",
                text: { type: "mrkdwn", text: `*Action taken:* ${actionLine}` },
            },
            {
                type: "context",
                elements: [
                    { type: "mrkdwn", text: `nurture: ${nurtureStarted ? "Brevo Track A started" : "—"} · instantlyReplyWatcher · ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC` },
                ],
            },
        ],
    };
}

// ---- Classifier ----
// Based on Cold Email Operations Playbook Iron Rule 11: positive reply = lead
// showed clear interest ("mándame info", "sí", "agéndame"), negative = clear
// rejection ("no gracias", "quítame", "unsubscribe"), else neutral.
//
// We deliberately err toward NEUTRAL when in doubt — autofire only on the
// clearest positives. Alex can promote a neutral to positive manually.
function classifyReply(bodyRaw) {
    if (!bodyRaw) return "neutral";
    const body = bodyRaw.toLowerCase().replace(/\s+/g, " ").trim();

    // Hard negatives first (avoid false-positive autofires)
    const negativeMarkers = [
        "no gracias", "no me interesa", "no estoy interesad",
        "quítame", "quitame", "remover", "remuévan", "remueve",
        "unsubscribe", "remove me", "not interested", "do not contact",
        "stop emailing", "no llamen", "no envien", "no mand",
        "please stop", "leave me alone", "bórr", "borra mi",
    ];
    if (negativeMarkers.some((m) => body.includes(m))) return "negative";

    // Referral detector — runs BEFORE objection so referral wins even if
    // body mentions price downstream. We want Alex to see these immediately.
    const referralMarkers = [
        "te paso el contacto", "te comparto el contacto", "te paso al",
        "habla con", "habla directamente con",
        "i'm not in charge", "im not in charge", "not the right person",
        "you should talk to", "talk to my", "please contact", "please reach out to",
        "directora comercial", "director comercial", "directora general",
        "director general", "no soy quien decide", "no soy la persona",
        "envíaselo a", "envialo a", "redirige a", "redirígelo a",
        "forward this to", "forward to my", "the right person is",
        "she handles", "he handles", "ella maneja", "él maneja",
    ];
    if (referralMarkers.some((m) => body.includes(m))) return "referral";

    // Explicit pricing/objection flags — route to Alex even if tone is positive
    const objectionMarkers = [
        "cuánto cuesta", "cuanto cuesta", "precio", "costo", "cost",
        "caro", "expensive", "presupuesto limitad", "tight budget",
    ];
    const hasObjection = objectionMarkers.some((m) => body.includes(m));

    // Strong positive (auto-fire territory)
    const strongPositive = [
        "sí me interesa", "si me interesa", "me interesa",
        "mándame", "mandame", "envíame", "enviame",
        "platiquemos", "agendemos", "agenda", "agéndame", "agendame",
        "llámame", "llamame", "call me",
        "dale", "adelante", "hazlo", "vamos", "perfecto",
        "i'm interested", "im interested", "interested",
        "send me", "send the", "please send", "tell me more",
        "sounds good", "let's talk", "lets talk",
        "book a call", "yes please", "yes, please",
        "sí por favor", "sí, por favor",
        "please explain", "explícame", "explicame",
        "suena bien", "me encant",
    ];
    const strong = strongPositive.some((m) => body.includes(m));

    // Short-positive detector — one or two-word affirmatives. Audit 2026-04-30
    // found "si" (Jorge mihome) + "Adelante" (Álvaro trustreal) buried as
    // neutral because previous classifier needed longer phrases. \b doesn't
    // reliably anchor before non-ASCII (í) so we use explicit end-anchor.
    const shortBody = body.replace(/^[>\s]+/, "").trim();
    const END = "(?:[\\s.,!?]|$)";
    const shortAffirmatives = [
        new RegExp("^s[íi]" + END),
        new RegExp("^yes" + END),
        new RegExp("^ok" + END),
        new RegExp("^okay" + END),
        new RegExp("^dale" + END),
        new RegExp("^adelante" + END),
        new RegExp("^vamos" + END),
        new RegExp("^perfecto" + END),
        new RegExp("^claro" + END),
        new RegExp("^correcto" + END),
        new RegExp("^sure" + END),
    ];
    const isShortAffirmative = shortBody.length <= 25 &&
        shortAffirmatives.some((re) => re.test(shortBody));

    if ((strong || isShortAffirmative) && hasObjection) return "positive_with_objection";
    if (strong || isShortAffirmative) return "positive";

    // Soft-positive (ask but not commit) — neutral by default. tech_question
    // is a separate high-intent signal (chatbot/AI/cómo funciona) so the
    // hot-alert path can ping Alex directly.
    if (/\?/.test(body) && /(info|qué|que|cómo|como|cuánto|cuanto|dónde|donde)/.test(body)) {
        const techCurious = /(chatbot|ai|inteligencia artificial|tecnologia|tecnología|how does it work|cómo funciona|como funciona|capacidad de respuesta|how deep|qué tan profunda)/.test(body);
        return techCurious ? "tech_question" : "question";
    }
    return "neutral";
}

// ---- Extract email + website from the lead Instantly returned ----
function extractLeadContext(email) {
    // Instantly v2 email object structure (as of 2026-04):
    //   { id, from_address_email, to_address_email, subject, body,
    //     campaign, lead_id, lead, timestamp, ... }
    const leadObj = email.lead || {};
    const leadEmail = email.from_address_email ||
        email.lead_email ||
        leadObj.email ||
        null;
    const website = leadObj.website || leadObj.domain ||
        leadObj.custom_variables?.website || null;
    const firstName = leadObj.first_name || leadObj.firstName ||
        leadObj.custom_variables?.firstName || "";
    const company = leadObj.company_name || leadObj.company ||
        leadObj.custom_variables?.companyName || "";
    // Phone — v2.3 WhatsApp-first: if we already have a phone from
    // lead-finder/Apify enrichment, the router uses it to trigger Alex's
    // personal WhatsApp ping (no Calendly fallback needed).
    const phone = leadObj.phone || leadObj.phone_number || leadObj.mobile ||
        leadObj.whatsapp || leadObj.custom_variables?.phone ||
        leadObj.custom_variables?.whatsapp || null;
    return { email: leadEmail, website, firstName, company, phone, leadObj };
}

// =====================================================================
// instantlyReplyWatcher — every 5 minutes
// =====================================================================
exports.instantlyReplyWatcher = functions
    .runWith({ timeoutSeconds: 180, memory: "512MB" })
    .pubsub.schedule("every 5 minutes")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();
        const INSTANTLY_KEY = process.env.INSTANTLY_API_KEY;
        if (!INSTANTLY_KEY) {
            functions.logger.warn("instantlyReplyWatcher: INSTANTLY_API_KEY not set, skipping.");
            return null;
        }

        // CDMX date for daily rollup
        const cdmxNow = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const dateKey = cdmxNow.toISOString().slice(0, 10);

        // Fetch the most recent 50 incoming replies. We over-fetch and dedup
        // against Firestore to catch anything we missed during a deploy gap.
        let emails = [];
        try {
            const r = await axios.get("https://api.instantly.ai/api/v2/emails", {
                headers: { Authorization: `Bearer ${INSTANTLY_KEY}` },
                params: { limit: 50, email_type: "received" },
                timeout: 20000,
            });
            emails = r.data?.items || r.data?.data || r.data || [];
            if (!Array.isArray(emails)) emails = [];
        } catch (err) {
            const msg = err.response?.data?.detail || err.response?.statusText || err.message;
            functions.logger.error("instantlyReplyWatcher: fetch failed:", msg);
            await sendTelegram(`⚠️ *instantlyReplyWatcher* — Instantly fetch failed: ${msg}`);
            return null;
        }

        if (emails.length === 0) {
            functions.logger.info("instantlyReplyWatcher: no new replies in window");
            return null;
        }

        let processed = 0, newReplies = 0, positives = 0, negatives = 0,
            neutrals = 0, questions = 0, auditsFired = 0, hotAlerts = 0;
        const hotLeads = [];
        const objectionLeads = [];

        for (const em of emails) {
            processed++;
            const replyId = em.id || em.email_id || em.uuid;
            if (!replyId) continue;

            // Dedup — atomic claim BEFORE any expensive ops to prevent the
            // "every-cron-tick re-routes the same reply" spam loop discovered
            // 2026-04-29 (ceo@fastoffice.mx got 6 identical replies in 27 min
            // because activityRef.set() at end of loop was failing/timing out
            // before write, leaving collection empty + dedup permanently broken).
            //
            // Fix: claim the slot immediately. If the function dies later, the
            // claim record blocks reprocessing on the next cron tick. The full
            // ledger payload is merged in at the end (see activityRef.set below).
            const activityRef = db.collection("instantly_reply_activity").doc(String(replyId));
            const existing = await activityRef.get();
            if (existing.exists) continue;

            try {
                await activityRef.set({
                    reply_id: replyId,
                    claimed_at: admin.firestore.FieldValue.serverTimestamp(),
                    status: "processing",
                }, { merge: true });
            } catch (err) {
                functions.logger.error(`dedup claim failed for ${replyId}:`, err.message);
                continue; // Don't process if we can't claim — would risk duplicate-send
            }

            newReplies++;
            const body = em.body || em.body_text || em.content || "";
            const subject = em.subject || "";
            const ctx = extractLeadContext(em);
            const outcome = classifyReply(body + "\n" + subject);

            if (outcome === "positive") positives++;
            else if (outcome === "negative") negatives++;
            else if (outcome === "question") questions++;
            else if (outcome === "tech_question") questions++;
            else if (outcome === "referral") positives++;  // referrals count as wins (lead handed off to right person)
            else if (outcome === "positive_with_objection") { positives++; objectionLeads.push(ctx); }
            else neutrals++;

            // Auto-fire audit on clean positives (not positive_with_objection — Alex handles those)
            let auditQueued = false;
            if (outcome === "positive" && ctx.email && ctx.website) {
                try {
                    await db.collection("audit_requests").add({
                        email: ctx.email,
                        website: ctx.website,
                        firstName: ctx.firstName || "",
                        company: ctx.company || "",
                        source: "instantly_autofire",
                        instantly_reply_id: replyId,
                        instantly_campaign_id: em.campaign || em.campaign_id || null,
                        reply_body_preview: body.slice(0, 500),
                        created_at: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    auditsFired++;
                    auditQueued = true;
                } catch (err) {
                    functions.logger.warn(`audit autofire failed for ${replyId}:`, err.message);
                }
            }

            // Start Brevo nurture Track A — fires on clean positive OR
            // positive_with_objection (objection handling is part of nurture).
            // Idempotent — startTrackA skips if already enrolled.
            //
            // Compliance gate (added 2026-05-05): route through complianceGate
            // (cold_email channel) before enrolling. Blocks opt-outs, closed-window
            // enrollments, disallowed countries, unhealthy senders. firstTouch=false
            // + userInitiated=true (lead replied to us first).
            let nurtureStarted = false;
            let nurtureBlocked = null;
            if ((outcome === "positive" || outcome === "positive_with_objection") && ctx.email) {
                try {
                    const { complianceGate } = require("./complianceGate");
                    const gate = await complianceGate(
                        {
                            to: ctx.email,
                            body: `[brevo_nurture_track_a_enroll] reply: ${(body || "").slice(0, 200)}`,
                            sender: "ariana@zennoenigmawire.com",
                            leadId: ctx.email,
                            userInitiated: true,
                            firstTouch: false,
                        },
                        "cold_email"
                    );
                    if (!gate.pass) {
                        nurtureBlocked = gate.reason;
                        functions.logger.warn(`brevo nurture BLOCKED for ${replyId} (${ctx.email}): ${gate.reason}`);
                    } else {
                        const n = await brevoNurture.startTrackA({
                            email: ctx.email,
                            firstName: ctx.firstName || "",
                            company: ctx.company || "",
                            campaignId: em.campaign || em.campaign_id || null,
                            replyId,
                            replyBody: body,
                            replyDate: em.timestamp_email || em.timestamp || em.created_at || null,
                        });
                        if (n.ok && !n.skipped) nurtureStarted = true;
                    }
                } catch (err) {
                    functions.logger.warn(`brevo nurture start failed for ${replyId}:`, err.message);
                }
            }

            // ====================================================================
            // CUSTOM ROUTER PERMANENTLY DISABLED 2026-04-29 PM (Alex directive)
            //
            // History:
            //   2026-04-28 ecea9c3 — first disable (in favor of Instantly's built-in
            //                        AI Reply Agent with per-campaign Guidance prompt)
            //   2026-04-29 a4ad1c2 — re-enabled as v2.2 (Calendly-first single-CTA)
            //   2026-04-29 PM      — re-enabled briefly as v2.3 (WhatsApp-first)
            //   2026-04-29 PM      — KILLED FOREVER. Reason: a v2 dedup bug shipped
            //                        6 identical replies to ceo@fastoffice.mx in 27 min
            //                        because activityRef.set() never wrote (timeout).
            //                        Even the v2.3 fix carried risk — too many code
            //                        paths, too many bugs (geo, lang, dedup, slots).
            //
            // GO-FORWARD: Instantly's native AI Reply Agent ("JegoDigital Agent",
            // configuration_type=2, autopilot, ID 019d368d-c8ad-7208-8c42-438f4cb16258)
            // handles ALL replies. Its Guidance prompt is the WhatsApp-first playbook.
            // The watcher still does (a) audit autofire on positives, (b) Brevo nurture
            // Track A start, (c) Notion CRM upsert, (d) Telegram hot-lead alerts —
            // but NEVER composes outbound replies. That's Instantly's job now.
            //
            // The instantlyReplyRouter.js module stays on disk as a backup we can
            // re-wire in seconds if Instantly's AI agent breaks — but it does not
            // run in production. No double-reply risk because this code path is
            // dead. activity log records "router_disabled" so Slack/Notion know.
            // ====================================================================
            const routedReplySentId = null;
            const routedReplyError = "custom_router_disabled_2026-04-29";
            const routedIntent = null;
            const routedGeo = null;

            // Hot-alert criteria — 2026-04-30 expanded after audit found Felix
            // (Mudafy, asking tech depth) + Eric (Evoke referral) buried as
            // neutrals. Now alerts on positive + positive_with_objection +
            // referral (Alex spawns fresh outreach to forwarded contact) +
            // tech_question (qualified prospect evaluating us).
            const HOT_OUTCOMES = new Set([
                "positive", "positive_with_objection", "referral", "tech_question",
            ]);
            if (HOT_OUTCOMES.has(outcome)) {
                hotLeads.push({
                    outcome,
                    email: ctx.email,
                    firstName: ctx.firstName,
                    company: ctx.company,
                    website: ctx.website,
                    preview: body.slice(0, 180),
                    auditQueued,
                });
                hotAlerts++;
            }

            // Ledger write — merge into the claim record from earlier
            await activityRef.set({
                reply_id: replyId,
                received_at: em.timestamp || em.created_at ||
                    admin.firestore.FieldValue.serverTimestamp(),
                from: ctx.email,
                firstName: ctx.firstName,
                company: ctx.company,
                website: ctx.website,
                campaign: em.campaign || em.campaign_id || null,
                subject: subject.slice(0, 200),
                body_preview: body.slice(0, 500),
                outcome,
                audit_queued: auditQueued,
                brevo_nurture_started: nurtureStarted,
                routed_reply_sent_id: routedReplySentId,
                routed_reply_error: routedReplyError,
                routed_intent: routedIntent,
                routed_geo: routedGeo,
                status: "processed",
                processed_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            // ---- Notion 🎯 Leads CRM upsert ----
            // Every reply = at minimum "warm" per Alex (2026-04-23). Positive
            // replies become "Hot + Positive Reply" in Notion; negatives
            // become "Dead + No Response"; neutrals/questions land as
            // "Warm + Contacted". Idempotent: upsertLead dedups by email and
            // preserves higher pipeline stages (won't downgrade Calendly
            // Booked back to Positive Reply just because a new reply landed).
            let notionSynced = false;
            if (ctx.email) {
                try {
                    const { status, temperature } = notionLeadSync.outcomeToStatus(outcome);
                    const campaignId = em.campaign || em.campaign_id || null;
                    const campaignName = notionLeadSync.INSTANTLY_CAMPAIGN_MAP[campaignId] ||
                        (campaignId ? `Instantly: ${String(campaignId).slice(0, 8)}` : null);
                    const notes = [
                        outcome === "positive_with_objection" ? "OBJECTION 💰" : null,
                        subject ? `Subject: ${subject.slice(0, 80)}` : null,
                        body ? `Reply: ${body.slice(0, 300)}` : null,
                    ].filter(Boolean).join(" · ");
                    const r = await notionLeadSync.upsertLead({
                        email: ctx.email,
                        firstName: ctx.firstName,
                        company: ctx.company,
                        website: ctx.website,
                        source: "Instantly Cold Email",
                        campaign: campaignName,
                        status,
                        temperature,
                        bucket: (outcome === "positive" || outcome === "positive_with_objection")
                            ? "A - Close this week"
                            : (outcome === "question" ? "B - Qualified lead" : "C - Convert"),
                        nextAction: outcome === "positive" && auditQueued
                            ? "Audit auto-fired — wait for delivery"
                            : (outcome === "positive_with_objection"
                                ? "Alex: respond personally (pricing objection)"
                                : (outcome === "question" ? "Answer their question" : null)),
                        notes: notes.slice(0, 1800),
                        lastTouch: new Date().toISOString().slice(0, 10),
                    });
                    notionSynced = r.ok;
                    if (!r.ok) {
                        functions.logger.warn(`notion upsert failed for ${ctx.email}: ${r.error}`);
                    }
                } catch (err) {
                    functions.logger.warn(`notion upsert threw for ${ctx.email}:`, err.message);
                }
            }
            // Record notion sync status on the ledger row for observability
            try {
                await activityRef.update({ notion_synced: notionSynced });
            } catch (_) { /* non-fatal */ }

            // ---- Per-reply Slack card (added 2026-04-24) ----
            // Alex demanded real-time Slack pings for every reply so nothing
            // sits in Unibox unseen (Susan/Shoreline waited 17 days for a
            // response because `instantlyReplyWatcher` was deployed 2026-04-20
            // — she replied April 5 and no Slack alert existed).
            // Fire on EVERY reply except pure neutrals that look like
            // auto-replies (OOO, "no longer at the company", etc.).
            const bodyLower = String(body).toLowerCase();
            const isAutoResponse = /out of office|fuera de la oficina|auto.?reply|respuesta autom|no longer with|ya no (forma parte|labora|trabaja)|desactivac|automatic reply/i.test(bodyLower);
            if (!isAutoResponse) {
                try {
                    const campaignId = em.campaign || em.campaign_id || null;
                    const campaignName = notionLeadSync.INSTANTLY_CAMPAIGN_MAP?.[campaignId] ||
                        (campaignId ? `Instantly: ${String(campaignId).slice(0, 8)}` : "—");
                    const card = buildSlackReplyCard(ctx, outcome, body, subject, auditQueued, nurtureStarted, campaignName);
                    await sendSlack(card.text, card.blocks);
                } catch (slackErr) {
                    functions.logger.warn(`Slack per-reply card failed for ${replyId}:`, slackErr.message);
                }
            }
        }

        // Daily rollup (merge — many runs per day)
        if (newReplies > 0) {
            await db.collection("instantly_reply_summaries").doc(dateKey).set({
                date: dateKey,
                total: admin.firestore.FieldValue.increment(newReplies),
                positive: admin.firestore.FieldValue.increment(positives),
                negative: admin.firestore.FieldValue.increment(negatives),
                question: admin.firestore.FieldValue.increment(questions),
                neutral: admin.firestore.FieldValue.increment(neutrals),
                audits_fired: admin.firestore.FieldValue.increment(auditsFired),
                last_run_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        // ---- Aggregate summary (Slack + Telegram) ----
        // Per-reply cards already fired above; this is the batch digest so
        // Alex gets a quick "what happened in this 5-min window" snapshot.
        if (hotAlerts > 0 || auditsFired > 0) {
            const lines = [
                `🔥 *Instantly replies* — ${newReplies} new this run`,
                `   Positive: *${positives}* · Questions: ${questions} · Negative: ${negatives} · Neutral: ${neutrals}`,
                `   Audits auto-fired: *${auditsFired}*`,
            ];
            if (hotLeads.length) {
                lines.push("", "_Hot replies this run:_");
                hotLeads.slice(0, 5).forEach((l) => {
                    const tag = l.outcome === "positive_with_objection" ? "💰 OBJECTION" :
                        l.auditQueued ? "✅ audit fired" : "👀 needs Alex";
                    lines.push(`   • ${l.firstName || l.email} (${l.company || "—"}) — ${tag}`);
                    lines.push(`     _"${l.preview}"_`);
                });
            }
            if (objectionLeads.length) {
                lines.push("", `_${objectionLeads.length} replies mentioned pricing — handle personally._`);
            }
            const summaryText = lines.join("\n");
            // Slack primary (Alex's preferred surface), Telegram backup
            await sendSlack(summaryText);
            await sendTelegram(summaryText);
        }

        functions.logger.info(
            `instantlyReplyWatcher: processed=${processed} new=${newReplies} ` +
            `pos=${positives} neg=${negatives} q=${questions} audits=${auditsFired}`
        );
        return null;
    });
