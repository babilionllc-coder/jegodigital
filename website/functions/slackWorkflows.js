/**
 * slackWorkflows.js — Cloud Function backends for Slack Workflow Builder
 *
 * Wires Slack Pro Workflow Builder shortcuts/slash commands to JegoDigital's
 * Cloud Functions infra. Each function below is the webhook target for one
 * Workflow Builder workflow.
 *
 * Workflows defined in /SLACK_WORKFLOWS.md:
 *   1. /onboard <client>  → onboardClient
 *   2. /lead <name>       → no backend (pure Slack workflow)
 *   3. /quote <client>    → generateQuote
 *   4. /end-day           → saveEndOfDay (optional Firestore persistence)
 *
 * Auth: SLACK_WORKFLOW_TOKEN env var (set as GH Secret + injected via deploy.yml).
 * Each request from Slack Workflow Builder must include this token in the
 * X-Slack-Workflow-Token header. Reject anything else with 401.
 *
 * Last updated: 2026-04-25 PM
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { slackPost } = require('./slackPost');

if (!admin.apps.length) admin.initializeApp();

function authorize(req) {
    const token = req.headers['x-slack-workflow-token'];
    return token && token === process.env.SLACK_WORKFLOW_TOKEN;
}

// ============================================================
// 1. onboardClient — fired by Workflow Builder /onboard shortcut
// ============================================================
exports.onboardClient = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }

        const {
            client_name,
            service_pack,
            monthly_mxn,
            start_date,
            primary_email,
            triggered_by_user,
        } = req.body || {};

        if (!client_name || !service_pack || !primary_email) {
            return res.status(400).json({ ok: false, error: "missing_required_fields" });
        }

        try {
            // 1. Save to Firestore
            const docRef = await admin.firestore().collection("clients").add({
                client_name,
                service_pack,
                monthly_mxn: Number(monthly_mxn || 0),
                start_date: start_date || null,
                primary_email,
                status: "onboarding",
                triggered_by_user: triggered_by_user || null,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 2. Post confirmation to #revenue
            await slackPost('revenue', {
                text: `🆕 New client onboarded — ${client_name}`,
                blocks: [
                    {
                        type: "header",
                        text: { type: "plain_text", text: `🆕 ${client_name} onboarded`, emoji: true },
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*Pack:* ${service_pack}\n*MRR:* $${monthly_mxn || 0} MXN\n*Start:* ${start_date || "TBD"}\n*Email:* ${primary_email}\n*Client ID:* \`${docRef.id}\``,
                        },
                    },
                    {
                        type: "context",
                        elements: [
                            { type: "mrkdwn", text: "_Next: create #client-{name} channel + send WhatsApp welcome + run /quote_" },
                        ],
                    },
                ],
            });

            return res.status(200).json({
                ok: true,
                client_id: docRef.id,
                client_name,
                next_steps: [
                    `Create channel #client-${client_name.toLowerCase().replace(/\s+/g, '-')} in Slack`,
                    "Send WhatsApp welcome message (template in your DM)",
                    `Run /quote ${client_name} to generate cotización`,
                    "Schedule kickoff call via Calendly",
                ],
            });
        } catch (err) {
            functions.logger.error("onboardClient failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// 2. generateQuote — fired by Workflow Builder /quote slash command
// ============================================================
//
// Stub for now. Full implementation triggers the jegodigital-cotizaciones
// skill via Cloud Run mockup-renderer pipeline. Returns the public PDF URL.
// ============================================================
exports.generateQuote = functions
    .runWith({ timeoutSeconds: 120, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }

        const { client_name, service_pack, triggered_by_user } = req.body || {};

        if (!client_name || !service_pack) {
            return res.status(400).json({ ok: false, error: "missing_fields" });
        }

        try {
            // TODO: actually invoke jegodigital-cotizaciones skill via Cloud Run
            // For now, log the request + return a placeholder URL
            const slug = client_name.toLowerCase().replace(/\s+/g, '-');
            const timestamp = Date.now();
            const placeholder_pdf_url = `https://jegodigital.com/cotizaciones/${slug}-${timestamp}.pdf`;

            await admin.firestore().collection("quote_requests").add({
                client_name,
                service_pack,
                triggered_by_user: triggered_by_user || null,
                placeholder_pdf_url,
                status: "queued",
                requested_at: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Post to #revenue
            await slackPost('revenue', {
                text: `📄 Cotización requested — ${client_name} (${service_pack})`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*📄 Cotización requested*\n*Client:* ${client_name}\n*Pack:* ${service_pack}\n*Status:* queued — full implementation pending`,
                        },
                    },
                    {
                        type: "context",
                        elements: [
                            { type: "mrkdwn", text: "_TODO: wire to jegodigital-cotizaciones skill — see SLACK_WORKFLOWS.md §5b._" },
                        ],
                    },
                ],
            });

            return res.status(200).json({
                ok: true,
                pdf_url: placeholder_pdf_url,
                client_name,
                service_pack,
                status: "queued — full implementation pending",
            });
        } catch (err) {
            functions.logger.error("generateQuote failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// 3. saveEndOfDay — fired by Workflow Builder /end-day or scheduled trigger
// ============================================================
exports.saveEndOfDay = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }

        const { date, big_rock_done, proof, tomorrow_rock } = req.body || {};

        if (!date) {
            return res.status(400).json({ ok: false, error: "missing_date" });
        }

        try {
            await admin.firestore().collection("end_of_day").doc(date).set({
                big_rock_done: !!big_rock_done,
                proof: proof || null,
                tomorrow_rock: tomorrow_rock || null,
                saved_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            return res.status(200).json({ ok: true, date, saved: true });
        } catch (err) {
            functions.logger.error("saveEndOfDay failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// 4. slackAudit — fired by Workflow Builder /audit <url>
// ============================================================
//
// Manual-trigger audit for a prospect's website. Different from the
// public /auditoria-gratis form which has consent flow — this is YOU
// running an audit for YOUR OWN sales process. PDF is emailed to
// jegoalexdigital@gmail.com (not the prospect). Per HR-0/disaster log
// 2026-04-23, never auto-email a prospect from a manual trigger —
// that crosses the consent line.
// ============================================================
exports.slackAudit = functions
    .runWith({ timeoutSeconds: 60, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        const { url, requested_by, prospect_company } = req.body || {};
        if (!url) {
            return res.status(400).json({ ok: false, error: "missing_url" });
        }

        try {
            // Queue the audit — submitAuditRequest pipeline picks it up
            const auditRef = await admin.firestore().collection("audit_requests").add({
                website_url: url,
                email: "jegoalexdigital@gmail.com", // PDF goes to Alex, NOT prospect
                name: prospect_company || "Manual Slack trigger",
                consent_verified: {
                    source: "slack_workflow_alex_internal",
                    evidence_id: requested_by || "slack_workflow",
                    verified_at: new Date().toISOString(),
                },
                source: "slack_audit_workflow",
                internal_only: true, // flag so audit pipeline knows not to send to prospect
                status: "queued",
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });

            await slackPost('daily-ops', {
                text: `🔍 Audit queued — ${url}`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*🔍 Manual audit triggered*\n*URL:* ${url}\n*For:* ${prospect_company || "internal use"}\n*Status:* queued — PDF lands in your inbox in ~60 minutes\n*Audit ID:* \`${auditRef.id}\``,
                        },
                    },
                    {
                        type: "context",
                        elements: [
                            { type: "mrkdwn", text: "_PDF emailed to jegoalexdigital@gmail.com only — NOT auto-sent to prospect (per HR-0 consent rule)._" },
                        ],
                    },
                ],
            });

            return res.status(200).json({
                ok: true,
                audit_id: auditRef.id,
                url,
                eta_minutes: 60,
                delivery: "email_to_alex",
            });
        } catch (err) {
            functions.logger.error("slackAudit failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// 5. setBigRock — fired by Workflow Builder /big-rock <text>
// ============================================================
//
// Per HR-8: 1 Big Rock per day. Sets today's rock, posts to #daily-ops,
// saves to Firestore for accountability. The /end-day workflow checks
// against this when asking "did you ship today's Big Rock?"
// ============================================================
exports.setBigRock = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        const { text, date, user, bucket } = req.body || {};
        if (!text) {
            return res.status(400).json({ ok: false, error: "missing_text" });
        }

        const dateKey = date || new Date().toISOString().slice(0, 10);

        try {
            await admin.firestore().collection("big_rocks").doc(dateKey).set({
                text,
                user: user || null,
                bucket: bucket || "B", // HR-3 default to bucket B (lead gen)
                set_at: admin.firestore.FieldValue.serverTimestamp(),
                shipped: false,
            }, { merge: true });

            await slackPost('daily-ops', {
                text: `🎯 Big Rock — ${dateKey}`,
                blocks: [
                    {
                        type: "header",
                        text: { type: "plain_text", text: `🎯 BIG ROCK — ${dateKey}`, emoji: true },
                    },
                    {
                        type: "section",
                        text: { type: "mrkdwn", text: `> ${text}\n\n*Bucket:* ${bucket || "B"} (per HR-3)` },
                    },
                    {
                        type: "context",
                        elements: [
                            { type: "mrkdwn", text: "_Per HR-8: 1 Big Rock per day. Ship by EOD or roll with explicit reason. /end-day will check at 8 PM Cancún._" },
                        ],
                    },
                ],
            });

            return res.status(200).json({ ok: true, date: dateKey, big_rock: text });
        } catch (err) {
            functions.logger.error("setBigRock failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// 6. generateClientReport — fired by Workflow Builder /report <client>
// ============================================================
//
// Triggers the client-reporting skill via webhook. Pulls live data from
// DataForSEO + Ahrefs + IG Graph + Brevo + Calendly for the named client.
// Returns a branded PDF URL and posts to the client's Slack channel.
// ============================================================
exports.generateClientReport = functions
    .runWith({ timeoutSeconds: 120, memory: "1GB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        const { client_name, period, requested_by } = req.body || {};
        if (!client_name) {
            return res.status(400).json({ ok: false, error: "missing_client_name" });
        }

        const periodKey = period || new Date().toISOString().slice(0, 7); // YYYY-MM
        const slug = client_name.toLowerCase().replace(/\s+/g, '-');
        const reportId = `${slug}-${periodKey}`;

        try {
            await admin.firestore().collection("client_reports").doc(reportId).set({
                client_name,
                period: periodKey,
                requested_by: requested_by || null,
                status: "queued",
                requested_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            // TODO: invoke client-reporting skill via Cloud Run pipeline
            // For now, queue the request — the actual generation is async
            const placeholder_pdf_url = `https://jegodigital.com/reports/${reportId}.pdf`;

            await slackPost('revenue', {
                text: `📊 Monthly report queued — ${client_name} (${periodKey})`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*📊 Client report*\n*Client:* ${client_name}\n*Period:* ${periodKey}\n*Status:* queued (~5 min generation time)\n*Report ID:* \`${reportId}\``,
                        },
                    },
                    {
                        type: "context",
                        elements: [
                            { type: "mrkdwn", text: "_TODO: wire client-reporting skill end-to-end. Currently queues request; skill execution pending._" },
                        ],
                    },
                ],
            });

            return res.status(200).json({
                ok: true,
                report_id: reportId,
                pdf_url: placeholder_pdf_url,
                eta_minutes: 5,
                status: "queued — full skill wiring pending",
            });
        } catch (err) {
            functions.logger.error("generateClientReport failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// 7. senderHealthCheck — fired by Workflow Builder /sender-health
// ============================================================
//
// Pulls live Instantly account warmup + status. Posts to #alerts only
// if anything is unhealthy; otherwise posts a clean summary to #daily-ops.
// ============================================================
const axios = require("axios");

exports.senderHealthCheck = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }

        try {
            const r = await axios.get(
                "https://api.instantly.ai/api/v2/accounts?limit=20",
                {
                    headers: { Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}` },
                    timeout: 10000,
                }
            );

            const accounts = r.data?.items || [];
            const summary = accounts.map(a => ({
                email: a.email,
                warmup_score: a.stat_warmup_score || 0,
                daily_limit: a.daily_limit || 0,
                ctd_status: a.tracking_domain_status || "?",
                status: a.status === 1 ? "active" : "inactive",
                healthy: (a.stat_warmup_score || 0) >= 90 && a.status === 1 && a.tracking_domain_status === "CTD_ACTIVE",
            }));

            const unhealthy = summary.filter(s => !s.healthy);
            const targetChannel = unhealthy.length > 0 ? 'alerts' : 'daily-ops';

            const blocks = [
                {
                    type: "header",
                    text: { type: "plain_text", text: `📬 Sender Health — ${summary.length} accounts`, emoji: true },
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: unhealthy.length > 0
                            ? `🚨 *${unhealthy.length} unhealthy* account(s) detected`
                            : `✅ All ${summary.length} accounts healthy`,
                    },
                },
                ...summary.map(s => ({
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `${s.healthy ? "🟢" : "🔴"} *${s.email}* · Warmup ${s.warmup_score}/100 · ${s.daily_limit}/day · CTD ${s.ctd_status} · ${s.status}`,
                    },
                })),
            ];

            await slackPost(targetChannel, { text: "Sender health snapshot", blocks });

            return res.status(200).json({
                ok: true,
                total: summary.length,
                healthy: summary.filter(s => s.healthy).length,
                unhealthy: unhealthy.length,
                accounts: summary,
            });
        } catch (err) {
            functions.logger.error("senderHealthCheck failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// 8. closedWon — fired by Workflow Builder /closed-won <client> <amount>
// ============================================================
//
// Single source of truth for MRR. Logs the deal, increments aggregate
// MRR counter, posts celebration to #revenue with progress vs $1M goal.
// ============================================================
exports.closedWon = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        const {
            client_name,
            monthly_mxn,
            service_pack,
            contract_term_months,
            requested_by,
        } = req.body || {};

        if (!client_name || !monthly_mxn) {
            return res.status(400).json({ ok: false, error: "missing_required_fields" });
        }

        const monthly = Number(monthly_mxn) || 0;
        const term = Number(contract_term_months) || 12;
        const ltv = monthly * term;

        try {
            // Save the deal
            const dealRef = await admin.firestore().collection("deals_won").add({
                client_name,
                monthly_mxn: monthly,
                service_pack: service_pack || "Custom",
                contract_term_months: term,
                ltv_mxn: ltv,
                requested_by: requested_by || null,
                won_at: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Update MRR aggregate
            const mrrDocRef = admin.firestore().collection("aggregates").doc("mrr");
            await mrrDocRef.set({
                current_mrr_mxn: admin.firestore.FieldValue.increment(monthly),
                total_clients_signed: admin.firestore.FieldValue.increment(1),
                last_won: admin.firestore.FieldValue.serverTimestamp(),
                last_client: client_name,
                last_amount: monthly,
            }, { merge: true });

            const mrrSnap = await mrrDocRef.get();
            const currentMrr = mrrSnap.data()?.current_mrr_mxn || monthly;
            const totalClients = mrrSnap.data()?.total_clients_signed || 1;
            const goalMrr = 1667000; // $1M USD/year ≈ $1.667M MXN/month
            const progressPct = ((currentMrr / goalMrr) * 100).toFixed(2);

            await slackPost('revenue', {
                text: `🎉 CLOSED WON — ${client_name} @ $${monthly.toLocaleString()} MXN/mo`,
                blocks: [
                    {
                        type: "header",
                        text: { type: "plain_text", text: `🎉 CLOSED WON — ${client_name}`, emoji: true },
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*Monthly:* $${monthly.toLocaleString()} MXN/mo\n*Pack:* ${service_pack || "Custom"}\n*Contract:* ${term} months\n*LTV:* $${ltv.toLocaleString()} MXN`,
                        },
                    },
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*Current MRR:* $${currentMrr.toLocaleString()} MXN/mo\n*Goal:* $${goalMrr.toLocaleString()} MXN/mo ($1M USD/yr)\n*Progress:* ${progressPct}%\n*Total clients:* ${totalClients}`,
                        },
                    },
                    {
                        type: "context",
                        elements: [
                            { type: "mrkdwn", text: `_Run /onboard ${client_name} next to spawn the client channel + canvas._` },
                        ],
                    },
                ],
            });

            return res.status(200).json({
                ok: true,
                deal_id: dealRef.id,
                current_mrr_mxn: currentMrr,
                total_clients: totalClients,
                progress_pct: progressPct,
                ltv_mxn: ltv,
            });
        } catch (err) {
            functions.logger.error("closedWon failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// === TIER 3+: CONTENT VELOCITY (5 workflows) ===
// ============================================================

// 9. /script <day> — get TikTok script on demand for any weekday
exports.scriptOnDemand = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { weekday, requested_by } = req.body || {};
        try {
            // Forward to existing dailyTiktokViralScriptOnDemand
            const adminToken = process.env.ADMIN_TRIGGER_TOKEN;
            const url = `https://us-central1-jegodigital-e02fb.cloudfunctions.net/dailyTiktokViralScriptOnDemand?token=${adminToken}${weekday ? '&weekday=' + weekday : ''}`;
            const r = await axios.get(url, { timeout: 50000, validateStatus: () => true });
            await slackPost('content', {
                text: `🎬 Script on-demand triggered (weekday=${weekday || 'auto'}) by ${requested_by || 'unknown'}`,
            });
            return res.status(200).json({ ok: true, upstream_status: r.status, weekday: weekday || 'auto' });
        } catch (err) {
            functions.logger.error("scriptOnDemand failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 10. /record-done <filename> — mark recording complete, kick off post-production
exports.recordDone = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { filename, format_name, requested_by } = req.body || {};
        if (!filename) return res.status(400).json({ ok: false, error: "missing_filename" });
        try {
            const recRef = await admin.firestore().collection("video_takes").add({
                filename,
                format_name: format_name || "auto",
                requested_by: requested_by || null,
                status: "queued_for_postprod",
                recorded_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await slackPost('content', {
                text: `📹 Recording done — ${filename}`,
                blocks: [
                    { type: "section", text: { type: "mrkdwn", text: `*📹 Take registered*\n*File:* \`${filename}\`\n*Format:* ${format_name || 'auto'}\n*Status:* queued for CapCut + caption burn + thumbnail\n*Take ID:* \`${recRef.id}\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: wire to alex-founder-video skill end-to-end (currently registers only)._" }] },
                ],
            });
            return res.status(200).json({ ok: true, take_id: recRef.id, status: "queued_for_postprod" });
        } catch (err) {
            functions.logger.error("recordDone failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 11. /ig-post <client> — trigger Instagram carousel generation
exports.igPostOnDemand = functions
    .runWith({ timeoutSeconds: 60, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { client_or_topic, post_type, requested_by } = req.body || {};
        try {
            const reqRef = await admin.firestore().collection("ig_post_requests").add({
                client_or_topic: client_or_topic || "auto-pick-best-case-study",
                post_type: post_type || "carousel",
                requested_by: requested_by || null,
                status: "queued",
                requested_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await slackPost('content', {
                text: `📸 IG post queued — ${client_or_topic || 'auto'} (${post_type || 'carousel'})`,
                blocks: [
                    { type: "section", text: { type: "mrkdwn", text: `*📸 IG post requested*\n*Client/topic:* ${client_or_topic || 'auto-pick'}\n*Type:* ${post_type || 'carousel'}\n*Status:* queued\n*Request ID:* \`${reqRef.id}\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: wire jegodigital-carousels skill via Cloud Run mockup-renderer for full PNG generation + instagram-publisher for autonomous post._" }] },
                ],
            });
            return res.status(200).json({ ok: true, request_id: reqRef.id });
        } catch (err) {
            functions.logger.error("igPostOnDemand failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 12. /blog <topic> <client> — trigger SEO blog post generation
exports.blogOnDemand = functions
    .runWith({ timeoutSeconds: 60, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { topic, client_name, target_kw, requested_by } = req.body || {};
        if (!topic) return res.status(400).json({ ok: false, error: "missing_topic" });
        try {
            const reqRef = await admin.firestore().collection("blog_requests").add({
                topic,
                client_name: client_name || "jegodigital",
                target_kw: target_kw || null,
                requested_by: requested_by || null,
                status: "queued",
                requested_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await slackPost('content', {
                text: `📝 Blog post queued — ${topic}`,
                blocks: [
                    { type: "section", text: { type: "mrkdwn", text: `*📝 Blog requested*\n*Topic:* ${topic}\n*For:* ${client_name || 'JegoDigital'}\n*Target KW:* ${target_kw || 'auto-research'}\n*Status:* queued\n*Request ID:* \`${reqRef.id}\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: wire seo-engine content pipeline (research → brief → write → optimize ≥80/100 → publish)._" }] },
                ],
            });
            return res.status(200).json({ ok: true, request_id: reqRef.id });
        } catch (err) {
            functions.logger.error("blogOnDemand failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 13. /clip-from-yt <url> — extract viral clips from a YouTube long-form
exports.clipFromYt = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { youtube_url, target_count, requested_by } = req.body || {};
        if (!youtube_url) return res.status(400).json({ ok: false, error: "missing_youtube_url" });
        try {
            const reqRef = await admin.firestore().collection("clip_requests").add({
                youtube_url,
                target_count: Number(target_count) || 3,
                requested_by: requested_by || null,
                status: "queued",
                requested_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await slackPost('content', {
                text: `🎬 Clip extraction queued — ${youtube_url}`,
                blocks: [
                    { type: "section", text: { type: "mrkdwn", text: `*🎬 Clip extraction*\n*Source:* ${youtube_url}\n*Target clips:* ${target_count || 3}\n*Status:* queued\n*Request ID:* \`${reqRef.id}\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: wire ffmpeg + Whisper transcription + viral-moment detection (Gemini scoring)._" }] },
                ],
            });
            return res.status(200).json({ ok: true, request_id: reqRef.id });
        } catch (err) {
            functions.logger.error("clipFromYt failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// === TIER 4: OPERATIONS (3 workflows) ===
// ============================================================

// 14. /cost — current GCP spend snapshot
exports.costSnapshot = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        try {
            // Forward to existing dailyGcpCostReportNow
            const r = await axios.get("https://us-central1-jegodigital-e02fb.cloudfunctions.net/dailyGcpCostReportNow", { timeout: 50000 });
            return res.status(200).json({ ok: true, billing: r.data?.billing || {}, hosting: r.data?.hosting || {} });
        } catch (err) {
            functions.logger.error("costSnapshot failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 15. /health — full system health check
exports.systemHealth = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        try {
            // Forward to existing envAuditNow
            const r = await axios.get("https://us-central1-jegodigital-e02fb.cloudfunctions.net/envAuditNow", { timeout: 50000 });
            return res.status(200).json({ ok: true, report: r.data?.report || {} });
        } catch (err) {
            functions.logger.error("systemHealth failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 16. /credit-check — all API credit balances
exports.creditCheck = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        try {
            const results = {};
            // ElevenLabs
            try {
                const r = await axios.get("https://api.elevenlabs.io/v1/user/subscription", {
                    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, timeout: 8000,
                });
                results.elevenlabs = {
                    used: r.data.character_count,
                    limit: r.data.character_limit,
                    pct: ((r.data.character_count / r.data.character_limit) * 100).toFixed(1),
                    tier: r.data.tier,
                };
            } catch (e) { results.elevenlabs = { error: e.message }; }
            // Brevo
            try {
                const r = await axios.get("https://api.brevo.com/v3/account", {
                    headers: { "api-key": process.env.BREVO_API_KEY }, timeout: 8000,
                });
                const plan = (r.data.plan || []).find(p => p.creditsType === "sendLimit") || {};
                results.brevo = { credits_left: plan.credits || 0, type: plan.type || "?" };
            } catch (e) { results.brevo = { error: e.message }; }
            // DataForSEO
            try {
                const r = await axios.get("https://api.dataforseo.com/v3/appendix/user_data", {
                    auth: { username: process.env.DATAFORSEO_LOGIN, password: process.env.DATAFORSEO_PASS },
                    timeout: 8000,
                });
                results.dataforseo = { balance_usd: r.data.tasks?.[0]?.result?.[0]?.money?.balance || 0 };
            } catch (e) { results.dataforseo = { error: e.message }; }
            // Twilio (balance is in account fetch)
            try {
                const r = await axios.get(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Balance.json`, {
                    auth: { username: process.env.TWILIO_ACCOUNT_SID, password: process.env.TWILIO_AUTH_TOKEN },
                    timeout: 8000,
                });
                results.twilio = { balance_usd: r.data.balance, currency: r.data.currency };
            } catch (e) { results.twilio = { error: e.message }; }

            const blocks = [
                { type: "header", text: { type: "plain_text", text: "💳 Credit balances", emoji: true } },
                ...Object.entries(results).map(([service, data]) => ({
                    type: "section",
                    text: { type: "mrkdwn", text: `*${service.toUpperCase()}*\n\`\`\`${JSON.stringify(data, null, 2)}\`\`\`` },
                })),
            ];
            await slackPost('alerts', { text: "Credit balance snapshot", blocks });

            return res.status(200).json({ ok: true, balances: results });
        } catch (err) {
            functions.logger.error("creditCheck failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// === TIER 5: AI AGENTS (3 workflows) ===
// ============================================================

// 17. /sofia <prompt> — test Sofia replies before they go live
exports.sofiaTest = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { prompt, agent_id, requested_by } = req.body || {};
        if (!prompt) return res.status(400).json({ ok: false, error: "missing_prompt" });
        try {
            const reqRef = await admin.firestore().collection("sofia_test_requests").add({
                prompt,
                agent_id: agent_id || "agent_4701kq0drd9pf9ebbqcv6b3bb2zw", // Free Audit (B) default
                requested_by: requested_by || null,
                status: "queued",
                requested_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await slackPost('daily-ops', {
                text: `🧪 Sofia test queued — "${prompt.slice(0, 60)}..."`,
                blocks: [
                    { type: "section", text: { type: "mrkdwn", text: `*🧪 Sofia test*\n*Prompt:* ${prompt}\n*Agent:* ${agent_id || 'B (Free Audit) — default'}\n*Status:* queued\n*Request ID:* \`${reqRef.id}\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: wire ElevenLabs Conversational AI text-only test endpoint (without burning a real call)._" }] },
                ],
            });
            return res.status(200).json({ ok: true, request_id: reqRef.id });
        } catch (err) {
            functions.logger.error("sofiaTest failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 18. /seo-audit <url> — detailed SEO+AEO audit via seo-engine
exports.seoAudit = functions
    .runWith({ timeoutSeconds: 60, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { url, requested_by } = req.body || {};
        if (!url) return res.status(400).json({ ok: false, error: "missing_url" });
        try {
            const reqRef = await admin.firestore().collection("seo_audit_requests").add({
                url, requested_by: requested_by || null, status: "queued",
                requested_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await slackPost('daily-ops', {
                text: `🔎 SEO audit queued — ${url}`,
                blocks: [
                    { type: "section", text: { type: "mrkdwn", text: `*🔎 SEO+AEO audit*\n*URL:* ${url}\n*Status:* queued\n*Request ID:* \`${reqRef.id}\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: wire seo-engine 12 SEO + 8 AEO checks. Returns 0-100 score + Antigravity prompts for fixes._" }] },
                ],
            });
            return res.status(200).json({ ok: true, request_id: reqRef.id });
        } catch (err) {
            functions.logger.error("seoAudit failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 19. /competitor <domain> — battlecard via DataForSEO + SerpAPI + Firecrawl
exports.competitorBattlecard = functions
    .runWith({ timeoutSeconds: 90, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { competitor_domain, our_domain, requested_by } = req.body || {};
        if (!competitor_domain) return res.status(400).json({ ok: false, error: "missing_competitor_domain" });
        try {
            const reqRef = await admin.firestore().collection("battlecards").add({
                competitor_domain,
                our_domain: our_domain || "jegodigital.com",
                requested_by: requested_by || null,
                status: "queued",
                requested_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await slackPost('daily-ops', {
                text: `⚔️ Battlecard queued — ${competitor_domain}`,
                blocks: [
                    { type: "section", text: { type: "mrkdwn", text: `*⚔️ Competitor battlecard*\n*vs:* ${competitor_domain}\n*Our:* ${our_domain || 'jegodigital.com'}\n*Status:* queued\n*Request ID:* \`${reqRef.id}\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: wire DataForSEO competitor analysis + Firecrawl page scrape + Perplexity synthesis. Returns top KWs gap, content gap, technical SEO comparison._" }] },
                ],
            });
            return res.status(200).json({ ok: true, request_id: reqRef.id });
        } catch (err) {
            functions.logger.error("competitorBattlecard failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// === TIER 6: SELF-MANAGEMENT (4 workflows) ===
// ============================================================

// 20. /win <text> — log a win for weekly review
exports.logWin = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { text, category, requested_by } = req.body || {};
        if (!text) return res.status(400).json({ ok: false, error: "missing_text" });
        try {
            await admin.firestore().collection("wins").add({
                text,
                category: category || "general",
                requested_by: requested_by || null,
                logged_at: admin.firestore.FieldValue.serverTimestamp(),
                week_key: getWeekKey(),
            });
            await slackPost('revenue', { text: `🏆 Win logged — ${text}` });
            return res.status(200).json({ ok: true, logged: true });
        } catch (err) {
            functions.logger.error("logWin failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 21. /disaster <text> — log a failed experiment per HR-10
exports.logDisaster = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { what_tried, why_failed, what_to_do_instead, tag, requested_by } = req.body || {};
        if (!what_tried) return res.status(400).json({ ok: false, error: "missing_what_tried" });
        try {
            const dateKey = new Date().toISOString().slice(0, 10);
            await admin.firestore().collection("disasters").add({
                date: dateKey,
                what_tried,
                why_failed: why_failed || null,
                what_to_do_instead: what_to_do_instead || null,
                tag: tag || "uncategorized",
                requested_by: requested_by || null,
                logged_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            // TODO: also append to /DISASTER_LOG.md via GitHub API for permanent record
            await slackPost('daily-ops', {
                text: `📓 Disaster logged — ${what_tried.slice(0, 60)}`,
                blocks: [
                    { type: "section", text: { type: "mrkdwn", text: `*📓 Disaster log entry*\n*What tried:* ${what_tried}\n*Why failed:* ${why_failed || '(pending)'}\n*Do instead:* ${what_to_do_instead || '(pending)'}\n*Tag:* \`${tag || 'uncategorized'}\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: also append to /DISASTER_LOG.md via GitHub Git Data API for permanent grep-able record (HR-10)._" }] },
                ],
            });
            return res.status(200).json({ ok: true, logged: true });
        } catch (err) {
            functions.logger.error("logDisaster failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 22. /morning-rock — autonomous Big Rock proposer
exports.morningRockProposer = functions
    .runWith({ timeoutSeconds: 60, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        try {
            const reqRef = await admin.firestore().collection("morning_rock_proposals").add({
                status: "queued",
                requested_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await slackPost('daily-ops', {
                text: `☀️ Morning Big Rock — proposing for today`,
                blocks: [
                    { type: "section", text: { type: "mrkdwn", text: `*☀️ Morning Rock Proposer*\n_Currently a stub — full implementation pulls last 7d metrics + identifies highest-leverage move + drafts Big Rock + reasoning._\n*Request ID:* \`${reqRef.id}\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: wire Gemini reasoning over last 7 days of revenue/pipeline/content metrics. Output: 1 proposed Big Rock + bucket + 1-line reason._" }] },
                ],
            });
            return res.status(200).json({ ok: true, request_id: reqRef.id });
        } catch (err) {
            functions.logger.error("morningRockProposer failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 23. /end-week — Friday 5 PM weekly review autopost
exports.endWeekReview = functions
    .runWith({ timeoutSeconds: 60, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        try {
            const weekKey = getWeekKey();
            // Pull week's wins
            const winsSnap = await admin.firestore().collection("wins")
                .where("week_key", "==", weekKey).get();
            const wins = winsSnap.docs.map(d => d.data().text);

            // Pull week's disasters
            const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - 7);
            const disastersSnap = await admin.firestore().collection("disasters")
                .where("logged_at", ">=", startOfWeek).get();
            const disasters = disastersSnap.docs.map(d => `${d.data().tag}: ${d.data().what_tried.slice(0, 60)}`);

            await slackPost('revenue', {
                text: `📅 Week ${weekKey} review`,
                blocks: [
                    { type: "header", text: { type: "plain_text", text: `📅 Week ${weekKey} Review`, emoji: true } },
                    { type: "section", text: { type: "mrkdwn", text: `*🏆 Wins (${wins.length})*\n${wins.length ? wins.map(w => `• ${w}`).join('\n') : '_No wins logged. Use /win to log them next week._'}` } },
                    { type: "section", text: { type: "mrkdwn", text: `*📓 Disasters (${disasters.length})*\n${disasters.length ? disasters.map(d => `• ${d}`).join('\n') : '_No disasters. Either great week or you forgot to /disaster log them._'}` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: also pull MRR delta, cold-email reply rate, calls connected, content posts shipped, then propose next week's Big Rocks._" }] },
                ],
            });

            return res.status(200).json({ ok: true, week_key: weekKey, wins: wins.length, disasters: disasters.length });
        } catch (err) {
            functions.logger.error("endWeekReview failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// === TIER 7: $1M-STREAM SPECIALS (2 workflows) ===
// ============================================================

// 24. /partner-onboard <agency> — white-label partner setup (Stream #4)
exports.partnerOnboard = functions
    .runWith({ timeoutSeconds: 60, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { agency_name, primary_email, monthly_mxn, white_label_tier, requested_by } = req.body || {};
        if (!agency_name || !primary_email) return res.status(400).json({ ok: false, error: "missing_required_fields" });
        try {
            const partnerRef = await admin.firestore().collection("white_label_partners").add({
                agency_name,
                primary_email,
                monthly_mxn: Number(monthly_mxn) || 40000, // default $40K MXN
                white_label_tier: white_label_tier || "Tier 1",
                requested_by: requested_by || null,
                status: "onboarding",
                license_token: `wl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await slackPost('revenue', {
                text: `🤝 White-label partner onboarded — ${agency_name}`,
                blocks: [
                    { type: "header", text: { type: "plain_text", text: `🤝 PARTNER — ${agency_name}`, emoji: true } },
                    { type: "section", text: { type: "mrkdwn", text: `*Tier:* ${white_label_tier || 'Tier 1'}\n*Monthly:* $${(Number(monthly_mxn) || 40000).toLocaleString()} MXN\n*Email:* ${primary_email}\n*Partner ID:* \`${partnerRef.id}\`\n*License token:* \`(saved in Firestore)\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_TODO: spawn #partner-{name} channel, generate white-label config (Sofia voice + branding tokens), Stripe subscription. Stream #4 → $200K MXN/mo at 5 partners._" }] },
                ],
            });
            return res.status(200).json({ ok: true, partner_id: partnerRef.id, license_token: "(saved in Firestore)" });
        } catch (err) {
            functions.logger.error("partnerOnboard failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// 25. /dev-contract <project> — start a developer contract (Stream #2)
exports.devContractStart = functions
    .runWith({ timeoutSeconds: 30, memory: "256MB" })
    .https.onRequest(async (req, res) => {
        if (!authorize(req)) return res.status(401).json({ ok: false });
        const { project_name, developer_name, project_value_mxn, scope_summary, requested_by } = req.body || {};
        if (!project_name || !developer_name) return res.status(400).json({ ok: false, error: "missing_required_fields" });
        try {
            const projectRef = await admin.firestore().collection("dev_contracts").add({
                project_name,
                developer_name,
                project_value_mxn: Number(project_value_mxn) || 0,
                scope_summary: scope_summary || null,
                requested_by: requested_by || null,
                status: "kickoff",
                created_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            await slackPost('revenue', {
                text: `🏗 Developer contract started — ${project_name}`,
                blocks: [
                    { type: "header", text: { type: "plain_text", text: `🏗 DEV CONTRACT — ${project_name}`, emoji: true } },
                    { type: "section", text: { type: "mrkdwn", text: `*Developer:* ${developer_name}\n*Value:* $${(Number(project_value_mxn) || 0).toLocaleString()} MXN\n*Scope:* ${scope_summary || '(pending)'}\n*Project ID:* \`${projectRef.id}\`` } },
                    { type: "context", elements: [{ type: "mrkdwn", text: "_Stream #2 of $1M plan: Mexican developers @ $80K-$200K MXN per project. Target: 3-4 active contracts at any time = $350K MXN/mo._" }] },
                ],
            });
            return res.status(200).json({ ok: true, project_id: projectRef.id });
        } catch (err) {
            functions.logger.error("devContractStart failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ============================================================
// === SHARED HELPERS ===
// ============================================================

function getWeekKey() {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil((((now - yearStart) / 86400000) + yearStart.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
