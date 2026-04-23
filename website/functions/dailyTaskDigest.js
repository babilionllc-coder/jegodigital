/**
 * dailyTaskDigest — every morning, post today's tasks to Slack + Telegram
 *
 * Runs 08:15 CDMX daily (15 min AFTER dailyStrategist so Big Rock is set).
 * Reads Notion Tasks DB, filters:
 *   - Big Rock checked = TRUE (today's #1)
 *   - OR Priority ∈ [P0, P1]
 *   - AND Status ∉ [Shipped, Canceled]
 *
 * Output: Slack Block Kit message with:
 *   - 🎯 Big Rock prominently at top
 *   - P0 list (with deep links)
 *   - P1 list (with deep links)
 *   - "Open full queue in Notion" CTA
 *
 * Env (GH Secrets): NOTION_API_KEY · SLACK_WEBHOOK_URL · TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const NOTION_VERSION = "2022-06-28";
const DS_TASKS = "7f1f9ac1-5fe6-4b6e-b461-4f189d197922"; // 📋 Tasks / Priority Queue
const TASKS_DB_URL = "https://www.notion.so/770aaf73e0264a1a9fe7bc9de03c9614";

function notionHeaders() {
    const key = process.env.NOTION_API_KEY;
    if (!key) throw new Error("NOTION_API_KEY not set");
    return {
        Authorization: `Bearer ${key}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    };
}

async function queryTasks() {
    // Query: not shipped AND (Big Rock OR Priority in [P0, P1])
    const resp = await axios.post(
        `https://api.notion.com/v1/databases/${DS_TASKS}/query`,
        {
            filter: {
                and: [
                    { property: "Status", select: { does_not_equal: "Shipped" } },
                    { property: "Status", select: { does_not_equal: "Canceled" } },
                    {
                        or: [
                            { property: "Big Rock", checkbox: { equals: true } },
                            { property: "Priority", select: { equals: "P0" } },
                            { property: "Priority", select: { equals: "P1" } },
                        ],
                    },
                ],
            },
            sorts: [
                { property: "Big Rock", direction: "descending" },
                { property: "Priority", direction: "ascending" },
            ],
            page_size: 30,
        },
        { headers: notionHeaders(), timeout: 20000 }
    );
    return resp.data.results || [];
}

function extractPlain(prop) {
    if (!prop) return "";
    if (prop.title) return prop.title.map(t => t.plain_text || "").join("");
    if (prop.rich_text) return prop.rich_text.map(t => t.plain_text || "").join("");
    if (prop.select) return prop.select?.name || "";
    if (prop.checkbox !== undefined) return prop.checkbox;
    if (prop.date) return prop.date?.start || "";
    return "";
}

function truncate(s, n) {
    if (!s) return "";
    return s.length > n ? s.substring(0, n - 1) + "…" : s;
}

function priorityEmoji(p) {
    return { P0: "🔴", P1: "🟠", P2: "🟡", P3: "🔵", P4: "⚪" }[p] || "⚪";
}

function bucketShort(b) {
    if (!b) return "";
    return b.split(" - ")[0]; // "A", "B", "C", "D", "E"
}

function buildSlackBlocks(tasks) {
    const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Cancun", weekday: "long", month: "short", day: "numeric" });

    const bigRocks = [];
    const p0 = [];
    const p1 = [];

    for (const t of tasks) {
        const p = t.properties || {};
        const task = extractPlain(p["Task"]);
        const bucket = bucketShort(extractPlain(p["Bucket"]));
        const priority = extractPlain(p["Priority"]);
        const owner = extractPlain(p["Owner"]);
        const bigRock = p["Big Rock"]?.checkbox || false;
        const url = t.url;
        const entry = { task, bucket, priority, owner, url, bigRock };
        if (bigRock) bigRocks.push(entry);
        else if (priority === "P0") p0.push(entry);
        else if (priority === "P1") p1.push(entry);
    }

    const blocks = [
        {
            type: "header",
            text: { type: "plain_text", text: `☀️ Good morning Alex — ${today}`, emoji: true },
        },
        {
            type: "section",
            text: { type: "mrkdwn", text: `*Today's focus* · ${bigRocks.length} Big Rock · ${p0.length} P0 · ${p1.length} P1` },
        },
        { type: "divider" },
    ];

    // Big Rock(s)
    if (bigRocks.length) {
        blocks.push({
            type: "section",
            text: { type: "mrkdwn", text: "*🎯 TODAY'S BIG ROCK*" },
        });
        for (const r of bigRocks) {
            blocks.push({
                type: "section",
                text: { type: "mrkdwn", text: `${priorityEmoji(r.priority)} *<${r.url}|${truncate(r.task, 100)}>*\n_Bucket ${r.bucket} · Owner: ${r.owner || "—"}_` },
            });
        }
        blocks.push({ type: "divider" });
    }

    // P0
    if (p0.length) {
        let md = "*🔴 P0 — Close paying clients THIS week*\n";
        for (const t of p0) {
            md += `• <${t.url}|${truncate(t.task, 80)}> · _bucket ${t.bucket} · ${t.owner || "—"}_\n`;
        }
        blocks.push({ type: "section", text: { type: "mrkdwn", text: md } });
        blocks.push({ type: "divider" });
    }

    // P1
    if (p1.length) {
        let md = "*🟠 P1 — Generate qualified leads THIS week*\n";
        for (const t of p1) {
            md += `• <${t.url}|${truncate(t.task, 80)}> · _bucket ${t.bucket} · ${t.owner || "—"}_\n`;
        }
        blocks.push({ type: "section", text: { type: "mrkdwn", text: md } });
        blocks.push({ type: "divider" });
    }

    // Footer — open full queue
    blocks.push({
        type: "context",
        elements: [
            { type: "mrkdwn", text: `📋 <${TASKS_DB_URL}|Open full Tasks DB in Notion> · 🎯 <https://www.notion.so/ee1cb76a15174041a646f782debc4b25|Leads CRM> · 💰 Revenue first (HR-3)` },
        ],
    });

    return blocks;
}

async function postToSlack(blocks) {
    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (!webhook) {
        functions.logger.warn("SLACK_WEBHOOK_URL missing");
        return { ok: false, skipped: "no_webhook" };
    }
    try {
        await axios.post(webhook, { blocks, text: "Daily task digest" }, { timeout: 10000 });
        return { ok: true };
    } catch (e) {
        functions.logger.error(`Slack post failed: ${e.message}`);
        return { ok: false, error: e.message };
    }
}

async function postToTelegram(tasks) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return { ok: false, skipped: "no_telegram" };
    try {
        const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Cancun", weekday: "long", month: "short", day: "numeric" });
        let msg = `☀️ *Good morning Alex — ${today}*\n\n`;
        const bigRocks = tasks.filter(t => t.properties["Big Rock"]?.checkbox);
        const p0 = tasks.filter(t => !t.properties["Big Rock"]?.checkbox && extractPlain(t.properties["Priority"]) === "P0");
        const p1 = tasks.filter(t => !t.properties["Big Rock"]?.checkbox && extractPlain(t.properties["Priority"]) === "P1");

        if (bigRocks.length) {
            msg += "🎯 *TODAY'S BIG ROCK*\n";
            for (const t of bigRocks) msg += `• ${truncate(extractPlain(t.properties["Task"]), 100)}\n`;
            msg += "\n";
        }
        if (p0.length) {
            msg += `🔴 *P0 (${p0.length})*\n`;
            for (const t of p0) msg += `• ${truncate(extractPlain(t.properties["Task"]), 80)}\n`;
            msg += "\n";
        }
        if (p1.length) {
            msg += `🟠 *P1 (${p1.length})*\n`;
            for (const t of p1) msg += `• ${truncate(extractPlain(t.properties["Task"]), 80)}\n`;
            msg += "\n";
        }
        msg += `\n📋 Open: https://www.notion.so/770aaf73e0264a1a9fe7bc9de03c9614`;
        await axios.post(
            `https://api.telegram.org/bot${token}/sendMessage`,
            { chat_id: chatId, text: msg, parse_mode: "Markdown", disable_web_page_preview: true },
            { timeout: 10000 }
        );
        return { ok: true };
    } catch (e) {
        functions.logger.error(`Telegram post failed: ${e.message}`);
        return { ok: false, error: e.message };
    }
}

async function runDigest() {
    const tasks = await queryTasks();
    functions.logger.info(`dailyTaskDigest: ${tasks.length} tasks matched`);
    const blocks = buildSlackBlocks(tasks);
    const slackResult = await postToSlack(blocks);
    const telegramResult = await postToTelegram(tasks);
    return { ok: true, task_count: tasks.length, slack: slackResult, telegram: telegramResult };
}

// Scheduled: every day 08:15 CDMX
exports.dailyTaskDigest = functions
    .runWith({ timeoutSeconds: 120, memory: "256MB" })
    .pubsub.schedule("15 8 * * *")
    .timeZone("America/Cancun")
    .onRun(async (_ctx) => {
        try {
            const r = await runDigest();
            functions.logger.info("dailyTaskDigest done:", r);
        } catch (e) {
            functions.logger.error("dailyTaskDigest error:", e);
        }
        return null;
    });

// HTTPS on-demand trigger (for manual test / "send me now")
exports.dailyTaskDigestNow = functions.https.onRequest(async (req, res) => {
    try {
        const r = await runDigest();
        res.json(r);
    } catch (e) {
        functions.logger.error("dailyTaskDigestNow error:", e);
        res.status(500).json({ ok: false, error: e.message });
    }
});
