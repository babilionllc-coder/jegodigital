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
