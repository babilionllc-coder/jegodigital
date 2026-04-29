/**
 * onDisasterLogged — Firestore trigger that posts to #errors on every new
 * disaster_log entry.
 *
 * WHY:
 *   DISASTER_LOG.md is the markdown system of record for failures (HR-10),
 *   but live Firestore writes to `disaster_log/{id}` should ping Slack
 *   instantly so Alex sees fresh fires on his phone without polling.
 *
 * Document shape (loose — mirror of the markdown blocks):
 *   {
 *     title: string,           // human one-liner
 *     what_tried: string,
 *     why_failed: string,
 *     what_to_do_instead: string,
 *     tag: string,             // cold-email | cold-call | deploy | seo | content | ig | lead-gen | infra
 *     severity: "info" | "warn" | "critical",   // optional
 *     created_at: Firestore.Timestamp,
 *   }
 *
 * Posts to logical channel `errors` (env: SLACK_CHANNEL_ERRORS), with
 * graceful fallback to `alerts` if SLACK_CHANNEL_ERRORS not set, then to
 * the firehose webhook.
 *
 * Last updated: 2026-04-29 (initial ship — Phase 1 Slack command center).
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { slackPost } = require("./slackPost");

if (!admin.apps.length) admin.initializeApp();

function severityEmoji(sev) {
    if (sev === "critical") return "🔴";
    if (sev === "warn") return "🟡";
    return "🚨";
}

exports.onDisasterLogged = functions
    .runWith({ timeoutSeconds: 60, memory: "256MB" })
    .firestore.document("disaster_log/{id}")
    .onCreate(async (snap, ctx) => {
        const d = snap.data() || {};
        const title = (d.title || "(no title)").slice(0, 200);
        const tag = d.tag || "untagged";
        const sev = d.severity || "warn";
        const what = (d.what_tried || "").slice(0, 400);
        const why = (d.why_failed || "").slice(0, 400);
        const fix = (d.what_to_do_instead || "").slice(0, 400);

        const blocks = [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: `${severityEmoji(sev)} Disaster logged — ${title.slice(0, 70)}`,
                    emoji: true,
                },
            },
            {
                type: "context",
                elements: [{ type: "mrkdwn", text: `\`${tag}\` · severity *${sev}* · doc \`${ctx.params.id}\`` }],
            },
        ];
        if (what) blocks.push({ type: "section", text: { type: "mrkdwn", text: `*What I tried:*\n${what}` } });
        if (why) blocks.push({ type: "section", text: { type: "mrkdwn", text: `*Why it failed:*\n${why}` } });
        if (fix) blocks.push({ type: "section", text: { type: "mrkdwn", text: `*What to do instead:*\n${fix}` } });
        blocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: "_HR-10: also append to /DISASTER_LOG.md and grep before retrying._" }],
        });

        // Try `errors` first, fall back to `alerts` (slackPost handles the
        // webhook fallback after that automatically).
        let result = await slackPost("errors", { text: `🚨 Disaster: ${title}`, blocks });
        if (!result.ok) {
            result = await slackPost("alerts", { text: `🚨 Disaster (errors channel down): ${title}`, blocks });
        }
        functions.logger.info("onDisasterLogged posted:", { id: ctx.params.id, ok: result.ok, channel: result.channel });
        return result;
    });
