/**
 * telegramApprovalBot — Money Machine Phase 4 (final gate).
 *
 * Pipeline recap:
 *   redditScraper → /opportunities (status=pending_classification)
 *   opportunityClassifier → /opportunities (status=qualified if score≥70)
 *   opportunityDrafter → /opportunity_drafts (ready_for_approval=true)
 *   telegramApprovalBot (THIS) → posts to Reddit on Alex's 1-tap approval
 *   → /opportunity_outcomes/{draftId} (logged, permalink included)
 *
 * Three Cloud Functions exported:
 *   1. pushDraftToTelegram   — Firestore onCreate trigger on /opportunity_drafts
 *        Sends the draft to Alex with inline keyboard: Approve / Edit / Kill / Skip
 *   2. telegramApprovalCallback — HTTPS webhook for Telegram button taps
 *        Telegram POSTs callback_query → we answer it + act on the draft
 *   3. setTelegramWebhook    — one-time HTTP setup to register the webhook URL
 *        After deploy, hit:
 *        https://us-central1-jegodigital-e02fb.cloudfunctions.net/setTelegramWebhook
 *        Telegram only allows ONE webhook per bot — this sets it to
 *        telegramApprovalCallback.
 *
 * Reddit posting:
 *   Uses Reddit OAuth password-grant (script app type). Env vars:
 *     REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME,
 *     REDDIT_PASSWORD, REDDIT_USER_AGENT
 *   If ANY missing → draft is marked "approved_needs_manual_post" and Alex
 *   gets the permalink + pre-baked draft_text so he can paste in 5 seconds.
 *   Per HR-13 we never "ask Alex to run a command" — but pasting a finished
 *   comment is a human approval step, not a workaround.
 *
 * Telegram inline keyboard callback data format (Telegram caps at 64 chars):
 *   approve_<firestoreDraftId(32 chars)>
 *   edit_<firestoreDraftId>
 *   kill_<firestoreDraftId>
 *   skip_<firestoreDraftId>         // mark for watchlist, retry in 24h
 *
 * Edit flow (MVP): tapping Edit sets draft.status = "awaiting_alex_edit" and
 * replies asking Alex to reply to the original Telegram message with the new
 * comment text. The webhook listens for replies to approval messages,
 * matches them by reply_to_message.message_id, overwrites draft_text, and
 * re-sends the approval buttons.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
const WEBHOOK_URL = "https://us-central1-jegodigital-e02fb.cloudfunctions.net/telegramApprovalCallback";

function tgToken() { return process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK; }
function tgChat()  { return process.env.TELEGRAM_CHAT_ID   || TG_CHAT_FALLBACK; }

// Telegram limits callback_data to 64 bytes — Firestore ids are usually
// 20 chars (onCreate IDs) but opportunity drafts use the oppId which is
// reddit_<64-char sanitized post id>. We truncate to keep under 64 bytes
// and store the mapping in /tg_button_map/{shortId} so we can look up the
// full draft id on callback.
async function shortId(fullDraftId) {
    const db = getFirestore();
    // Use last 22 chars of full id — collision risk is negligible at our scale.
    const short = fullDraftId.slice(-22);
    await db.collection("tg_button_map").doc(short).set({
        full_id: fullDraftId,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return short;
}

async function resolveShortId(short) {
    const db = getFirestore();
    const snap = await db.collection("tg_button_map").doc(short).get();
    return snap.exists ? snap.data().full_id : short; // fallback: maybe already full
}

// -------------------------------------------------------------
// 1. pushDraftToTelegram — fires when opportunityDrafter writes a new draft
// -------------------------------------------------------------
async function buildApprovalMessage(draftData, draftId) {
    const redditUrl = draftData.permalink
        ? (draftData.permalink.startsWith("http") ? draftData.permalink : `https://www.reddit.com${draftData.permalink}`)
        : "unknown";

    const msg = [
        `🎯 *Money Machine — New Reply Draft*`,
        ``,
        `*Subreddit:* r/${draftData.subreddit || "?"}`,
        `*Score:* ${draftData.score || "?"}/100`,
        `*Service match:* ${draftData.primary_service || "none"}`,
        `*Tone:* ${draftData.tone_match || "?"} | *CTA:* ${draftData.soft_cta_variant || "none"}`,
        `*Words:* ${draftData.word_count || "?"}`,
        ``,
        `*Title:* ${(draftData.title || "").slice(0, 180)}`,
        `*Link:* ${redditUrl}`,
        ``,
        `━━━━━━━━━━━━━━━━━━━`,
        `${draftData.draft_text}`,
        `━━━━━━━━━━━━━━━━━━━`,
    ].join("\n");
    return msg;
}

async function buildInlineKeyboard(draftId) {
    const short = await shortId(draftId);
    return {
        inline_keyboard: [[
            { text: "✅ Approve + Post",  callback_data: `approve_${short}` },
            { text: "✏️ Edit",             callback_data: `edit_${short}` },
        ], [
            { text: "⏭️ Skip 24h",         callback_data: `skip_${short}` },
            { text: "❌ Kill",             callback_data: `kill_${short}` },
        ]],
    };
}

async function sendApprovalMessage(draftData, draftId) {
    const text = await buildApprovalMessage(draftData, draftId);
    const reply_markup = await buildInlineKeyboard(draftId);
    const url = `https://api.telegram.org/bot${tgToken()}/sendMessage`;
    try {
        const r = await axios.post(url, {
            chat_id: tgChat(),
            text,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
            reply_markup,
        }, { timeout: 15000 });
        return r.data?.result?.message_id || null;
    } catch (err) {
        // Retry without Markdown (in case of special chars)
        functions.logger.warn("[approvalBot] markdown send failed, retrying plain:", err.response?.data || err.message);
        try {
            const r = await axios.post(url, {
                chat_id: tgChat(),
                text: text.replace(/[*_`]/g, ""),
                disable_web_page_preview: true,
                reply_markup,
            }, { timeout: 15000 });
            return r.data?.result?.message_id || null;
        } catch (err2) {
            functions.logger.error("[approvalBot] plain send failed:", err2.response?.data || err2.message);
            return null;
        }
    }
}

// -------------------------------------------------------------
// Slack mirror — Alex sees new drafts in Slack alongside Telegram.
// Approval still happens IN Telegram (inline keyboard) because Slack
// interactive buttons require a verified app. This is a visibility
// mirror so Alex doesn't miss drafts when he's not watching Telegram.
// -------------------------------------------------------------
async function sendApprovalToSlack(draftData, draftId) {
    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (!webhook) {
        functions.logger.warn("[approvalBot] SLACK_WEBHOOK_URL missing — Slack mirror skipped");
        return { ok: false, reason: "no_webhook" };
    }
    const redditUrl = draftData.permalink
        ? (draftData.permalink.startsWith("http") ? draftData.permalink : `https://www.reddit.com${draftData.permalink}`)
        : "unknown";
    const title = (draftData.title || "(no title)").slice(0, 180);
    const draftText = (draftData.draft_text || "").slice(0, 2800); // Slack block limit

    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: "🎯 Money Machine — New Reply Draft" },
        },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*Subreddit:*\nr/${draftData.subreddit || "?"}` },
                { type: "mrkdwn", text: `*Score:*\n${draftData.score || "?"}/100` },
                { type: "mrkdwn", text: `*Service match:*\n${draftData.primary_service || "none"}` },
                { type: "mrkdwn", text: `*Tone | CTA:*\n${draftData.tone_match || "?"} | ${draftData.soft_cta_variant || "none"}` },
                { type: "mrkdwn", text: `*Words:*\n${draftData.word_count || "?"}` },
                { type: "mrkdwn", text: `*Drafted by:*\n${draftData.drafted_by_model || "?"}` },
            ],
        },
        {
            type: "section",
            text: { type: "mrkdwn", text: `*Title:* ${title}\n*Reddit link:* <${redditUrl}|Open thread>` },
        },
        { type: "divider" },
        {
            type: "section",
            text: { type: "mrkdwn", text: `\`\`\`${draftText}\`\`\`` },
        },
        {
            type: "context",
            elements: [
                { type: "mrkdwn", text: "👉 Approve / Edit / Skip / Kill in *Telegram* — @jegodigital_bot" },
            ],
        },
    ];

    try {
        await axios.post(webhook, {
            blocks,
            text: `New Money Machine draft in r/${draftData.subreddit || "?"} — approve in Telegram`,
            unfurl_links: false,
            unfurl_media: false,
        }, { timeout: 15000 });
        return { ok: true };
    } catch (err) {
        functions.logger.error("[approvalBot] Slack mirror post failed:", err.response?.data || err.message);
        return { ok: false, reason: err.message };
    }
}

exports.pushDraftToTelegram = functions.firestore
    .document("opportunity_drafts/{draftId}")
    .onCreate(async (snap, ctx) => {
        try {
            const d = snap.data();
            if (!d.ready_for_approval) {
                functions.logger.info(`[approvalBot] ${ctx.params.draftId} not ready_for_approval, skipping push.`);
                return null;
            }
            // Fire Telegram + Slack in parallel. Telegram is the approval
            // surface (buttons); Slack is a visibility mirror for Alex.
            const [tgResult, slackResult] = await Promise.allSettled([
                sendApprovalMessage(d, ctx.params.draftId),
                sendApprovalToSlack(d, ctx.params.draftId),
            ]);
            const msgId = tgResult.status === "fulfilled" ? tgResult.value : null;
            const slackOk = slackResult.status === "fulfilled" && slackResult.value?.ok;

            await snap.ref.update({
                telegram_message_id: msgId,
                slack_mirrored: !!slackOk,
                status: "awaiting_approval_telegram",
                pushed_to_telegram_at: admin.firestore.FieldValue.serverTimestamp(),
            });
            functions.logger.info(`[approvalBot] pushed ${ctx.params.draftId} → telegram msg ${msgId} | slack=${slackOk}`);
            return null;
        } catch (err) {
            functions.logger.error("[approvalBot] push crash:", err);
            return null;
        }
    });

// -------------------------------------------------------------
// 2. Reddit OAuth posting
// -------------------------------------------------------------
async function redditAccessToken() {
    const id = process.env.REDDIT_CLIENT_ID;
    const secret = process.env.REDDIT_CLIENT_SECRET;
    const user = process.env.REDDIT_USERNAME;
    const pass = process.env.REDDIT_PASSWORD;
    const ua = process.env.REDDIT_USER_AGENT || "jegodigital-money-machine/1.0";
    if (!id || !secret || !user || !pass) {
        throw new Error("Reddit OAuth env vars missing — set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD");
    }
    const r = await axios.post(
        "https://www.reddit.com/api/v1/access_token",
        new URLSearchParams({ grant_type: "password", username: user, password: pass }).toString(),
        {
            auth: { username: id, password: secret },
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": ua,
            },
            timeout: 15000,
        }
    );
    return { token: r.data.access_token, ua };
}

// permalink looks like /r/smallbusiness/comments/abc123/title/  → thing_id = t3_abc123
function extractThingId(permalink) {
    if (!permalink) return null;
    const m = permalink.match(/\/comments\/([a-z0-9]+)/i);
    return m ? `t3_${m[1]}` : null;
}

async function postRedditComment(permalink, text) {
    const thingId = extractThingId(permalink);
    if (!thingId) throw new Error(`Cannot extract thing_id from permalink: ${permalink}`);
    const { token, ua } = await redditAccessToken();
    const r = await axios.post(
        "https://oauth.reddit.com/api/comment",
        new URLSearchParams({ thing_id: thingId, text, api_type: "json" }).toString(),
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": ua,
            },
            timeout: 20000,
        }
    );
    const errs = r.data?.json?.errors || [];
    if (errs.length) throw new Error(`Reddit error: ${JSON.stringify(errs)}`);
    const data = r.data?.json?.data?.things?.[0]?.data;
    if (!data) throw new Error(`Reddit returned no comment data: ${JSON.stringify(r.data).slice(0, 400)}`);
    return {
        comment_id: data.id,                                   // e.g. "lm3k4n2"
        permalink: `https://www.reddit.com${data.permalink}`,  // full URL
    };
}

// -------------------------------------------------------------
// 3. Telegram callback handler
// -------------------------------------------------------------
async function answerCallbackQuery(callbackQueryId, text) {
    const url = `https://api.telegram.org/bot${tgToken()}/answerCallbackQuery`;
    try {
        await axios.post(url, { callback_query_id: callbackQueryId, text: (text || "").slice(0, 190) }, { timeout: 8000 });
    } catch (err) {
        functions.logger.warn("[approvalBot] answerCallbackQuery failed:", err.response?.data || err.message);
    }
}

async function editTelegramMessage(chatId, messageId, newText) {
    const url = `https://api.telegram.org/bot${tgToken()}/editMessageText`;
    try {
        await axios.post(url, {
            chat_id: chatId,
            message_id: messageId,
            text: newText,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
        }, { timeout: 10000 });
    } catch (err) {
        // Retry plain
        try {
            await axios.post(url, {
                chat_id: chatId,
                message_id: messageId,
                text: newText.replace(/[*_`]/g, ""),
                disable_web_page_preview: true,
            }, { timeout: 10000 });
        } catch (err2) {
            functions.logger.warn("[approvalBot] editMessageText failed:", err2.response?.data || err2.message);
        }
    }
}

async function handleApprove(draftId, cbq) {
    const db = getFirestore();
    const draftRef = db.collection("opportunity_drafts").doc(draftId);
    const snap = await draftRef.get();
    if (!snap.exists) {
        await answerCallbackQuery(cbq.id, "❌ Draft not found");
        return;
    }
    const draft = snap.data();
    if (draft.status === "posted") {
        await answerCallbackQuery(cbq.id, "⚠️ Already posted");
        return;
    }

    // Attempt Reddit post
    let posted = null;
    let postErr = null;
    try {
        posted = await postRedditComment(draft.permalink, draft.draft_text);
    } catch (err) {
        postErr = err.message || String(err);
        functions.logger.error("[approvalBot] Reddit post failed:", postErr);
    }

    if (posted) {
        await draftRef.update({
            status: "posted",
            posted_at: admin.firestore.FieldValue.serverTimestamp(),
            posted_comment_id: posted.comment_id,
            posted_comment_url: posted.permalink,
        });
        await db.collection("opportunities").doc(draft.opportunityId || draftId).update({
            status: "posted",
            outcome_comment_url: posted.permalink,
        }).catch(() => { /* opp doc may use different id */ });
        await db.collection("opportunity_outcomes").doc(draftId).set({
            draftId,
            opportunityId: draft.opportunityId,
            subreddit: draft.subreddit,
            original_post: draft.permalink,
            comment_url: posted.permalink,
            comment_id: posted.comment_id,
            draft_text: draft.draft_text,
            score: draft.score,
            primary_service: draft.primary_service,
            posted_at: admin.firestore.FieldValue.serverTimestamp(),
            status: "posted",
        });
        await answerCallbackQuery(cbq.id, "✅ Posted to Reddit!");
        await editTelegramMessage(
            cbq.message.chat.id,
            cbq.message.message_id,
            `${cbq.message.text}\n\n━━━━━\n✅ *POSTED:* ${posted.permalink}`
        );
    } else {
        // OAuth creds missing or post failed — mark approved, notify Alex with copy-ready paste.
        await draftRef.update({
            status: "approved_needs_manual_post",
            approve_failed_reason: postErr,
            approved_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        await answerCallbackQuery(cbq.id, "⚠️ Approved but auto-post failed — see message for paste-ready copy");
        await editTelegramMessage(
            cbq.message.chat.id,
            cbq.message.message_id,
            `${cbq.message.text}\n\n━━━━━\n⚠️ *APPROVED — manual post needed*\nReason: ${postErr || "unknown"}\nOpen: ${draft.permalink}\nPaste the draft above.`
        );
    }
}

async function handleKill(draftId, cbq) {
    const db = getFirestore();
    await db.collection("opportunity_drafts").doc(draftId).update({
        status: "killed",
        killed_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    await answerCallbackQuery(cbq.id, "❌ Killed");
    await editTelegramMessage(
        cbq.message.chat.id,
        cbq.message.message_id,
        `${cbq.message.text}\n\n━━━━━\n❌ *KILLED*`
    );
}

async function handleSkip(draftId, cbq) {
    const db = getFirestore();
    const nextAt = new Date(Date.now() + 24 * 3600 * 1000);
    await db.collection("opportunity_drafts").doc(draftId).update({
        status: "snoozed",
        snoozed_until: admin.firestore.Timestamp.fromDate(nextAt),
    });
    await answerCallbackQuery(cbq.id, "⏭️ Snoozed 24h");
    await editTelegramMessage(
        cbq.message.chat.id,
        cbq.message.message_id,
        `${cbq.message.text}\n\n━━━━━\n⏭️ *SNOOZED 24h*`
    );
}

async function handleEdit(draftId, cbq) {
    const db = getFirestore();
    await db.collection("opportunity_drafts").doc(draftId).update({
        status: "awaiting_alex_edit",
        edit_requested_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("tg_edit_sessions").doc(String(cbq.message.message_id)).set({
        draftId,
        chat_id: cbq.message.chat.id,
        original_message_id: cbq.message.message_id,
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    await answerCallbackQuery(cbq.id, "✏️ Reply to this message with the new comment text");
    await editTelegramMessage(
        cbq.message.chat.id,
        cbq.message.message_id,
        `${cbq.message.text}\n\n━━━━━\n✏️ *EDIT MODE* — reply to this message with the new comment text (80-180 words).`
    );
}

// Plain text reply to an approval message → treat as an edit.
async function handleTextReply(msg) {
    const db = getFirestore();
    const replyTo = msg.reply_to_message?.message_id;
    if (!replyTo) return false;
    const sessionSnap = await db.collection("tg_edit_sessions").doc(String(replyTo)).get();
    if (!sessionSnap.exists) return false;
    const session = sessionSnap.data();
    const newText = (msg.text || "").trim();
    if (newText.length < 60) {
        await axios.post(`https://api.telegram.org/bot${tgToken()}/sendMessage`, {
            chat_id: msg.chat.id,
            text: `⚠️ Edit too short (${newText.length} chars). Must be at least 60 words.`,
            reply_to_message_id: msg.message_id,
        }, { timeout: 8000 });
        return true;
    }
    const draftRef = db.collection("opportunity_drafts").doc(session.draftId);
    const draftSnap = await draftRef.get();
    const wordCount = newText.split(/\s+/).length;
    await draftRef.update({
        draft_text: newText,
        draft_text_edited_by_alex: true,
        word_count: wordCount,
        edited_at: admin.firestore.FieldValue.serverTimestamp(),
        status: "awaiting_approval_telegram",
    });
    // Re-send approval with updated text
    await sendApprovalMessage(
        { ...draftSnap.data(), draft_text: newText, word_count: wordCount },
        session.draftId
    );
    await db.collection("tg_edit_sessions").doc(String(replyTo)).delete().catch(() => {});
    return true;
}

exports.telegramApprovalCallback = functions.https.onRequest(async (req, res) => {
    try {
        const body = req.body || {};
        functions.logger.info("[approvalCallback] received:", JSON.stringify(body).slice(0, 500));

        // Case A: button tap
        if (body.callback_query) {
            const cbq = body.callback_query;
            const data = cbq.data || "";

            // ---- ROUTING: FB Brokers batch checkpoint (fb_continue: / fb_abort:) ----
            // These come from runFbBrokerBatch.js Phase 1 → Phase 2 checkpoint.
            // Format: fb_continue:SESSION_ID  or  fb_abort:SESSION_ID
            if (/^fb_(continue|abort):/.test(data)) {
                const colonIdx = data.indexOf(":");
                const action = data.slice(0, colonIdx);          // "fb_continue" or "fb_abort"
                const sessionId = data.slice(colonIdx + 1);
                try {
                    if (action === "fb_continue") {
                        await answerCallbackQuery(cbq.id, "▶️ Resuming Phase 2 (firing remaining calls)…");
                        // Fire-and-forget — Cloud Functions can't await long-running invocations
                        // from a webhook handler (Telegram retries if we don't respond fast).
                        // The resume function itself reads state from Firestore.
                        axios.post(
                            "https://us-central1-jegodigital-e02fb.cloudfunctions.net/runFbBrokerBatchResume",
                            {},
                            { timeout: 5000 } // we don't wait for it to finish
                        ).catch((err) => functions.logger.warn("[fb-callback] resume kickoff non-blocking err:", err.code || err.message));
                    } else {
                        await admin.firestore().doc("system/fb_dial_state").set({
                            state: "aborted",
                            aborted_reason: "telegram_button",
                            aborted_at: admin.firestore.FieldValue.serverTimestamp(),
                            aborted_by: cbq.from?.username || cbq.from?.id || "unknown",
                        }, { merge: true });
                        await answerCallbackQuery(cbq.id, "🛑 Batch aborted — current loop will exit before next call.");
                    }
                } catch (err) {
                    functions.logger.error("[fb-callback] failed:", err.message);
                    await answerCallbackQuery(cbq.id, `Error: ${err.message.slice(0, 50)}`);
                }
                return res.json({ ok: true, fb_action: action, session_id: sessionId });
            }

            // ---- ROUTING: WhatsApp follow-up callbacks (wa_sent: / wa_skip:) ----
            // These come from postCallWhatsAppFollowup.js Telegram alerts.
            // Format: wa_sent:CONVERSATION_ID  or  wa_skip:CONVERSATION_ID
            if (/^wa_(sent|skip):/.test(data)) {
                const colonIdx = data.indexOf(":");
                const action = data.slice(0, colonIdx);                  // "wa_sent" or "wa_skip"
                const conversationId = data.slice(colonIdx + 1);
                const newStatus = action === "wa_sent" ? "sent" : "skipped";
                try {
                    await admin.firestore().collection("whatsapp_followup_queue").doc(conversationId).update({
                        status: newStatus,
                        marked_sent_at: admin.firestore.FieldValue.serverTimestamp(),
                        marked_sent_by: cbq.from?.username || cbq.from?.id || "unknown",
                    });
                    await answerCallbackQuery(cbq.id, action === "wa_sent" ? "✅ Marcado como enviado" : "🚫 Skip registrado");
                } catch (err) {
                    functions.logger.error("[wa-callback] update failed:", err.message);
                    await answerCallbackQuery(cbq.id, `Error: ${err.message.slice(0, 50)}`);
                }
                return res.json({ ok: true, wa_action: action, conversation_id: conversationId });
            }

            // ---- existing approval bot callbacks (approve_xxx, kill_xxx, etc.) ----
            // CRITICAL: data looks like "approve_reddit_1ssafi5" — the draft ID
            // itself contains underscores. split("_", 2) returns MAX 2 pieces
            // and throws away the rest, so we'd lose everything after the 2nd
            // underscore. Use indexOf-based slicing to preserve the full short.
            const underscoreIdx = data.indexOf("_");
            const action = underscoreIdx > 0 ? data.slice(0, underscoreIdx) : "";
            const short = underscoreIdx > 0 ? data.slice(underscoreIdx + 1) : "";
            if (!action || !short) {
                await answerCallbackQuery(cbq.id, "Unknown action");
                return res.json({ ok: true });
            }
            const draftId = await resolveShortId(short);
            functions.logger.info(`[approvalCallback] action=${action} short=${short} draftId=${draftId}`);
            if (action === "approve") await handleApprove(draftId, cbq);
            else if (action === "kill") await handleKill(draftId, cbq);
            else if (action === "skip") await handleSkip(draftId, cbq);
            else if (action === "edit") await handleEdit(draftId, cbq);
            else await answerCallbackQuery(cbq.id, `Unknown action: ${action}`);
            return res.json({ ok: true });
        }

        // Case B: plain text message — maybe an edit reply
        if (body.message?.text && body.message?.reply_to_message) {
            const handled = await handleTextReply(body.message);
            return res.json({ ok: true, handled_as_edit: handled });
        }

        return res.json({ ok: true, ignored: true });
    } catch (err) {
        functions.logger.error("[approvalCallback] crash:", err);
        return res.status(200).json({ ok: false, error: err.message }); // 200 so Telegram doesn't retry storm
    }
});

// -------------------------------------------------------------
// 4. setTelegramWebhook — one-time setup
// -------------------------------------------------------------
exports.setTelegramWebhook = functions.https.onRequest(async (req, res) => {
    try {
        const url = `https://api.telegram.org/bot${tgToken()}/setWebhook`;
        const r = await axios.post(url, {
            url: WEBHOOK_URL,
            allowed_updates: ["callback_query", "message"],
        }, { timeout: 15000 });
        const info = await axios.get(`https://api.telegram.org/bot${tgToken()}/getWebhookInfo`, { timeout: 10000 });
        res.json({ ok: true, setWebhook: r.data, info: info.data });
    } catch (err) {
        functions.logger.error("[setTelegramWebhook] crash:", err);
        res.status(500).json({ ok: false, error: err.response?.data || err.message });
    }
});

// -------------------------------------------------------------
// 5. Manual re-push — useful when testing or if a push was missed
// -------------------------------------------------------------
exports.pushPendingDraftsToTelegram = functions.https.onRequest(async (req, res) => {
    try {
        const db = getFirestore();
        const snap = await db.collection("opportunity_drafts")
            .where("ready_for_approval", "==", true)
            .where("status", "in", ["awaiting_approval", "awaiting_approval_telegram"])
            .limit(Number(req.query.limit || 10))
            .get();
        const pushed = [];
        for (const d of snap.docs) {
            // Fire Telegram + Slack in parallel — same pattern as the onCreate
            // trigger. Slack mirror was missing before, which is why drafts
            // appeared in Telegram but never in Alex's Slack.
            // eslint-disable-next-line no-await-in-loop
            const [tgRes, slackRes] = await Promise.allSettled([
                sendApprovalMessage(d.data(), d.id),
                sendApprovalToSlack(d.data(), d.id),
            ]);
            const msgId = tgRes.status === "fulfilled" ? tgRes.value : null;
            const slackOk = slackRes.status === "fulfilled" && slackRes.value?.ok;
            // eslint-disable-next-line no-await-in-loop
            await d.ref.update({
                telegram_message_id: msgId,
                status: "awaiting_approval_telegram",
                pushed_to_telegram_at: admin.firestore.FieldValue.serverTimestamp(),
                slack_mirrored: !!slackOk,
                slack_mirror_last_attempt: admin.firestore.FieldValue.serverTimestamp(),
            });
            pushed.push({
                id: d.id,
                telegram_msg: msgId,
                slack_ok: slackOk,
                slack_reason: slackOk ? null : (slackRes.value?.reason || slackRes.reason?.message || "unknown"),
            });
        }
        res.json({ ok: true, pushed: pushed.length, details: pushed });
    } catch (err) {
        functions.logger.error("[pushPending] crash:", err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------------
// 5b. Scheduled recovery — every 30 min.
//
// Two failure modes this catches:
//   (a) Original push failed silently (telegram_message_id is null) —
//       we fully re-push.
//   (b) Push succeeded but Alex missed/ignored the message for 2h+ —
//       we send a SHORT nudge (not the full draft again) pointing back
//       at the original message.
//
// Nudge cap = 3 per draft (telegram_nudges_sent field) so we don't spam.
// Alex can still tap buttons on the ORIGINAL message — nudge is just a
// pointer.
// -------------------------------------------------------------
async function sendNudge(draftData, draftId) {
    const origMsgId = draftData.telegram_message_id;
    const title = (draftData.title || "(no title)").slice(0, 100);
    const text = [
        `⏰ *Reminder* — draft still awaiting your approval`,
        ``,
        `*Title:* ${title}`,
        `*Score:* ${draftData.score || "?"}/100`,
        `*Subreddit:* r/${draftData.subreddit || "?"}`,
        `*Waiting since:* ${draftData.pushed_to_telegram_at ? "earlier today" : "first push"}`,
        ``,
        origMsgId ? `👆 Scroll up to message \`${origMsgId}\` to tap Approve / Edit / Kill.` : `(Original message id missing — re-pushing full draft in next cycle.)`,
    ].join("\n");
    const url = `https://api.telegram.org/bot${tgToken()}/sendMessage`;
    try {
        const r = await axios.post(url, {
            chat_id: tgChat(),
            text,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
            // Reply to the original so Alex sees the thread
            ...(origMsgId ? { reply_to_message_id: origMsgId } : {}),
        }, { timeout: 15000 });
        return r.data?.result?.message_id || null;
    } catch (err) {
        functions.logger.warn("[nudge] failed:", err.response?.data || err.message);
        return null;
    }
}

exports.scheduledTelegramRecovery = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("every 30 minutes")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = getFirestore();
        const now = Date.now();
        const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
        const MAX_NUDGES = 3;

        const snap = await db.collection("opportunity_drafts")
            .where("ready_for_approval", "==", true)
            .where("status", "in", ["awaiting_approval", "awaiting_approval_telegram"])
            .limit(20)
            .get();

        const summary = { total_stuck: snap.size, full_repushed: 0, nudged: 0, skipped_capped: 0, skipped_recent: 0 };

        for (const d of snap.docs) {
            const data = d.data();
            const hasMsg = !!data.telegram_message_id;
            const pushedAtMs = data.pushed_to_telegram_at?.toMillis?.() || 0;
            const lastNudgeMs = data.last_nudge_at?.toMillis?.() || 0;
            const nudgesSent = data.telegram_nudges_sent || 0;

            // Case A: push never succeeded — do a full re-push
            if (!hasMsg) {
                // eslint-disable-next-line no-await-in-loop
                const [tgRes, slackRes] = await Promise.allSettled([
                    sendApprovalMessage(data, d.id),
                    sendApprovalToSlack(data, d.id),
                ]);
                const msgId = tgRes.status === "fulfilled" ? tgRes.value : null;
                const slackOk = slackRes.status === "fulfilled" && slackRes.value?.ok;
                // eslint-disable-next-line no-await-in-loop
                await d.ref.update({
                    telegram_message_id: msgId,
                    status: "awaiting_approval_telegram",
                    pushed_to_telegram_at: admin.firestore.FieldValue.serverTimestamp(),
                    slack_mirrored: !!slackOk,
                    recovery_reason: "no_msg_id",
                });
                summary.full_repushed += 1;
                continue;
            }

            // Case B: push succeeded, but Alex hasn't acted. Nudge rules:
            //   - at least 2h since original push
            //   - at least 2h since last nudge (don't spam)
            //   - max 3 nudges total per draft
            if (nudgesSent >= MAX_NUDGES) { summary.skipped_capped += 1; continue; }
            const sincePush = now - pushedAtMs;
            const sinceLastNudge = now - lastNudgeMs;
            if (sincePush < TWO_HOURS_MS || sinceLastNudge < TWO_HOURS_MS) {
                summary.skipped_recent += 1;
                continue;
            }

            // eslint-disable-next-line no-await-in-loop
            const nudgeMsgId = await sendNudge(data, d.id);
            // eslint-disable-next-line no-await-in-loop
            await d.ref.update({
                telegram_nudges_sent: nudgesSent + 1,
                last_nudge_at: admin.firestore.FieldValue.serverTimestamp(),
                last_nudge_msg_id: nudgeMsgId,
            });
            summary.nudged += 1;
        }

        functions.logger.info("[scheduledTelegramRecovery]", summary);
        return summary;
    });

// On-demand trigger of the same logic — for manual testing + one-off runs.
exports.scheduledTelegramRecoveryNow = functions.https.onRequest(async (_req, res) => {
    // Duplicate the scheduled body (Cloud Scheduler doesn't expose a local invoke).
    try {
        const db = getFirestore();
        const now = Date.now();
        const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
        const MAX_NUDGES = 3;
        const snap = await db.collection("opportunity_drafts")
            .where("ready_for_approval", "==", true)
            .where("status", "in", ["awaiting_approval", "awaiting_approval_telegram"])
            .limit(20)
            .get();
        const summary = { total_stuck: snap.size, full_repushed: 0, nudged: 0, skipped_capped: 0, skipped_recent: 0 };
        for (const d of snap.docs) {
            const data = d.data();
            const hasMsg = !!data.telegram_message_id;
            const pushedAtMs = data.pushed_to_telegram_at?.toMillis?.() || 0;
            const lastNudgeMs = data.last_nudge_at?.toMillis?.() || 0;
            const nudgesSent = data.telegram_nudges_sent || 0;
            if (!hasMsg) {
                // eslint-disable-next-line no-await-in-loop
                const [tgRes, slackRes] = await Promise.allSettled([
                    sendApprovalMessage(data, d.id),
                    sendApprovalToSlack(data, d.id),
                ]);
                const msgId = tgRes.status === "fulfilled" ? tgRes.value : null;
                const slackOk = slackRes.status === "fulfilled" && slackRes.value?.ok;
                // eslint-disable-next-line no-await-in-loop
                await d.ref.update({
                    telegram_message_id: msgId,
                    status: "awaiting_approval_telegram",
                    pushed_to_telegram_at: admin.firestore.FieldValue.serverTimestamp(),
                    slack_mirrored: !!slackOk,
                    recovery_reason: "no_msg_id",
                });
                summary.full_repushed += 1;
                continue;
            }
            if (nudgesSent >= MAX_NUDGES) { summary.skipped_capped += 1; continue; }
            const sincePush = now - pushedAtMs;
            const sinceLastNudge = now - lastNudgeMs;
            if (sincePush < TWO_HOURS_MS || sinceLastNudge < TWO_HOURS_MS) { summary.skipped_recent += 1; continue; }
            // eslint-disable-next-line no-await-in-loop
            const nudgeMsgId = await sendNudge(data, d.id);
            // eslint-disable-next-line no-await-in-loop
            await d.ref.update({
                telegram_nudges_sent: nudgesSent + 1,
                last_nudge_at: admin.firestore.FieldValue.serverTimestamp(),
                last_nudge_msg_id: nudgeMsgId,
            });
            summary.nudged += 1;
        }
        res.json({ ok: true, ...summary });
    } catch (err) {
        functions.logger.error("[scheduledTelegramRecoveryNow] crash:", err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// -------------------------------------------------------------
// 6. slackWebhookTest — one-line sanity check that the Slack webhook
//    env var is present AND the URL actually accepts a post.
//    Returns the exact reason if it fails so we don't guess.
// -------------------------------------------------------------
exports.slackWebhookTest = functions.https.onRequest(async (req, res) => {
    const webhook = process.env.SLACK_WEBHOOK_URL;
    const botToken = process.env.SLACK_BOT_TOKEN;
    const result = {
        ok: true,
        webhook_configured: !!webhook,
        bot_token_configured: !!botToken,
    };

    // Parse webhook URL structure — format:
    //   https://hooks.slack.com/services/T<team>/B<bot>/<signature>
    if (webhook) {
        try {
            const u = new URL(webhook);
            const parts = u.pathname.split("/").filter(Boolean); // ["services", T..., B..., sig]
            result.webhook = {
                host: u.host,
                team_id: parts[1] || null,     // T..........
                bot_id: parts[2] || null,      // B..........
                signature_suffix: (parts[3] || "").slice(-6),
            };
        } catch (e) { result.webhook_url_parse_error = e.message; }
    }

    // Call Slack's auth.test using the bot token to reveal the actual team name
    // + bot user — this tells us which workspace the integration lives in.
    if (botToken) {
        try {
            const authResp = await axios.post("https://slack.com/api/auth.test", null, {
                headers: { Authorization: `Bearer ${botToken}` },
                timeout: 15000,
            });
            result.auth_test = authResp.data; // includes team, team_id, user, user_id, url
        } catch (e) {
            result.auth_test_error = e.response?.data || e.message;
        }
    }

    // Send a uniquely-identified test message through the webhook so Alex can
    // search for it. Capture the raw Slack response body.
    if (webhook) {
        const marker = `MM-TEST-${Date.now()}`;
        try {
            const wr = await axios.post(webhook, {
                text: `🧪 ${marker} — Money Machine Slack webhook diagnostic. Search for this exact code.`,
                unfurl_links: false,
            }, {
                timeout: 15000,
                validateStatus: () => true, // don't throw — capture whatever Slack says
            });
            result.webhook_post = {
                marker,
                http_status: wr.status,
                slack_body: typeof wr.data === "string" ? wr.data : JSON.stringify(wr.data),
                slack_headers: {
                    "x-slack-req-id": wr.headers["x-slack-req-id"],
                    "x-slack-backend": wr.headers["x-slack-backend"],
                },
            };
        } catch (e) {
            result.webhook_post_error = e.message;
        }
    }

    return res.json(result);
});
