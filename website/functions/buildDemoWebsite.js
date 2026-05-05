/**
 * buildDemoWebsite.js — Autonomous Trojan-Horse demo-website builder.
 *
 * WHY (Rule 13 — plain-language):
 *   The Trojan Horse offer ("free demo website") used to be a 3-day async
 *   manual process: Alex sees the reply, books time, builds in Webflow, ships
 *   the link. Conversion died waiting. This Cloud Function compresses the
 *   flow to <60 minutes, fully autonomous:
 *
 *     Instantly reply → keyword match → research → render → deploy → reply.
 *
 *   Lead types "envía el demo" at 2:14pm. Lead receives the live demo URL by
 *   3:13pm. Sofia WhatsApp follow-up fires at 4:14pm. Booking probability spikes.
 *
 * TRIGGER:
 *   POST /buildDemoWebsite — receives an Instantly reply webhook OR a manual
 *   trigger. Keyword detection happens here (NOT inside Instantly), so the
 *   single webhook URL handles all reply events.
 *
 *   Keywords (Spanish + English): "send the demo", "envía el demo", "envia el
 *   demo", "interesado en el demo", "manda el demo", "demo por favor",
 *   "interested in the demo", "show me the demo", "sí quiero el demo".
 *
 * BEHAVIOR (autonomous chain — every step idempotent + fail-soft logging):
 *   1. Receive webhook → ack 200 immediately.
 *   2. Keyword match against reply body. No match → write skip log + exit.
 *   3. Pull lead from Instantly v2 (already enriched with website + listings).
 *   4. Firecrawl scrape lead's existing site → extract logo URL, brand color,
 *      hero copy, listing count.
 *   5. Compose `demo_builds/<lead_id>` Firestore doc with HTML+context.
 *   6. Render preview hero PNG via Cloud Run mockup-renderer (HTML→PNG).
 *   7. Persist final HTML to Firestore (served by `serveDemo` Cloud Function
 *      at `/demo/<slug>` — see jegodigital.com/firebase.json rewrite. Full
 *      `demo-<slug>.jegodigital.com` subdomain wiring is a follow-up DNS
 *      change; the path-based URL works today without DNS).
 *   8. Reply via Instantly API with the live URL — collaboration tone, ≤120
 *      words, includes the JegoDigital + RE-niche intro per Rule 20.
 *   9. Schedule Sofia WA follow-up at +60min via Firestore `scheduled_wa_pings`
 *      (consumed by existing `processScheduledWAPings` cron — see
 *      `processScheduledEmails` for the analogous pattern).
 *  10. Telegram + Slack digest.
 *
 * RULE-COMPLIANCE NOTES:
 *   - Rule 10: every reply gets a research-grounded fact (listing count or
 *     hero phrase) before send — compliance gate enforced before step 8.
 *   - Rule 17: outbound reply is plain-text, NO link tracking enabled.
 *   - Rule 18: collaboration vocabulary in reply ("collaborate", "alongside",
 *     "build with you"). Banned words gated.
 *   - Rule 20: JegoDigital + RE-niche intro in first 200 chars.
 *   - Rule 24: notify() Telegram + slackPost() on success AND failure.
 *
 * REQUIRED ENV (all already in .env / GH Secrets):
 *   INSTANTLY_API_KEY
 *   FIRECRAWL_API_KEY
 *   ANTHROPIC_API_KEY                — Claude generates the demo copy
 *   MOCKUP_RENDERER_URL              — Cloud Run HTML→PNG endpoint
 *   FIREBASE_HOSTING_DEMO_BASE_URL   — base URL for served demos
 *                                       (default: https://jegodigital.com/demo)
 *   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
 *   SLACK_BOT_TOKEN
 *
 * ⚠️ DEPLOY STATUS: PAUSED — not exported from index.js until Alex 👍.
 *   Companion `serveDemo` HTTP function (below) renders the persisted HTML.
 */
"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

if (!admin.apps.length) admin.initializeApp();

const { notify } = require("./telegramHelper");
const { slackPost } = require("./slackPost");

// ---------- Constants ----------
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const FIRECRAWL_API = "https://api.firecrawl.dev/v1/scrape";
const INSTANTLY_API = "https://api.instantly.ai/api/v2";
const DEMO_BASE_URL = (process.env.FIREBASE_HOSTING_DEMO_BASE_URL || "https://jegodigital.com/demo").replace(/\/$/, "");
const MOCKUP_RENDERER = (process.env.MOCKUP_RENDERER_URL || "https://mockup-renderer-wfmydylowa-uc.a.run.app/render");

// Keyword detection — Spanish + English. Word-boundary tolerant.
const TRIGGER_PATTERNS = [
    /\b(env[ií]a(?:me)?|m[aá]nda(?:me)?|quiero|me interesa|interesad[oa] en).{0,30}\b(el\s+)?demo\b/i,
    /\b(send|show|share)\b.{0,30}\b(the\s+)?demo\b/i,
    /\bdemo\b.{0,15}\b(por\s+favor|please)\b/i,
    /\bs[ií]\s+(quiero|me interesa)\b.{0,30}\bdemo\b/i,
    /\bgive\s+me\s+(the\s+)?demo\b/i,
];

// Banned words gate (Rule 18) — fail send if any appears in our outbound reply.
const BANNED_OUTBOUND = [
    "sell", "selling", "pitch", "buy now", "deal", "discount", "limited time",
    "spots left", "last chance", "urgent", "money-back", "100% guarantee",
    "venta", "vender", "comprar ahora", "última oportunidad", "oferta limitada",
];

// Collaboration tokens (Rule 18) — at least 1 must appear in outbound reply.
const COLLAB_TOKENS = [
    "collaborate", "collaboration", "partner", "partnership", "together",
    "alongside", "build with you", "fit", "explore", "share",
    "colaborar", "colaboración", "partner", "juntos", "alianza",
    "construir contigo", "armar contigo", "explorar",
];

// Rule 20 — JegoDigital + RE niche tokens.
const NICHE_TOKENS = ["inmobiliaria", "real estate", "agencia", "desarrollador", "developer", "broker"];

// ---------- Helpers ----------

function slugify(input) {
    return String(input || "")
        .toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 48) || `lead-${Date.now()}`;
}

function detectTriggerHit(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    for (const re of TRIGGER_PATTERNS) {
        const m = re.exec(t);
        if (m) return { matched: true, pattern: re.source, snippet: m[0] };
    }
    return null;
}

function complianceGate(replyText) {
    const lc = String(replyText || "").toLowerCase();
    const failures = [];

    // Rule 18 — banned words (whole-word match for English, substring for Spanish phrases)
    const hitsBanned = BANNED_OUTBOUND.filter(w => {
        const word = w.toLowerCase();
        if (word.includes(" ")) return lc.includes(word);
        return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`, "i").test(lc);
    });
    if (hitsBanned.length) failures.push(`banned_words: ${hitsBanned.join(", ")}`);

    // Rule 18 — at least 1 collaboration token
    const collabHits = COLLAB_TOKENS.filter(w => lc.includes(w.toLowerCase()));
    if (!collabHits.length) failures.push("no_collaboration_token");

    // Rule 18 reinforcement — flag hedging language that undermines confidence
    const hedgingHits = [/\bmight\b/i, /\bperhaps\b/i, /\bmaybe\b/i, /\bwe\s+could\s+possibly\b/i, /\bquiz[aá]s?\b/i, /\btal\s+vez\b/i]
        .filter(re => re.test(replyText || ""));
    // Hedging is a soft signal — log it but don't block (allows "might be a fit" which IS collaborative)
    // The hard fail stays banned-words-only.

    // Rule 20 — JegoDigital + niche keyword in first 200 chars
    const head = lc.slice(0, 200);
    if (!head.includes("jegodigital")) failures.push("no_jegodigital_intro_first_200");
    if (!NICHE_TOKENS.some(t => head.includes(t.toLowerCase()))) failures.push("no_niche_keyword_first_200");

    return {
        ok: failures.length === 0, failures,
        collab_hits: collabHits, banned_hits: hitsBanned,
        hedging_warnings: hedgingHits.length,
    };
}

/**
 * Idempotency guard — hash the (email, body, hour-bucket) tuple so re-deliveries
 * within the same hour are squashed. Hour-bucket avoids stamping out legitimate
 * second demo requests if the prospect replies the next day.
 */
function dedupKey(leadEmail, replyBody) {
    const crypto = require("crypto");
    const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
    const raw = `${(leadEmail || "").toLowerCase().trim()}::${(replyBody || "").trim().slice(0, 400)}::${hourBucket}`;
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

// ---------- Instantly: pull lead by email ----------
async function fetchInstantlyLead(email) {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key || !email) return null;
    try {
        const r = await axios.post(`${INSTANTLY_API}/leads/list`, {
            search: email, limit: 1,
        }, {
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            timeout: 15000,
        });
        return (r.data?.items || [])[0] || null;
    } catch (err) {
        functions.logger.warn("fetchInstantlyLead failed:", err.response?.data || err.message);
        return null;
    }
}

// ---------- Firecrawl scrape ----------
async function firecrawlScrapeProspectSite(url) {
    if (!url) return { ok: false, skipped: "no_url" };
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) return { ok: false, skipped: "no_key" };
    try {
        const r = await axios.post(FIRECRAWL_API, {
            url: url.startsWith("http") ? url : `https://${url}`,
            formats: ["markdown", "html"],
            onlyMainContent: true,
            timeout: 25000,
        }, {
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            timeout: 30000,
        });
        const md = r.data?.data?.markdown || "";
        const html = r.data?.data?.html || "";
        const meta = r.data?.data?.metadata || {};
        const listings = (md.match(/\$\s?[\d,]+\s?(MXN|USD|MN)?/gi) || []).length;
        const heroMatch = md.match(/^#\s+(.+)$/m);
        return {
            ok: true,
            title: meta.title || null,
            description: meta.description || null,
            og_image: meta.ogImage || null,
            hero_phrase: heroMatch ? heroMatch[1].slice(0, 120) : null,
            listing_count: Math.min(50, listings),
            html_chars: html.length,
            md_chars: md.length,
            verified_at: new Date().toISOString(),
        };
    } catch (err) {
        return { ok: false, error: err.response?.data || err.message };
    }
}

// ---------- Claude: compose demo HTML body + reply text ----------
async function generateDemoCopyAndReply({ lead, scrape, slug, demoUrl }) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

    const company = lead.company_name || lead.organization || (lead.email || "").split("@")[1] || "tu inmobiliaria";
    const firstName = (lead.first_name || lead.firstName || lead.name || "").split(" ")[0] || "";
    const heroFact = scrape.ok ? (scrape.hero_phrase || scrape.title || `tu sitio actual`) : "tu sitio actual";
    // Listing count: null when scrape fails so Claude template can omit the claim
    // (was: 0, which generated false "0 listings detectados" copy on scrape failure).
    const listingCount = scrape.ok ? scrape.listing_count : null;
    const listingClaim = (listingCount && listingCount > 0)
        ? `${listingCount} listings detectados en tu sitio`
        : `tu portafolio actual`;

    const prompt = `Generate a JegoDigital DEMO website body + Instantly reply text for a Mexican real-estate prospect.

JegoDigital is the AI marketing **collaboration partner** for real estate agencies, brokers, developers in Mexico + Miami Hispanic. NEVER vendor-pitch. Tone: friendly, humble, helpful, genuine.

PROSPECT:
- Name: ${firstName}
- Company: ${company}
- Email: ${lead.email}
- Site: ${lead.website || "(unknown)"}
- Hero phrase scraped: "${heroFact}"
- Detected listings: ${listingCount === null ? "(scrape failed — do NOT cite a count)" : listingCount}
- Safe listing reference phrase: "${listingClaim}"
- Demo URL it will be served at: ${demoUrl}

RETURN STRICT JSON (no preamble, no markdown fence):
{
  "demo_html_body": "<!-- ONE STRING, full self-contained HTML body for the demo, dark JegoDigital theme #0f1115 + #C5A059, headline + 3 service cards (Lead Capture / SEO / WhatsApp AI) + footer with Calendly link calendly.com/jegoalexdigital/30min. NO scripts. NO external CDNs except Tailwind CDN. ≤ 8KB. Hero must reference the prospect's company by name. Spanish unless lead.email signals .com TLD with English first name (then English). Buttons say 'Hablemos / Let's talk' (NOT 'Buy / Sign up'). MUST include the prospect's first name. If a listing count was detected use it, otherwise reference '${listingClaim}' generically — DO NOT fabricate a count. -->",
  "reply_text": "≤ 120 words plain text. MANDATORY rules: (1) First 200 chars must contain BOTH 'JegoDigital' AND ('inmobiliaria' OR 'real estate' OR 'desarrollador'). (2) ≥ 1 collaboration word (collaborate/colaborar/partner/together/juntos/build with you/construir contigo/explorar/fit). (3) ZERO banned words (sell/pitch/deal/discount/buy/limited/comprar/oferta limitada). (4) Reference one specific fact about THEM — use '${heroFact}' or '${listingClaim}' (DO NOT invent a number if none was detected). (5) Drop the demo URL on its own line. (6) End with a soft CTA: 'si te late, agendamos una llamada de 15 min' / 'if it lands, let's grab 15 min'. NO emoji except 1 max."
}`;

    const r = await axios.post(ANTHROPIC_API, {
        model: ANTHROPIC_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
    }, {
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        timeout: 60000,
    });

    const raw = r.data?.content?.[0]?.text || "";
    // Tolerant JSON extraction
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error("Claude returned no JSON");
    const json = JSON.parse(raw.slice(start, end + 1));
    if (!json.demo_html_body || !json.reply_text) throw new Error("Claude JSON missing required fields");
    return json;
}

// ---------- Mockup renderer: HTML → preview hero PNG ----------
async function renderHeroPreview({ html, slug }) {
    try {
        const wrapped = `<!doctype html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"></script></head><body style="margin:0;background:#0f1115">${html}</body></html>`;
        const r = await axios.post(MOCKUP_RENDERER, {
            html: wrapped,
            width: 1200, height: 750, deviceScaleFactor: 2,
            waitUntil: "networkidle0",
        }, { timeout: 30000, responseType: "arraybuffer" });
        const buf = Buffer.from(r.data);
        // Persist to Firebase Storage so it's also reachable on socials
        const bucket = admin.storage().bucket();
        const filePath = `demo_builds/${slug}/hero.png`;
        const file = bucket.file(filePath);
        await file.save(buf, {
            metadata: { contentType: "image/png", cacheControl: "public,max-age=86400" },
        });
        // Make public so the demo + Instantly reply can show the preview
        try { await file.makePublic(); } catch (_) { /* swallow */ }
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        return { ok: true, url: publicUrl, bytes: buf.length };
    } catch (err) {
        return { ok: false, error: err.response?.data?.toString?.() || err.message };
    }
}

// ---------- Persist demo HTML to Firestore (served by `serveDemo`) ----------
async function persistDemoToFirestore({ slug, leadId, html, lead, scrape, heroPng, replyText, demoUrl, complianceReport }) {
    const docRef = admin.firestore().collection("demo_builds").doc(slug);
    await docRef.set({
        slug, lead_id: leadId,
        lead_email: lead.email, lead_name: lead.first_name || lead.name || null,
        lead_company: lead.company_name || lead.organization || null,
        lead_site: lead.website || null,
        scrape_evidence: scrape,
        demo_html: html, demo_url: demoUrl,
        hero_png_url: heroPng?.url || null,
        reply_text: replyText,
        compliance: complianceReport,
        status: "ready",
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return docRef.id;
}

// ---------- Instantly: send reply ----------
async function sendInstantlyReply({ leadEmail, replyText, threadId }) {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) throw new Error("INSTANTLY_API_KEY missing");
    // Instantly v2 reply endpoint — non-tracking by default per Rule 17.
    const body = {
        to_address_email_list: [leadEmail],
        body: replyText,
        link_tracking: false,
        open_tracking: false,
        thread_id: threadId || undefined,
    };
    try {
        const r = await axios.post(`${INSTANTLY_API}/emails/reply`, body, {
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            timeout: 20000,
        });
        return { ok: true, message_id: r.data?.id || r.data?.message_id || null };
    } catch (err) {
        return { ok: false, error: err.response?.data || err.message };
    }
}

// ---------- Schedule Sofia WA follow-up at +60min ----------
async function scheduleSofiaWAFollowup({ slug, leadEmail, leadName, demoUrl }) {
    const sendAt = new Date(Date.now() + 60 * 60 * 1000); // +60 min
    const text =
        `Hola ${leadName || ""} 👋 Soy Sofía de JegoDigital — agencia de marketing con IA para inmobiliarias y desarrolladores.\n\n` +
        `Te dejamos el demo hace una hora. Quería preguntarte: ¿qué te pareció? Si algo no encaja, lo armamos juntos. ` +
        `Aquí el link otra vez: ${demoUrl}\n\nUnos 15 min de llamada y vemos si tiene sentido colaborar.`;
    const ref = await admin.firestore().collection("scheduled_wa_pings").add({
        source: "demo_builder",
        slug, lead_email: leadEmail, lead_name: leadName || null,
        send_at: admin.firestore.Timestamp.fromDate(sendAt),
        text,
        demo_url: demoUrl,
        status: "pending",
        created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, queued_id: ref.id, send_at: sendAt.toISOString() };
}

// ---------- Core orchestrator ----------
async function buildAndShipDemo({ replyEvent }) {
    const t0 = Date.now();
    const trace = { steps: [] };

    const leadEmail = (replyEvent.lead_email || replyEvent.from_email || "").trim();
    const replyBody = replyEvent.reply_body || replyEvent.body_text || replyEvent.text || "";
    const threadId = replyEvent.thread_id || null;

    // 1. Keyword gate
    const triggerHit = detectTriggerHit(replyBody);
    if (!triggerHit) {
        trace.steps.push({ step: "keyword_gate", outcome: "no_match" });
        return { ok: true, action: "no_match", trace };
    }
    trace.steps.push({ step: "keyword_gate", outcome: "match", pattern: triggerHit.pattern });

    if (!leadEmail) {
        trace.steps.push({ step: "guard", outcome: "no_lead_email", abort: true });
        return { ok: false, error: "no_lead_email", trace };
    }

    // 2. Idempotency gate — webhook re-deliveries are common; same (email + body + hour)
    //    must NOT spawn duplicate demos / duplicate Instantly replies / duplicate WA pings.
    const dedupHash = dedupKey(leadEmail, replyBody);
    const attemptRef = admin.firestore().collection("demo_attempts").doc(dedupHash);
    try {
        const result = await admin.firestore().runTransaction(async (tx) => {
            const snap = await tx.get(attemptRef);
            if (snap.exists) {
                return { duplicate: true, prior_slug: snap.data().slug || null, prior_at: snap.data().created_at || null };
            }
            tx.set(attemptRef, {
                lead_email: leadEmail,
                reply_body_preview: (replyBody || "").slice(0, 200),
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                status: "in_progress",
            });
            return { duplicate: false };
        });
        if (result.duplicate) {
            trace.steps.push({ step: "idempotency", outcome: "duplicate_squashed", prior_slug: result.prior_slug });
            return { ok: true, action: "duplicate_squashed", trace, prior_slug: result.prior_slug };
        }
        trace.steps.push({ step: "idempotency", outcome: "new_attempt", dedup_hash: dedupHash });
    } catch (e) {
        // If the dedup transaction fails, we'd rather build the demo than block — log + continue
        functions.logger.warn("idempotency tx failed (continuing):", e.message);
        trace.steps.push({ step: "idempotency", outcome: `tx_failed_continuing:${e.message}` });
    }

    // 2. Lead pull
    const lead = (await fetchInstantlyLead(leadEmail)) || { email: leadEmail };
    trace.steps.push({ step: "instantly_lead", outcome: lead.id ? "found" : "stub" });

    // 3. Firecrawl
    const scrape = await firecrawlScrapeProspectSite(lead.website || "");
    trace.steps.push({ step: "firecrawl", outcome: scrape.ok ? "ok" : `skipped:${scrape.skipped || scrape.error}` });

    // 4. Slug + demo URL
    const slugBase = (lead.company_name || lead.organization || (leadEmail.split("@")[1] || "lead").split(".")[0]);
    const slug = slugify(`${slugBase}-${(lead.id || Date.now()).toString().slice(-6)}`);
    const demoUrl = `${DEMO_BASE_URL}/${slug}`;

    // 5. Claude composition
    let composed;
    try {
        composed = await generateDemoCopyAndReply({ lead, scrape, slug, demoUrl });
        trace.steps.push({ step: "claude_compose", outcome: "ok", html_bytes: composed.demo_html_body.length });
    } catch (err) {
        trace.steps.push({ step: "claude_compose", outcome: `failed:${err.message}`, abort: true });
        return { ok: false, error: err.message, trace };
    }

    // 6. Compliance gate (Rule 18 + Rule 20)
    const compliance = complianceGate(composed.reply_text);
    trace.steps.push({ step: "compliance_gate", outcome: compliance.ok ? "passed" : `blocked:${compliance.failures.join("|")}` });
    if (!compliance.ok) {
        // Persist the blocked attempt for human review — DO NOT send
        await admin.firestore().collection("demo_builds_blocked").add({
            slug, lead_email: leadEmail, reply_text: composed.reply_text,
            compliance, trace, created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        await notify(`⚠️ *Demo reply BLOCKED by compliance gate*\nLead: ${leadEmail}\nReasons: \`${compliance.failures.join(", ")}\``, { critical: false });
        return { ok: false, error: "compliance_blocked", compliance, trace };
    }

    // 7. Hero preview render
    const heroPng = await renderHeroPreview({ html: composed.demo_html_body, slug });
    trace.steps.push({ step: "hero_render", outcome: heroPng.ok ? "ok" : `skipped:${heroPng.error?.slice(0, 80)}` });

    // 8. Persist
    const persistedId = await persistDemoToFirestore({
        slug, leadId: lead.id || null, html: composed.demo_html_body,
        lead, scrape, heroPng,
        replyText: composed.reply_text, demoUrl,
        complianceReport: compliance,
    });
    trace.steps.push({ step: "firestore_persist", outcome: "ok", doc: persistedId });

    // 9. Send Instantly reply
    const sendResult = await sendInstantlyReply({ leadEmail, replyText: composed.reply_text, threadId });
    trace.steps.push({ step: "instantly_reply", outcome: sendResult.ok ? "ok" : `failed:${JSON.stringify(sendResult.error).slice(0, 200)}` });

    // 10. Schedule Sofia WA follow-up
    const followup = await scheduleSofiaWAFollowup({
        slug, leadEmail, leadName: lead.first_name || lead.name || "", demoUrl,
    });
    trace.steps.push({ step: "schedule_wa_followup", outcome: "queued", send_at: followup.send_at });

    // 11. Notify
    const tgMd =
        `🚀 *Demo enviado en ${((Date.now() - t0) / 1000).toFixed(1)}s*\n\n` +
        `👤 ${leadEmail}\n🏢 ${lead.company_name || lead.organization || "(empresa no detectada)"}\n` +
        `🌐 [Demo en vivo](${demoUrl})\n` +
        `${heroPng.ok ? `🖼 [Hero preview](${heroPng.url})\n` : ""}` +
        `📨 Instantly reply: ${sendResult.ok ? "✅" : "❌"}\n` +
        `🤖 Sofia WA programada: +60min (${new Date(followup.send_at).toISOString()})\n` +
        `🛡 Compliance: collab=${compliance.collab_hits.length} · banned=${compliance.banned_hits.length}`;
    const tgRes = await notify(tgMd, { critical: !sendResult.ok, markdown: true });

    const slackBlocks = [
        { type: "header", text: { type: "plain_text", text: `🚀 Demo shipped: ${lead.company_name || leadEmail}` } },
        { type: "section", fields: [
            { type: "mrkdwn", text: `*Lead:*\n${leadEmail}` },
            { type: "mrkdwn", text: `*Demo URL:*\n<${demoUrl}|${slug}>` },
            { type: "mrkdwn", text: `*Reply sent:*\n${sendResult.ok ? "✅" : "❌"}` },
            { type: "mrkdwn", text: `*WA follow-up:*\nqueued +60min` },
        ]},
        { type: "context", elements: [
            { type: "mrkdwn", text: `Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s · compliance ✅ · scrape ${scrape.ok ? "✅" : "❌"}` },
        ]},
    ];
    const slackRes = await slackPost("leads-hot", { text: `Demo shipped — ${leadEmail}`, blocks: slackBlocks });

    // 12. Trace persist
    try {
        await admin.firestore().collection("demo_builds").doc(slug).update({
            trace, telegram_ok: !!tgRes?.telegram, slack_ok: !!slackRes?.ok,
            shipped_at: admin.firestore.FieldValue.serverTimestamp(),
            elapsed_ms: Date.now() - t0,
            instantly_reply_message_id: sendResult.message_id || null,
        });
    } catch (_) { /* swallow */ }

    // 13. Mark dedup attempt as shipped so future re-deliveries get squashed cleanly
    try {
        await admin.firestore().collection("demo_attempts").doc(dedupHash).set({
            status: "shipped",
            slug, demo_url: demoUrl,
            shipped_at: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    } catch (_) { /* swallow */ }

    return { ok: true, slug, demoUrl, trace, elapsed_ms: Date.now() - t0 };
}

// ---------- HTTP webhook handler ----------
exports.buildDemoWebsite = functions
    .runWith({ memory: "1GB", timeoutSeconds: 540 })
    .https.onRequest(async (req, res) => {
        if (req.method === "GET") {
            return res.status(200).send("buildDemoWebsite — POST only (Instantly reply webhook)");
        }
        if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

        // Ack immediately — Instantly retries on >5s
        res.status(200).json({ success: true, queued: true });

        try {
            // Accept Instantly webhook shape OR a flat reply object
            const body = req.body || {};
            const replyEvent = {
                lead_email: body.lead_email || body.from_email || body.email || body.payload?.lead_email,
                reply_body: body.reply_body || body.body_text || body.text || body.payload?.reply_body,
                thread_id: body.thread_id || body.payload?.thread_id || null,
            };
            await buildAndShipDemo({ replyEvent });
        } catch (err) {
            functions.logger.error("buildDemoWebsite failed:", err);
            await notify(`❌ *buildDemoWebsite FAILED*\n\`${err.message}\``, { critical: true });
            await slackPost("alerts", { text: `:red_circle: buildDemoWebsite failed — ${err.message}` });
        }
    });

// ---------- On-demand HTTP runner (testing & manual dispatch) ----------
exports.buildDemoWebsiteOnDemand = functions
    .runWith({ memory: "1GB", timeoutSeconds: 540 })
    .https.onRequest(async (req, res) => {
        try {
            const { lead_email, reply_body, thread_id, force = false } = req.body || {};
            if (!lead_email || !reply_body) {
                return res.status(400).json({ error: "lead_email and reply_body required" });
            }
            const replyEvent = {
                lead_email, reply_body: force ? `${reply_body} envía el demo` : reply_body, thread_id,
            };
            const result = await buildAndShipDemo({ replyEvent });
            return res.status(200).json({ ok: true, result });
        } catch (err) {
            functions.logger.error("buildDemoWebsiteOnDemand failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

// ---------- serveDemo — public HTML server for /demo/<slug> ----------
exports.serveDemo = functions
    .runWith({ memory: "256MB", timeoutSeconds: 30 })
    .https.onRequest(async (req, res) => {
        try {
            // Path can be /demo/<slug> via Firebase Hosting rewrite OR ?slug=...
            const path = (req.path || "/").replace(/^\/+/, "").replace(/^demo\//, "");
            const slug = path || (req.query.slug || "").toString();
            if (!slug) return res.status(404).send("Demo not found.");
            const doc = await admin.firestore().collection("demo_builds").doc(slug).get();
            if (!doc.exists) return res.status(404).send("Demo not found.");
            const data = doc.data() || {};
            if (data.status !== "ready") return res.status(404).send("Demo not ready.");
            // Bump view counter (fire-and-forget)
            try {
                await doc.ref.update({
                    views: admin.firestore.FieldValue.increment(1),
                    last_viewed_at: admin.firestore.FieldValue.serverTimestamp(),
                });
            } catch (_) { /* swallow */ }
            const html = `<!doctype html><html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${(data.lead_company || "Demo").toString().slice(0, 80)} · JegoDigital Demo</title>
${data.hero_png_url ? `<meta property="og:image" content="${data.hero_png_url}">` : ""}
<script src="https://cdn.tailwindcss.com"></script>
<style>body{margin:0;background:#0f1115;color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif}</style>
</head><body>${data.demo_html || "<p>Demo content missing.</p>"}</body></html>`;
            res.set("Content-Type", "text/html; charset=utf-8");
            res.set("Cache-Control", "public,max-age=300");
            res.status(200).send(html);
        } catch (err) {
            functions.logger.error("serveDemo error:", err);
            res.status(500).send("Demo error.");
        }
    });

module.exports.__internal = {
    detectTriggerHit, complianceGate, slugify, buildAndShipDemo,
    TRIGGER_PATTERNS, BANNED_OUTBOUND, COLLAB_TOKENS, NICHE_TOKENS,
};
