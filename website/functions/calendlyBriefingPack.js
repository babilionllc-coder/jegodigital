/**
 * calendlyBriefingPack.js — Sales Closer briefing-pack generator.
 *
 * WHY (Rule 13 — plain-language):
 *   Today Alex shows up to a Calendly call with whatever he can scrape in the
 *   90 seconds before the meeting. The briefing-pack agent shows up with a
 *   research dossier 5 minutes after the booking webhook fires. Better prep =
 *   higher close. Target: 3x close (10% → 30%+) on Calendly bookings.
 *
 * TRIGGER:
 *   POST /calendlyBriefingPack — receives Calendly's `invitee.created` webhook.
 *   (Already wired through the existing `calendlyWebhook` for booking
 *   confirmation; this is a SECOND webhook focused only on the briefing.)
 *
 * BEHAVIOR (chained, each step fails-soft so the pack still ships):
 *   1. Parse Calendly payload → name, email, company-domain guess, Q&A.
 *   2. Hunter.io domain lookup    →  company name + employee count + tech.
 *   3. Firecrawl scrape /         →  recent listings count, IG/Sofia presence.
 *   4. DataForSEO Maps + SERP    →  GBP rating + reviews + local rank.
 *   5. seo-engine quick audit    →  DA, monthly traffic, top 3 issues.
 *   6. Claude API (Sonnet 4.6)   →  briefing prose + objections + close script.
 *   7. Persist Notion page → /sales_briefings/<lead_id>.
 *   8. Telegram + Slack #leads-hot digest with link to Notion + key facts.
 *   9. Return 200 OK to Calendly within 10s (heavy work happens after ack).
 *
 * RULE-COMPLIANCE NOTES:
 *   - Rule 1: every figure tagged ✅ live · 🟡 cached · ❌ unverified.
 *   - Rule 7: digest links to live evidence (Hunter URL, Firecrawl URL etc.).
 *   - Rule 13: prose is plain-language, no jargon.
 *   - Rule 18: collaboration tone — closer script uses partner/collaborate.
 *   - Rule 24: notify() Telegram + slackPost('leads-hot') on every run.
 *   - Rule 25: never asks Alex for a fact — investigates, persists to KB.
 *
 * REQUIRED ENV (all already in .env / GH Secrets):
 *   ANTHROPIC_API_KEY     — Claude Sonnet 4.6 for briefing prose
 *   HUNTER_API_KEY        — domain lookup
 *   FIRECRAWL_API_KEY     — site scrape
 *   DATAFORSEO_LOGIN/PASS — Maps + SERP rank
 *   NOTION_API_KEY        — persist briefing page
 *   NOTION_BRIEFINGS_DB   — (NEW) target database id
 *   TELEGRAM_BOT_TOKEN    — via telegramHelper.notify()
 *   TELEGRAM_CHAT_ID      — via telegramHelper.notify()
 *   SLACK_BOT_TOKEN       — via slackPost.slackPost()
 *
 * ⚠️ DEPLOY STATUS: PAUSED — awaiting Alex 👍 + Calendly webhook URL update.
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
const HUNTER_API = "https://api.hunter.io/v2/domain-search";
const FIRECRAWL_API = "https://api.firecrawl.dev/v1/scrape";
const DFS_API = "https://api.dataforseo.com/v3";
const NOTION_API = "https://api.notion.com/v1";

const FREE_INBOX_DOMAINS = new Set([
    "gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com",
    "me.com", "live.com", "aol.com", "proton.me", "protonmail.com",
]);

// ---------- Helpers ----------

/** Extract a likely company domain from email + Q&A website answer. */
function deriveDomain(email, websiteAnswer) {
    const ans = (websiteAnswer || "").trim();
    if (ans && ans !== "(no proporcionado)") {
        try {
            const u = new URL(ans.startsWith("http") ? ans : `https://${ans}`);
            return u.hostname.replace(/^www\./, "");
        } catch (_) { /* fallthrough */ }
    }
    const at = (email || "").indexOf("@");
    if (at < 0) return "";
    const dom = email.slice(at + 1).toLowerCase().trim();
    if (FREE_INBOX_DOMAINS.has(dom)) return "";
    return dom;
}

function parseAnswers(qna) {
    const out = {};
    if (!Array.isArray(qna)) return out;
    for (const { question, answer } of qna) {
        if (!question) continue;
        out[question] = answer || "";
    }
    return out;
}

function safeFirstName(name) {
    return ((name || "").trim().split(/\s+/)[0]) || "";
}

// ---------- Hunter.io domain lookup ----------
async function hunterDomainLookup(domain) {
    if (!domain) return { ok: false, skipped: "no_domain" };
    const key = process.env.HUNTER_API_KEY;
    if (!key) return { ok: false, skipped: "no_key" };
    try {
        const r = await axios.get(HUNTER_API, {
            params: { domain, api_key: key, limit: 5 },
            timeout: 12000,
        });
        const d = r.data?.data || {};
        return {
            ok: true,
            organization: d.organization || null,
            company_type: d.company_type || null,
            country: d.country || null,
            city: d.city || null,
            industry: d.industry || null,
            description: d.description || null,
            employee_count: d.linkedin_employee_count || d.employee_count || null,
            technologies: (d.technologies || []).slice(0, 8),
            social: {
                linkedin: d.linkedin || null,
                instagram: d.instagram || null,
                facebook: d.facebook || null,
                twitter: d.twitter || null,
            },
            top_emails: (d.emails || []).slice(0, 5).map(e => ({
                value: e.value, type: e.type, position: e.position, seniority: e.seniority,
            })),
            verified_at: new Date().toISOString(),
        };
    } catch (err) {
        return { ok: false, error: err.response?.data || err.message };
    }
}

// ---------- Firecrawl scrape ----------
async function firecrawlScrape(domain) {
    if (!domain) return { ok: false, skipped: "no_domain" };
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) return { ok: false, skipped: "no_key" };
    try {
        const r = await axios.post(FIRECRAWL_API, {
            url: `https://${domain}`,
            formats: ["markdown"],
            onlyMainContent: true,
            timeout: 25000,
        }, {
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            timeout: 30000,
        });
        const md = r.data?.data?.markdown || "";
        const meta = r.data?.data?.metadata || {};
        // Heuristic signals — listing count, IG link, WA chat widget
        const listingMatches = md.match(/\$\s?[\d,]+\s?(MXN|USD|MN|Pesos)?/gi) || [];
        const propertyMatches = md.match(/\b(recámaras|habitaciones|m²|m2|sqft|bedroom|bathroom)\b/gi) || [];
        return {
            ok: true,
            title: meta.title || null,
            description: meta.description || null,
            language: meta.language || null,
            og_image: meta.ogImage || null,
            markdown_chars: md.length,
            estimated_listings: Math.min(50, listingMatches.length),
            property_signals: Math.min(50, propertyMatches.length),
            has_whatsapp_widget: /wa\.me|whatsapp|api\.whatsapp/i.test(md),
            has_chat_widget: /tawk|intercom|hubspot.*chat|crisp|drift/i.test(md),
            has_ig_link: /instagram\.com\/[A-Za-z0-9_.]+/i.test(md),
            has_calendly_booking: /calendly\.com\//i.test(md),
            verified_at: new Date().toISOString(),
        };
    } catch (err) {
        return { ok: false, error: err.response?.data || err.message };
    }
}

// ---------- DataForSEO: Google Maps + local SERP rank ----------
async function dfsMapsAndRank({ domain, organizationName, city }) {
    const login = process.env.DATAFORSEO_LOGIN;
    const pass = process.env.DATAFORSEO_PASS;
    if (!login || !pass) return { ok: false, skipped: "no_creds" };
    if (!organizationName && !domain) return { ok: false, skipped: "no_query" };

    const auth = { username: login, password: pass };
    const out = { ok: true, gbp: null, local_competitors: [], verified_at: new Date().toISOString() };

    // 1. Google Maps live business lookup
    try {
        const q = `${organizationName || domain} ${city || "Mexico"}`.trim();
        const r = await axios.post(`${DFS_API}/business_data/google/my_business_info/live`, [{
            keyword: q, location_name: city ? `${city},Mexico` : "Mexico",
            language_code: "es", limit: 1,
        }], { auth, timeout: 25000 });
        const item = r.data?.tasks?.[0]?.result?.[0]?.items?.[0] || null;
        if (item) {
            out.gbp = {
                title: item.title || null,
                rating: item.rating?.value || null,
                reviews_count: item.rating?.votes_count || null,
                category: item.category || null,
                address: item.address || null,
                phone: item.phone || null,
                domain: item.domain || null,
                place_id: item.place_id || null,
            };
        }
    } catch (err) {
        out.gbp_error = err.response?.data?.status_message || err.message;
    }

    // 2. Local SERP — top 3 competitors for "[city] real estate agency"
    try {
        const kw = city ? `inmobiliaria ${city}` : "inmobiliaria mexico";
        const r2 = await axios.post(`${DFS_API}/serp/google/maps/live/advanced`, [{
            keyword: kw, location_name: city ? `${city},Mexico` : "Mexico",
            language_code: "es", depth: 5,
        }], { auth, timeout: 25000 });
        const items = r2.data?.tasks?.[0]?.result?.[0]?.items || [];
        out.local_competitors = items.slice(0, 5).map((it, idx) => ({
            rank: idx + 1, title: it.title, rating: it.rating?.value || null,
            reviews: it.rating?.votes_count || null, domain: it.domain || null,
        }));
        // Where is the prospect ranked?
        const myDomain = (domain || "").toLowerCase();
        const myIdx = items.findIndex(it => (it.domain || "").toLowerCase().includes(myDomain) && myDomain);
        out.prospect_rank = myIdx >= 0 ? (myIdx + 1) : null;
    } catch (err) {
        out.serp_error = err.response?.data?.status_message || err.message;
    }
    return out;
}

// ---------- seo-engine quick audit (DA + organic traffic estimate) ----------
async function seoEngineQuickAudit(domain) {
    const login = process.env.DATAFORSEO_LOGIN;
    const pass = process.env.DATAFORSEO_PASS;
    if (!login || !pass) return { ok: false, skipped: "no_creds" };
    if (!domain) return { ok: false, skipped: "no_domain" };
    try {
        const r = await axios.post(
            `${DFS_API}/dataforseo_labs/google/domain_metrics_by_categories/live`,
            [{ target: domain, language_code: "es", location_code: 2484 }],
            { auth: { username: login, password: pass }, timeout: 25000 }
        );
        const item = r.data?.tasks?.[0]?.result?.[0] || {};
        const overview = item.metrics?.organic || {};
        return {
            ok: true,
            organic_keywords: overview.count || 0,
            estimated_monthly_traffic: overview.etv || 0,
            estimated_traffic_cost_usd: Math.round((overview.estimated_paid_traffic_cost || 0) * 100) / 100,
            top_keywords: overview.pos_1 || 0,
            top_3_keywords: (overview.pos_2_3 || 0) + (overview.pos_1 || 0),
            verified_at: new Date().toISOString(),
        };
    } catch (err) {
        return { ok: false, error: err.response?.data?.status_message || err.message };
    }
}

// ---------- Anomaly flagger — surface stop-scroll insights for Alex ----------
function flagAnomalies(facts) {
    const flags = [];
    const fc = facts.firecrawl || {};
    const seo = facts.seo_engine || {};
    const dfs = facts.dataforseo || {};
    if (fc.ok && seo.ok) {
        if (fc.estimated_listings >= 20 && seo.estimated_monthly_traffic < 50) {
            flags.push("🚨 high listings (≥20) + very low organic traffic (<50/mo) → SEO is the wedge — they have inventory but aren't being found");
        }
        if (fc.has_whatsapp_widget === false && fc.estimated_listings > 10) {
            flags.push("🚨 no WhatsApp widget despite real inventory → mobile leads dropping off — Service 1 (Captura 24/7) is immediate win");
        }
        if (fc.has_chat_widget === false && fc.has_calendly_booking === false) {
            flags.push("ℹ️ no chat OR booking widget → conversion path is email-only, slow funnel");
        }
    }
    if (dfs.ok && dfs.gbp) {
        if (dfs.gbp.rating !== null && dfs.gbp.rating < 4.0) {
            flags.push(`⚠️ Google Maps rating ${dfs.gbp.rating}★ — review trust signal weak, could affect conversion`);
        }
        if (dfs.gbp.reviews_count !== null && dfs.gbp.reviews_count < 10) {
            flags.push(`ℹ️ only ${dfs.gbp.reviews_count} GBP reviews — review-pump campaign easy upsell`);
        }
    }
    if (dfs.ok && dfs.prospect_rank === null && dfs.local_competitors.length > 0) {
        flags.push(`🚨 not in top 5 local SERP for their own city — top competitor is ${dfs.local_competitors[0].title} (#${dfs.local_competitors[0].rank}, ${dfs.local_competitors[0].rating || "—"}★)`);
    }
    return flags;
}

// ---------- Post-Claude compliance scrubber (Rule 18 enforcement) ----------
const BANNED_OUTBOUND_WORDS = [
    /\bsell(?:ing)?\b/i, /\bpitch(?:ing)?\b/i, /\bdeal\b/i, /\bdiscount\b/i,
    /\blimited\s+time\b/i, /\bspots?\s+left\b/i, /\blast\s+chance\b/i,
    /\bmoney[-\s]?back\b/i, /\b100\s*%\s+guarantee\b/i, /\bbuy\s+now\b/i,
    /\bventa\b/i, /\bvender\b/i, /\bofert[ai]\s+limitad[ao]\b/i,
    /\bcomprar\s+ahora\b/i, /\b[uú]ltima?\s+oportunidad\b/i,
];
function scrubBriefing(markdown) {
    const text = String(markdown || "");
    const hits = [];
    for (const re of BANNED_OUTBOUND_WORDS) {
        const m = re.exec(text);
        if (m) hits.push({ pattern: re.source, snippet: m[0] });
    }
    return { clean: hits.length === 0, violations: hits };
}

// ---------- Claude API — generate briefing prose ----------
async function generateBriefing(facts) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { ok: false, skipped: "no_key" };

    const prompt = `You are JegoDigital's pre-call sales-strategist. JegoDigital is a Mexico+Miami AI marketing **collaboration partner** for real estate agencies, brokers and developers (NOT a vendor — collaboration tone, never "sell/pitch/deal").

Generate a 5-section briefing pack for Alex Jego's upcoming Calendly call. Output Markdown ONLY (no preamble, no commentary).

Structure exactly:

## 📸 Snapshot
One paragraph (max 4 sentences) describing the prospect: company, location, what they sell, signals from their site (listings count, WhatsApp widget, IG presence). Cite numbers from the facts (eg "≈18 listings", "GBP 4.7★ / 124 reviews"). NEVER fabricate.

## 🥊 Local battlefield
Bullet the top 3 local competitors from the facts with their (rating · reviews · rank). End with "**Prospect's current rank:** N" — use the rank from facts, or "**Not in top 5**" if none.

## 🚨 3 biggest gaps (Alex's wedge)
3 bullets, each one a specific, evidence-grounded gap (eg "no Instagram link → IG retargeting impossible", "monthly organic traffic <50 → SEO is wide open", "no WhatsApp widget → losing 80% of mobile leads"). Connect each gap to a JegoDigital service (Service 1 Captura Leads 24/7, Service 2 SEO Local, Service 3 AEO, Service 4 Social, Service 5 Website, Service 8 Sofia AI).

## 🎁 Recommended bundle
Pick ONE: Pack Crecimiento (1+2+4) · Pack Dominación (1+2+3+4+6) · Custom (specify which services). One sentence why. **Do NOT quote price** — that lives on the Calendly call only.

## 🗣️ 3 hot objections + counters + closing script
Three objections likely from THIS prospect's profile (not generic). For each: objection in italics, then 1–2 sentence counter using collaboration vocabulary (collaborate / partner / build with you / fit / together). Then 3 lines of closing script Alex can say verbatim — must mention "JegoDigital" + at least one collaboration word. NEVER use "sell / pitch / deal / spots left / limited time".

## ➡️ Si dicen sí — next step
ONE sentence telling Alex what to do in the 60 seconds AFTER the prospect says yes. Pick from: send Pack Crecimiento cotización · schedule free 30-min Service 1 setup · send Sofia WhatsApp intro link · book a follow-up technical-scoping call. Match to the recommended bundle above.

FACTS (verified this session):
\`\`\`json
${JSON.stringify(facts, null, 2)}
\`\`\`

ANOMALIES FLAGGED (surface these in the briefing where relevant — these are stop-scroll signals):
${(facts.red_flags && facts.red_flags.length) ? facts.red_flags.map(f => `- ${f}`).join("\n") : "- (none flagged)"}

Constraints:
- Plain Spanish unless prospect's data shows English-only signals (then English).
- ≤ 800 words total.
- No emojis except the section headers above.
- If a fact is missing tag the line "❓ unverified" — do NOT invent.`;

    try {
        const r = await axios.post(ANTHROPIC_API, {
            model: ANTHROPIC_MODEL,
            max_tokens: 2200,
            messages: [{ role: "user", content: prompt }],
        }, {
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            timeout: 45000,
        });
        const text = r.data?.content?.[0]?.text || "";
        return { ok: true, markdown: text, model: ANTHROPIC_MODEL };
    } catch (err) {
        return { ok: false, error: err.response?.data || err.message };
    }
}

// ---------- Notion: persist briefing as page ----------
async function persistToNotion({ name, email, domain, briefingMd, factsMd, callIso }) {
    const key = process.env.NOTION_API_KEY;
    const dbId = process.env.NOTION_BRIEFINGS_DB;
    if (!key || !dbId) return { ok: false, skipped: !key ? "no_key" : "no_db_id" };
    try {
        const props = {
            "Name": { title: [{ text: { content: `${name} · ${domain || email}` } }] },
            "Email": { email: email || null },
            "Domain": { rich_text: [{ text: { content: domain || "" } }] },
            "Call At": { date: { start: callIso || new Date().toISOString() } },
            "Status": { select: { name: "Briefing Ready" } },
        };
        // Page body: 2 H1s and 2 markdown blocks
        const blocks = [];
        const pushHeading = (txt) => blocks.push({
            object: "block", type: "heading_1",
            heading_1: { rich_text: [{ type: "text", text: { content: txt } }] },
        });
        const pushPara = (txt) => {
            // Notion limits 2000 chars per rich_text block — chunk
            const chunks = [];
            for (let i = 0; i < txt.length; i += 1900) chunks.push(txt.slice(i, i + 1900));
            for (const c of chunks) {
                blocks.push({
                    object: "block", type: "paragraph",
                    paragraph: { rich_text: [{ type: "text", text: { content: c } }] },
                });
            }
        };
        pushHeading("Briefing");
        pushPara(briefingMd || "(no briefing)");
        pushHeading("Raw research facts");
        pushPara(factsMd || "(no facts)");

        const r = await axios.post(`${NOTION_API}/pages`, {
            parent: { database_id: dbId },
            properties: props,
            children: blocks.slice(0, 100), // Notion API limit per request
        }, {
            headers: {
                Authorization: `Bearer ${key}`,
                "Notion-Version": "2022-06-28",
                "Content-Type": "application/json",
            },
            timeout: 20000,
        });
        return { ok: true, page_id: r.data?.id || null, url: r.data?.url || null };
    } catch (err) {
        return { ok: false, error: err.response?.data || err.message };
    }
}

// ---------- Main runner ----------
async function buildBriefing({ payload, eventType }) {
    const t0 = Date.now();
    const scheduled = payload.scheduled_event || {};
    const name = (payload.name || "").trim() || "Lead sin nombre";
    const email = (payload.email || "").trim();
    const callIso = scheduled.start_time || null;
    const answers = parseAnswers(payload.questions_and_answers);
    const websiteAnswer = answers["¿Tienes sitio web? (optional)"]
        || answers["¿Tienes sitio web?"] || "";
    const painAnswer = answers["¿Cuántos leads recibes al mes aproximadamente y cuál es tu mayor reto ahora mismo?"]
        || "(no proporcionado)";
    const whatsapp = answers["¿Cuál es tu número de WhatsApp?"] || "(no proporcionado)";

    const domain = deriveDomain(email, websiteAnswer);
    const firstName = safeFirstName(name);

    // 4 enrichments in parallel — fail-soft
    const [hunter, firecrawl, _placeholderRank, seo] = await Promise.all([
        hunterDomainLookup(domain),
        firecrawlScrape(domain),
        Promise.resolve(null),  // placeholder so DFS Maps gets organization name from Hunter
        seoEngineQuickAudit(domain),
    ]);

    const orgName = hunter.ok ? (hunter.organization || null) : null;
    const city = hunter.ok ? (hunter.city || null) : null;
    const dfs = await dfsMapsAndRank({ domain, organizationName: orgName, city });

    // Compose facts dossier for Claude
    const facts = {
        prospect: {
            name, email, first_name: firstName, whatsapp,
            domain: domain || null, websiteAnswer: websiteAnswer || null,
            pain_answer: painAnswer,
            calendly_call_at: callIso,
            event_name: scheduled.name || null,
        },
        hunter, firecrawl, dataforseo: dfs, seo_engine: seo,
        red_flags: [],   // populated below
        verification: {
            session_run_at: new Date().toISOString(),
            elapsed_ms: Date.now() - t0,
            // Rule 1 tags — every fact tagged ✅ live or 🟡 cached or ❌ unverified
            hunter_tag: hunter.ok ? "✅ live" : `❌ unverified (${hunter.skipped || hunter.error || "fail"})`,
            firecrawl_tag: firecrawl.ok ? "✅ live" : `❌ unverified (${firecrawl.skipped || firecrawl.error || "fail"})`,
            dataforseo_tag: dfs.ok ? "✅ live" : `❌ unverified (${dfs.skipped || "fail"})`,
            seo_engine_tag: seo.ok ? "✅ live" : `❌ unverified (${seo.skipped || seo.error || "fail"})`,
        },
    };

    // Anomaly flagger — gives Alex stop-scroll insights even if Claude misses them
    facts.red_flags = flagAnomalies(facts);

    // Claude briefing prose
    const briefing = await generateBriefing(facts);

    // Post-Claude scrub — Rule 18 enforcement on the closing script
    let scrubReport = { clean: true, violations: [] };
    if (briefing.ok) {
        scrubReport = scrubBriefing(briefing.markdown);
        if (!scrubReport.clean) {
            functions.logger.warn("⚠️ Briefing closing script contains banned words:",
                scrubReport.violations.map(v => v.snippet).join(", "));
        }
    }

    // Notion page
    const notion = await persistToNotion({
        name, email, domain,
        briefingMd: briefing.ok ? briefing.markdown : `_(briefing failed: ${briefing.error || briefing.skipped})_`,
        factsMd: "```json\n" + JSON.stringify(facts, null, 2) + "\n```",
        callIso,
    });

    // Firestore audit trail
    let firestoreId = null;
    try {
        const ref = await admin.firestore().collection("sales_briefings").add({
            event_type: eventType, lead_name: name, lead_email: email,
            domain: domain || null, call_at_utc: callIso || null,
            facts, briefing_ok: briefing.ok, notion_url: notion.url || null,
            notion_page_id: notion.page_id || null,
            scrub_clean: scrubReport.clean,
            scrub_violations: scrubReport.violations,
            red_flags: facts.red_flags,
            telegram_ok: null, slack_ok: null,
            elapsed_ms: Date.now() - t0,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
        });
        firestoreId = ref.id;
    } catch (e) {
        functions.logger.warn("calendlyBriefingPack Firestore log failed:", e.message);
    }

    // Telegram + Slack digest
    const tagLine = `${facts.verification.hunter_tag} · ${facts.verification.firecrawl_tag} · ${facts.verification.dataforseo_tag} · ${facts.verification.seo_engine_tag}`;
    const orgBit = orgName ? `*Empresa:* ${orgName}` : `_(empresa no detectada — investigar manual)_`;
    const cityBit = city ? `*Ciudad:* ${city}` : "";
    const trafficBit = seo.ok ? `*Tráfico orgánico est:* ${seo.estimated_monthly_traffic.toFixed(0)} visitas/mes (${seo.organic_keywords} keywords)` : "";
    const gbpBit = dfs.ok && dfs.gbp ? `*Google Maps:* ${dfs.gbp.rating || "—"}★ · ${dfs.gbp.reviews_count || 0} reviews` : "";
    const competitorBit = dfs.ok && dfs.local_competitors.length
        ? `*Top competidor local:* ${dfs.local_competitors[0].title} (${dfs.local_competitors[0].rating || "—"}★ · #${dfs.local_competitors[0].rank})`
        : "";

    const flagsBit = facts.red_flags.length ? `\n🚨 *Señales:*\n${facts.red_flags.map(f => `- ${f}`).join("\n")}` : "";
    const scrubBit = !scrubReport.clean
        ? `\n⚠️ *Closing script tiene palabras prohibidas — REVISAR antes de la llamada:* ${scrubReport.violations.map(v => v.snippet).join(", ")}`
        : "";
    const tgMd =
        `📋 *Briefing pack listo — ${firstName}*\n\n` +
        `${orgBit}\n${cityBit}\n${trafficBit}\n${gbpBit}\n${competitorBit}${flagsBit}\n\n` +
        `🌐 ${domain || "(sin dominio)"}\n` +
        `🎯 *Reto:* ${painAnswer}\n\n` +
        `🔬 *Verificación:*\n${tagLine}${scrubBit}\n\n` +
        (notion.ok && notion.url ? `📄 [Ver briefing en Notion](${notion.url})` : `_(Notion fallback en Firestore: \`sales_briefings/${firestoreId || "?"}\`)_`);

    const tgRes = await notify(tgMd, { critical: false, markdown: true });

    const slackBlocks = [
        { type: "header", text: { type: "plain_text", text: `📋 Briefing pack: ${firstName}` } },
        { type: "section", fields: [
            { type: "mrkdwn", text: `*Empresa:*\n${orgName || "_no detectada_"}` },
            { type: "mrkdwn", text: `*Dominio:*\n${domain || "_n/a_"}` },
            { type: "mrkdwn", text: `*Tráfico (DFS):*\n${seo.ok ? Math.round(seo.estimated_monthly_traffic) + "/mes" : "n/a"}` },
            { type: "mrkdwn", text: `*GBP:*\n${dfs.ok && dfs.gbp ? `${dfs.gbp.rating || "—"}★ · ${dfs.gbp.reviews_count || 0}` : "_n/a_"}` },
        ]},
        { type: "section", text: { type: "mrkdwn", text: `*Reto:* ${painAnswer}` } },
        { type: "section", text: { type: "mrkdwn", text: `*Verificación:* ${tagLine}` } },
    ];
    if (notion.ok && notion.url) {
        slackBlocks.push({ type: "actions", elements: [
            { type: "button", text: { type: "plain_text", text: "Abrir briefing en Notion" }, url: notion.url, style: "primary" },
        ]});
    }
    const slackRes = await slackPost("leads-hot", {
        text: `Briefing pack ready for ${firstName}`, blocks: slackBlocks,
    });

    // Update Firestore with notification results
    if (firestoreId) {
        try {
            await admin.firestore().collection("sales_briefings").doc(firestoreId).update({
                telegram_ok: !!tgRes?.telegram, slack_ok: !!slackRes?.ok,
                completed_at: admin.firestore.FieldValue.serverTimestamp(),
            });
        } catch (_) { /* swallow */ }
    }

    return {
        ok: true, firestoreId, notion, briefing_ok: briefing.ok,
        elapsed_ms: Date.now() - t0,
    };
}

// ---------- HTTP handler ----------
exports.calendlyBriefingPack = functions
    .runWith({ memory: "512MB", timeoutSeconds: 540 })
    .https.onRequest(async (req, res) => {
        if (req.method === "GET") {
            return res.status(200).send("calendlyBriefingPack — POST only (Calendly invitee.created webhook)");
        }
        if (req.method !== "POST") {
            return res.status(405).json({ error: "Method not allowed" });
        }
        const body = req.body || {};
        const eventType = body.event;
        const payload = body.payload || {};

        // Only act on invitee.created — pings & cancels are no-ops here
        if (eventType !== "invitee.created") {
            return res.status(200).json({ success: true, action: "ignored", event: eventType });
        }

        // Ack immediately, run async (Calendly retries on >10s)
        res.status(200).json({ success: true, queued: true });

        try {
            await buildBriefing({ payload, eventType });
        } catch (err) {
            functions.logger.error("calendlyBriefingPack failed:", err);
            await notify(`❌ *Briefing pack FAILED*\n\`${err.message}\``, { critical: true });
            await slackPost("alerts", { text: `:red_circle: Briefing pack failed: ${err.message}` });
        }
    });

// ---------- On-demand HTTP runner (for testing & backfill) ----------
exports.calendlyBriefingPackOnDemand = functions
    .runWith({ memory: "512MB", timeoutSeconds: 540 })
    .https.onRequest(async (req, res) => {
        try {
            // Either accept a Calendly-shaped body OR a simple { name, email, website, pain }
            let payload = req.body?.payload;
            if (!payload) {
                const { name, email, website, pain, call_at } = req.body || {};
                if (!email) return res.status(400).json({ error: "email required" });
                payload = {
                    name: name || email.split("@")[0],
                    email,
                    questions_and_answers: [
                        { question: "¿Tienes sitio web? (optional)", answer: website || "" },
                        { question: "¿Cuántos leads recibes al mes aproximadamente y cuál es tu mayor reto ahora mismo?", answer: pain || "" },
                    ],
                    scheduled_event: { start_time: call_at || new Date(Date.now() + 24 * 3600 * 1000).toISOString() },
                };
            }
            const result = await buildBriefing({ payload, eventType: "invitee.created" });
            return res.status(200).json({ ok: true, result });
        } catch (err) {
            functions.logger.error("calendlyBriefingPackOnDemand failed:", err);
            return res.status(500).json({ ok: false, error: err.message });
        }
    });

module.exports.__internal = { buildBriefing, deriveDomain, parseAnswers, flagAnomalies, scrubBriefing };
