/**
 * mobileCommandCenter — phone-first Slack command center for JegoDigital
 *
 * 3 scheduled Cloud Functions:
 *   1. dailyContentBrief    — 09:00 CDMX daily → 3 video scripts (TikTok/IG/YT)
 *   2. leadActivityPulse    — 14:00 CDMX daily → past-6h lead activity
 *   3. contentEveningWrap   — 21:00 CDMX daily → content perf + biz state
 *
 * Each also has an HTTPS on-demand sibling (…Now) for manual testing.
 *
 * Design: Alex records 3 videos on iPhone in 5 min from the morning brief,
 * posts to TikTok + IG + YouTube, Sofia handles inbound, evening wrap shows
 * whether the day moved the needle. Zero laptop time required.
 *
 * Env (GH Secrets): SLACK_WEBHOOK_URL · TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID
 *                   GEMINI_API_KEY · INSTANTLY_API_KEY · BREVO_API_KEY
 *                   CALENDLY_PAT · NOTION_API_KEY
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const SLACK = () => process.env.SLACK_WEBHOOK_URL;
const GEMINI = () => process.env.GEMINI_API_KEY;
const NOTION = () => process.env.NOTION_API_KEY;
const INSTANTLY = () => process.env.INSTANTLY_API_KEY;
const BREVO = () => process.env.BREVO_API_KEY;
const CAL = () => process.env.CALENDLY_PAT || process.env.CALENDLY_TOKEN;

const TASKS_DS = "7f1f9ac1-5fe6-4b6e-b461-4f189d197922";
const LEADS_DS = "adacaa44-3d9a-4c00-8ef4-c0eb45ff091b";
const CONTENT_DS = "77f8681d-9952-43f8-879f-4c627609d466";

async function postSlack(blocks, text) {
    // 2026-04-25: routed to #daily-ops (Morning Command Center brief) via slackPost helper.
    const { slackPost } = require('./slackPost');
    const result = await slackPost('daily-ops', { blocks, text });
    if (!result.ok) {
        functions.logger.error(`mobileCommandCenter Slack post failed: ${result.error || "unknown"}`);
        return { ok: false, error: result.error };
    }
    return { ok: true, channel: result.channel };
}

async function postTelegram(text) {
    const t = process.env.TELEGRAM_BOT_TOKEN, c = process.env.TELEGRAM_CHAT_ID;
    if (!t || !c) return { ok: false };
    try {
        await axios.post(`https://api.telegram.org/bot${t}/sendMessage`,
            { chat_id: c, text, parse_mode: "Markdown", disable_web_page_preview: true },
            { timeout: 10000 });
        return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. dailyContentBrief — Gemini-generated 3 video scripts for the morning
// ═══════════════════════════════════════════════════════════════════════════

const CONTENT_PROMPT = `You are the content director for JegoDigital, a 1-person AI marketing agency for Mexican real estate agencies. Your job: write 3 video scripts Alex can record on his iPhone in 5 minutes each.

TODAY IS ${new Date().toLocaleDateString("es-MX", { weekday: "long", month: "long", day: "numeric" })}.

CONSTRAINTS:
- Language: Spanish (default). MX audience.
- Never reveal AI stack (Claude, Gemini, Manychat, etc). Position as "premium full-service agency".
- Proof anchors to use: Flamingo Real Estate 4.4x visibility + #1 Google Maps Cancún. GoodLife Tulum +300% organic traffic. Goza 3x leads. Solik 95% qualify rate.
- Never mention pricing. Only push to free audit (jegodigital.com/auditoria-gratis) or Calendly (calendly.com/jegoalexdigital/30min).
- Stat: 21x more likely to close if you respond in <5 min. 70% of MX inmobiliarias lose leads to slow response.

OUTPUT 3 SCRIPTS, EACH WITH:
- Platform (TikTok / IG Reel / YouTube Shorts)
- Format (one of: Myth-Buster, Case Study, Data Story, Founder Rant, Before/After, Behind-the-Scenes)
- Duration target (30s for TikTok, 45s for IG Reel, 60s for YT Short)
- Hook (first 3 seconds — must stop the scroll)
- Script (exact words to speak)
- CTA (specific, one action)
- Visual notes (what Alex holds/shows on camera)

Rotate formats so 3 scripts feel different. Keep scripts SHORT, CONVERSATIONAL, PUNCHY. No corporate lingo.

RESPOND as JSON:
{
  "scripts": [
    { "platform": "...", "format": "...", "duration": "...", "hook": "...", "script": "...", "cta": "...", "visual": "..." },
    ...
  ]
}`;

async function generateContentScripts() {
    const key = GEMINI();
    if (!key) return { error: "GEMINI_API_KEY missing", scripts: [] };
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
        const resp = await axios.post(url, {
            contents: [{ parts: [{ text: CONTENT_PROMPT }] }],
            generationConfig: { temperature: 0.85, responseMimeType: "application/json", maxOutputTokens: 2048 },
        }, { timeout: 30000 });
        const text = resp.data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim());
        return parsed;
    } catch (e) {
        functions.logger.error(`Gemini content gen failed: ${e.message}`);
        return { error: e.message, scripts: [] };
    }
}

async function runContentBrief() {
    const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Cancun", weekday: "long", month: "short", day: "numeric" });
    const data = await generateContentScripts();
    const scripts = data.scripts || [];

    if (!scripts.length) {
        await postSlack([
            { type: "header", text: { type: "plain_text", text: `🎥 Content Brief — ${today}`, emoji: true } },
            { type: "section", text: { type: "mrkdwn", text: `⚠️ Gemini generation failed: ${data.error || "unknown"}. Fallback: check cold-email-sequences-2026.md for hooks and improvise.` } },
        ], "Content brief error");
        return { ok: false, error: data.error };
    }

    const blocks = [
        { type: "header", text: { type: "plain_text", text: `🎥 Content Brief — ${today}`, emoji: true } },
        { type: "section", text: { type: "mrkdwn", text: `*Record these 3 on your iPhone in ~5 min each — post native on TikTok + IG + YT Shorts*` } },
        { type: "divider" },
    ];

    scripts.slice(0, 3).forEach((s, i) => {
        const emoji = ["🎬", "📱", "▶️"][i] || "🎥";
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `${emoji} *[${i + 1}] ${s.platform || "—"} · ${s.format || "—"} · ${s.duration || "—"}*\n` +
                      `*🪝 Hook:* ${s.hook || "—"}\n` +
                      `*📝 Script:* ${s.script || "—"}\n` +
                      `*🎯 CTA:* ${s.cta || "—"}\n` +
                      `*🎨 Visual:* ${s.visual || "—"}`
            }
        });
        blocks.push({ type: "divider" });
    });

    blocks.push({
        type: "context",
        elements: [{
            type: "mrkdwn",
            text: "📋 <https://www.notion.so/bf901beff0af4da3b083183e75dcbc05|Content Calendar> · 🎯 <https://www.notion.so/770aaf73e0264a1a9fe7bc9de03c9614|Tasks> · Record → CapCut → post"
        }]
    });

    const slackResult = await postSlack(blocks, `Content brief — ${today}`);

    // Also log scripts to Notion Content Calendar as "Idea" rows
    const notionKey = NOTION();
    if (notionKey) {
        for (const s of scripts.slice(0, 3)) {
            try {
                const platformMap = {
                    "TikTok": "TikTok",
                    "Instagram Reel": "Instagram Reel",
                    "IG Reel": "Instagram Reel",
                    "YouTube Shorts": "YouTube Shorts",
                    "YouTube Short": "YouTube Shorts",
                };
                await axios.post("https://api.notion.com/v1/pages",
                    {
                        parent: { database_id: CONTENT_DS },
                        properties: {
                            Title: { title: [{ text: { content: `${s.format || "Video"} — ${(s.hook || "").substring(0, 60)}` } }] },
                            Platform: { select: { name: platformMap[s.platform] || "TikTok" } },
                            Status: { select: { name: "💡 Idea" } },
                            Language: { select: { name: "Spanish" } },
                            Topic: { select: { name: mapFormatToTopic(s.format) } },
                            CTA: { select: { name: "Free Audit" } },
                            Owner: { select: { name: "Alex" } },
                            Notes: { rich_text: [{ text: { content: `Hook: ${s.hook}\n\nScript: ${s.script}\n\nCTA: ${s.cta}\n\nVisual: ${s.visual}\n\nAuto-generated by dailyContentBrief ${new Date().toISOString()}`.substring(0, 1900) } }] },
                        }
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${notionKey}`,
                            "Notion-Version": "2022-06-28",
                            "Content-Type": "application/json"
                        },
                        timeout: 15000
                    }
                );
            } catch (e) {
                functions.logger.error(`Notion Content Calendar log failed: ${e.message}`);
            }
        }
    }

    return { ok: true, scripts_count: scripts.length, slack: slackResult };
}

function mapFormatToTopic(fmt) {
    const f = (fmt || "").toLowerCase();
    if (f.includes("myth")) return "Lead Gen Myths";
    if (f.includes("case")) return "Case Study";
    if (f.includes("data")) return "AEO/ChatGPT";
    if (f.includes("founder")) return "Founder Story";
    if (f.includes("before") || f.includes("after")) return "Case Study";
    if (f.includes("behind")) return "Founder Story";
    return "AI for Real Estate";
}

exports.dailyContentBrief = functions
    .runWith({ timeoutSeconds: 120, memory: "512MB" })
    .pubsub.schedule("0 9 * * *")
    .timeZone("America/Cancun")
    .onRun(async (_ctx) => {
        try { const r = await runContentBrief(); functions.logger.info("dailyContentBrief done", r); }
        catch (e) { functions.logger.error("dailyContentBrief error:", e); }
        return null;
    });

exports.dailyContentBriefNow = functions.https.onRequest(async (_req, res) => {
    try { const r = await runContentBrief(); res.json(r); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. leadActivityPulse — past-6h Slack pulse at 2 PM
// ═══════════════════════════════════════════════════════════════════════════

async function runLeadActivityPulse() {
    const nowIso = new Date().toISOString();
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();
    const stats = { instantly_replies: 0, audits: 0, calendly_booked: 0, calendly_no_show: 0, cold_calls_connected: 0, new_hot_leads: 0 };
    const hotLeads = [];

    // Instantly replies past 6h
    try {
        const resp = await axios.get("https://api.instantly.ai/api/v2/emails?limit=200", {
            headers: { Authorization: `Bearer ${INSTANTLY()}` }, timeout: 20000
        });
        const items = resp.data.items || [];
        const our = ["zeniaaqua.org","zennoenigmawire.com","aichatsy.com","jegodigital","jegoleads","jegoaeo"];
        for (const e of items) {
            const fr = (e.from_address_email || "").toLowerCase();
            const ts = e.timestamp_created || "";
            if (!fr || ts < sinceIso) continue;
            if (our.some(d => fr.includes(d))) continue;
            const body = (e.body || {}).text || (e.body || {}).html || "";
            if (body.length < 20) continue;
            // Skip obvious noise
            if (/mailer-daemon|delivery status|undeliverable|automatic reply|respuesta autom[áa]tica|out of office/.test(body.toLowerCase())) continue;
            stats.instantly_replies++;
            hotLeads.push({ type: "email", from: fr, ts, subject: e.subject || "(no subject)" });
        }
    } catch (e) { functions.logger.error(`Instantly pulse failed: ${e.message}`); }

    // Firestore audit_requests past 6h
    try {
        const db = admin.firestore();
        const snap = await db.collection("audit_requests").where("createdAt", ">=", since).limit(50).get();
        stats.audits = snap.size;
        for (const d of snap.docs) {
            const a = d.data();
            if (!a.email) continue;
            const el = a.email.toLowerCase();
            if (el.includes("test") || el.includes("smoke") || el.includes("jegodigital") || el.includes("babilionllc")) continue;
            hotLeads.push({ type: "audit", from: a.email, ts: a.createdAt?.toDate?.()?.toISOString() || "", source: a.source || "—" });
        }
    } catch (e) { functions.logger.error(`Firestore audit pulse failed: ${e.message}`); }

    // Calendly bookings past 6h
    try {
        const calResp = await axios.get("https://api.calendly.com/scheduled_events", {
            headers: { Authorization: `Bearer ${CAL()}` },
            params: { user: "https://api.calendly.com/users/6f69a014-9ec9-4f18-a86a-80b220063104", min_start_time: sinceIso, count: 20 },
            timeout: 15000
        });
        stats.calendly_booked = (calResp.data.collection || []).length;
    } catch (e) { functions.logger.error(`Calendly pulse failed: ${e.message}`); }

    // Firestore cold_call_leads / call_analysis past 6h
    try {
        const db = admin.firestore();
        const callSnap = await db.collection("call_analysis").where("timestamp", ">=", since).limit(50).get();
        for (const d of callSnap.docs) {
            const c = d.data();
            if (c.status === "done" || c.outcome === "positive" || c.outcome === "interested") stats.cold_calls_connected++;
        }
    } catch (e) { /* silent — collection might not exist */ }

    stats.new_hot_leads = hotLeads.length;

    const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Cancun", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const blocks = [
        { type: "header", text: { type: "plain_text", text: `⚡ Lead Pulse — ${today}`, emoji: true } },
        { type: "section", text: { type: "mrkdwn", text: `*Past 6h activity*` } },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*📧 Cold Email Replies*\n${stats.instantly_replies}` },
                { type: "mrkdwn", text: `*🔍 Audit Requests*\n${stats.audits}` },
                { type: "mrkdwn", text: `*📅 Calendly Booked*\n${stats.calendly_booked}` },
                { type: "mrkdwn", text: `*📞 Cold Calls Connected*\n${stats.cold_calls_connected}` },
            ]
        },
    ];

    if (hotLeads.length) {
        blocks.push({ type: "divider" });
        let md = `*🔥 New activity (${hotLeads.length})*\n`;
        for (const h of hotLeads.slice(0, 10)) {
            const icon = h.type === "email" ? "📧" : h.type === "audit" ? "🔍" : "📞";
            md += `${icon} \`${h.from}\` ${h.subject ? "· " + h.subject.substring(0, 40) : ""}\n`;
        }
        blocks.push({ type: "section", text: { type: "mrkdwn", text: md } });
    } else {
        blocks.push({ type: "section", text: { type: "mrkdwn", text: "_No new lead activity in the last 6h._" } });
    }

    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `🎯 <https://www.notion.so/ee1cb76a15174041a646f782debc4b25|Leads CRM> · 📬 Unibox · 💬 WhatsApp` }] });

    const slackResult = await postSlack(blocks, `Lead pulse — ${today}`);
    return { ok: true, stats, slack: slackResult };
}

exports.leadActivityPulse = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("0 14 * * *")
    .timeZone("America/Cancun")
    .onRun(async (_ctx) => {
        try { const r = await runLeadActivityPulse(); functions.logger.info("leadActivityPulse done", r); }
        catch (e) { functions.logger.error("leadActivityPulse error:", e); }
        return null;
    });

exports.leadActivityPulseNow = functions.https.onRequest(async (_req, res) => {
    try { const r = await runLeadActivityPulse(); res.json(r); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. contentEveningWrap — 9 PM content + biz wrap
// ═══════════════════════════════════════════════════════════════════════════

async function runContentEveningWrap() {
    const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Cancun", weekday: "long", month: "short", day: "numeric" });
    const db = admin.firestore();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Today's audit_requests (proxy for leads)
    let todayAudits = 0, todayCalls = 0;
    try {
        const auditSnap = await db.collection("audit_requests").where("createdAt", ">=", since).limit(200).get();
        todayAudits = auditSnap.size;
    } catch (_) {}
    try {
        const callSnap = await db.collection("call_analysis").where("timestamp", ">=", since).limit(200).get();
        todayCalls = callSnap.size;
    } catch (_) {}

    // Calendly bookings today
    let calendlyToday = 0;
    try {
        const calResp = await axios.get("https://api.calendly.com/scheduled_events", {
            headers: { Authorization: `Bearer ${CAL()}` },
            params: { user: "https://api.calendly.com/users/6f69a014-9ec9-4f18-a86a-80b220063104", min_start_time: since.toISOString(), count: 20 },
            timeout: 15000
        });
        calendlyToday = (calResp.data.collection || []).length;
    } catch (_) {}

    // Instantly sent today (rough)
    let sentToday = 0;
    try {
        const r = await axios.get("https://api.instantly.ai/api/v2/campaigns/analytics", {
            headers: { Authorization: `Bearer ${INSTANTLY()}` },
            params: { start_date: since.toISOString().substring(0, 10), end_date: new Date().toISOString().substring(0, 10) },
            timeout: 15000
        });
        sentToday = (r.data.items || []).reduce((a, c) => a + (c.emails_sent_count || 0), 0);
    } catch (_) {}

    const blocks = [
        { type: "header", text: { type: "plain_text", text: `🌙 Evening Wrap — ${today}`, emoji: true } },
        { type: "section", text: { type: "mrkdwn", text: `*Today's numbers*` } },
        {
            type: "section",
            fields: [
                { type: "mrkdwn", text: `*📧 Cold emails sent*\n${sentToday.toLocaleString()}` },
                { type: "mrkdwn", text: `*🔍 Audit requests*\n${todayAudits}` },
                { type: "mrkdwn", text: `*📞 Cold calls made*\n${todayCalls}` },
                { type: "mrkdwn", text: `*📅 Calendly bookings*\n${calendlyToday}` },
            ]
        },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: `*🎥 Content performance*\n_Tomorrow's script waiting for you at 9 AM. Record → CapCut → post. Every video is a shot at 20+ leads._` } },
        { type: "divider" },
        {
            type: "context",
            elements: [{
                type: "mrkdwn",
                text: `🎯 <https://www.notion.so/ee1cb76a15174041a646f782debc4b25|Leads CRM> · 📋 <https://www.notion.so/770aaf73e0264a1a9fe7bc9de03c9614|Tasks> · 💰 <https://www.notion.so/b73ca45d61d4483aaf7006820f482229|Weekly Revenue>`
            }]
        },
    ];

    const slackResult = await postSlack(blocks, `Evening wrap — ${today}`);
    return { ok: true, stats: { sentToday, todayAudits, todayCalls, calendlyToday }, slack: slackResult };
}

exports.contentEveningWrap = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("0 21 * * *")
    .timeZone("America/Cancun")
    .onRun(async (_ctx) => {
        try { const r = await runContentEveningWrap(); functions.logger.info("contentEveningWrap done", r); }
        catch (e) { functions.logger.error("contentEveningWrap error:", e); }
        return null;
    });

exports.contentEveningWrapNow = functions.https.onRequest(async (_req, res) => {
    try { const r = await runContentEveningWrap(); res.json(r); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
