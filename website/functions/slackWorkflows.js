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
