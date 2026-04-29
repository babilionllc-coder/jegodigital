/**
 * slackPost — channel-routed Slack publisher.
 *
 * Replaces the firehose pattern of every Cloud Function POSTing to the single
 * SLACK_WEBHOOK_URL (locked to #all-jegodigital) with explicit channel routing
 * via chat.postMessage + SLACK_BOT_TOKEN.
 *
 * Channels (env-resolved at call time):
 *   alerts        → only when something's broken (mobile push ON)
 *   leads-hot     → warm replies / Calendly / Sofia / audits (mobile push ON)
 *   revenue       → MRR, proposals, weekly review
 *   daily-ops     → morning + evening briefs, digests
 *   content       → Money Machine Reddit drafts, daily script
 *   cold-call-log → every dial + outcome
 *   all           → legacy fallback to #all-jegodigital
 *
 * Usage:
 *   const { slackPost } = require('./slackPost');
 *   await slackPost('alerts', { text: ':red_circle: Pixel broken', blocks: [...] });
 *
 * Graceful degradation:
 *   - If SLACK_BOT_TOKEN missing → falls back to SLACK_WEBHOOK_URL (firehose).
 *   - If channel ID env var missing for the requested channel → falls back to
 *     SLACK_CHANNEL_ALL_JEGODIGITAL → SLACK_WEBHOOK_URL.
 *   - Returns { ok, channel, ts, fallback_used } so callers can log.
 *
 * Last updated: 2026-04-25 (initial ship — replaces SLACK_WEBHOOK_URL firehose
 * across 25 caller files; migration done iteratively).
 */
const axios = require('axios');

const CHANNEL_ENV = {
    'alerts': 'SLACK_CHANNEL_ALERTS',
    'leads-hot': 'SLACK_CHANNEL_LEADS_HOT',
    // Phase 1 Slack command center 2026-04-29: aliases + new channels
    'hot-leads': 'SLACK_CHANNEL_LEADS_HOT',     // alias of leads-hot
    'errors': 'SLACK_CHANNEL_ERRORS',           // new — onDisasterLogged target
    'deploys': 'SLACK_CHANNEL_DEPLOYS',         // new — GitHub Actions notify
    'revenue': 'SLACK_CHANNEL_REVENUE',
    'daily-ops': 'SLACK_CHANNEL_DAILY_OPS',
    'content': 'SLACK_CHANNEL_CONTENT',
    'cold-call-log': 'SLACK_CHANNEL_COLD_CALL_LOG',
    'all': 'SLACK_CHANNEL_ALL_JEGODIGITAL',
};

/**
 * Post a message to a logical channel using the Slack bot token.
 *
 * @param {string} channel - One of: alerts | leads-hot | revenue | daily-ops |
 *                            content | cold-call-log | all
 * @param {object} payload - Slack message payload. Same shape as
 *                            chat.postMessage: { text, blocks, attachments,
 *                            thread_ts, unfurl_links, ... }
 * @returns {Promise<{ok: boolean, channel: string, ts?: string, fallback_used?: string, error?: string}>}
 */
async function slackPost(channel, payload) {
    if (typeof channel !== 'string' || !CHANNEL_ENV[channel]) {
        // unknown channel → bail to firehose so we don't drop the message
        return webhookFallback(payload, `unknown_channel:${channel}`);
    }

    const botToken = process.env.SLACK_BOT_TOKEN;
    const channelId =
        process.env[CHANNEL_ENV[channel]] ||
        process.env.SLACK_CHANNEL_ALL_JEGODIGITAL ||
        null;

    if (!botToken || !channelId) {
        // bot token or channel id missing → webhook fallback
        return webhookFallback(payload, !botToken ? 'no_bot_token' : 'no_channel_id');
    }

    try {
        const res = await axios.post(
            'https://slack.com/api/chat.postMessage',
            {
                channel: channelId,
                ...payload,
                // chat.postMessage requires `text` even when using blocks
                // (used as fallback notification text on mobile)
                text: payload.text || (payload.blocks ? '(see message)' : ''),
            },
            {
                headers: {
                    'Authorization': `Bearer ${botToken}`,
                    'Content-Type': 'application/json; charset=utf-8',
                },
                timeout: 10000,
            }
        );

        if (!res.data.ok) {
            // Slack API returned an error — fall back to webhook
            return webhookFallback(
                payload,
                `slack_api_error:${res.data.error || 'unknown'}`
            );
        }

        return {
            ok: true,
            channel: channel,
            channel_id: channelId,
            ts: res.data.ts,
        };
    } catch (err) {
        return webhookFallback(payload, `exception:${err.message}`);
    }
}

async function webhookFallback(payload, reason) {
    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (!webhook) {
        return { ok: false, channel: 'none', error: `no_webhook_and_${reason}` };
    }
    try {
        await axios.post(webhook, payload, { timeout: 10000 });
        return {
            ok: true,
            channel: 'all-jegodigital',
            fallback_used: reason,
        };
    } catch (err) {
        return {
            ok: false,
            channel: 'none',
            error: `webhook_failed_after_${reason}:${err.message}`,
        };
    }
}

/**
 * Convenience: post a thread reply.
 */
async function slackPostThread(channel, parentTs, payload) {
    return slackPost(channel, { ...payload, thread_ts: parentTs });
}

module.exports = { slackPost, slackPostThread, CHANNEL_ENV };
