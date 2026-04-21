/**
 * leadFinderAutoTopUp — daily 08:00 CDMX cron.
 *
 * Prevents the cold-call queue from running dry. Counts phone_leads that
 * coldCallPrep considers eligible (phone_verified=true, do_not_call=false,
 * last_called_at null OR > 14 days). If that pool drops below THRESHOLD,
 * we fire a DataForSEO Maps discovery → Hunter enrichment job to scrape
 * fresh agencies in target cities and upsert them into phone_leads.
 *
 * Why pre-coldCallPrep: prep runs at 09:55 CDMX, top-up runs at 08:00 —
 * gives Hunter + DFS ~2h to finish before prep queries the collection.
 *
 * Target pool: 150 eligible leads ≈ 3 days of 50-call batches.
 * Alarm if we can't reach 100 after the job (hard floor).
 *
 * Rate limits honored: DFS Maps 25 req/burst, Hunter 5 req/s paid tier.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

const TG_BOT_FALLBACK = "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
const TG_CHAT_FALLBACK = "6637626501";
async function sendTelegram(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN || TG_BOT_FALLBACK;
    const chatId = process.env.TELEGRAM_CHAT_ID || TG_CHAT_FALLBACK;
    try {
        const r = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true,
        }, { timeout: 10000 });
        if (r.data?.ok) return { ok: true };
        const r2 = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text,
        }, { timeout: 10000 });
        return { ok: !!r2.data?.ok };
    } catch (err) {
        functions.logger.error("leadFinderAutoTopUp Telegram failed:", err.message);
        return { ok: false };
    }
}

// ---- Config ----
const TARGET_POOL_SIZE = 150;   // healthy pool floor
const HARD_FLOOR = 100;         // below this we alarm Alex
const LEADS_TO_FIND_PER_CITY = 30;
// Rotation of target cities — 2 per day so the pool stays diverse.
// Cancun/PdC are first priority (Flamingo vertical), CDMX/MTY/GDL next.
const CITY_ROTATION = [
    ["Cancún, Quintana Roo, Mexico", "Playa del Carmen, Quintana Roo, Mexico"],
    ["Tulum, Quintana Roo, Mexico", "Cozumel, Quintana Roo, Mexico"],
    ["Mérida, Yucatán, Mexico", "Puerto Vallarta, Jalisco, Mexico"],
    ["Ciudad de México, Mexico", "Guadalajara, Jalisco, Mexico"],
    ["Monterrey, Nuevo León, Mexico", "Querétaro, Querétaro, Mexico"],
    ["Los Cabos, Baja California Sur, Mexico", "San Miguel de Allende, Guanajuato, Mexico"],
    ["Puebla, Puebla, Mexico", "Oaxaca, Oaxaca, Mexico"],
];

function cdmxDayOfYear() {
    const now = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return Math.floor((now - start) / 86400000);
}

function pickTodayCities() {
    const doy = cdmxDayOfYear();
    return CITY_ROTATION[doy % CITY_ROTATION.length];
}

// Cheap contamination filter (same rules as lead-finder-v4 ENTERPRISE_DOMAINS — 41 entries)
// v2 2026-04-21: expanded from 14→41 to match lead_finder_v4_lean.py. See
// /.claude/skills/cold-call-lead-finder/SKILL.md for the full rationale.
const ENTERPRISE_DOMAINS = [
    // Franchises + brokerages (corporate marketing, not single-agent decision makers)
    "cbre.com", "colliers.com", "jll.com", "nmrk.com",
    "kwmexico.mx", "cbcmexico.mx", "cushwake.com",
    "remax.net", "remax.com", "remax.com.mx",
    "century21.com", "century21global.com", "century21.com.mx",
    "coldwellbanker.com",
    // Portals + marketplaces (scraping = call center, not owner)
    "inmuebles24.com", "vivanuncios.com.mx", "propiedades.com",
    "metroscubicos.com", "casasyterrenos.com", "lamudi.com.mx",
    "trovit.com.mx", "mercadolibre.com.mx", "mitula.com.mx",
    // Travel + rental (not real estate buyers)
    "airbnb.com", "booking.com", "expedia.com", "vrbo.com",
    "trivago.com", "hotels.com", "tripadvisor.com",
    // US portals
    "zillow.com", "realtor.com", "redfin.com",
    // Social / linkhouses (no owner signal)
    "facebook.com", "instagram.com", "linktr.ee", "linkin.bio",
    "beacons.ai", "instabio.cc", "bio.link",
    "wixsite.com", "squarespace.com", "godaddysites.com",
    "blogspot.com", "wordpress.com", "tumblr.com", "linkedin.com",
];
// Back-compat alias — older code paths reference PORTAL_DOMAINS
const PORTAL_DOMAINS = ENTERPRISE_DOMAINS;
function isPortal(domain) {
    const d = (domain || "").toLowerCase();
    return ENTERPRISE_DOMAINS.some((p) => d.endsWith(p) || d.includes(`.${p}`));
}

// Decision-maker HARD filter (Hunter position must match, else reject — not rank)
// Bilingual ES/EN: owner/ceo/director/founder/president/broker/principal/
// dueño/propietario/socio/partner/gerente/head/lead
const TITLE_WHITELIST_RE = /owner|ceo|director|founder|cofound|presiden|broker|principal|due[nñ]|propietari|socio|partner|gerente|head|lead/i;
function isDecisionMaker(position) {
    if (!position) return false;
    return TITLE_WHITELIST_RE.test(position);
}

// FAKE_FIRST_NAMES — drop if Hunter's first_name matches one of these role aliases
const FAKE_FIRST_NAMES = new Set([
    "info", "contact", "contacto", "admin", "sales", "marketing", "hello", "hola",
    "ventas", "ventas1", "support", "soporte", "noreply", "no-reply", "mail", "email",
    "webmaster", "team", "office", "gerencia", "recepcion", "rh", "reception",
    "test", "user", "account", "billing",
]);
function isFakeFirstName(name) {
    if (!name) return false;
    return FAKE_FIRST_NAMES.has(name.toLowerCase().trim());
}

// Cross-channel dedup — if the domain is already in Instantly as an active/delivered
// lead, skip writing a phone_lead for it. We don't want email+phone same-week.
// Fails open on missing key / network error (better to write a dupe than block a batch).
async function isInInstantly(domain) {
    const apiKey = process.env.INSTANTLY_API_KEY;
    if (!apiKey || !domain) return false;
    try {
        const resp = await axios.get("https://api.instantly.ai/api/v2/leads", {
            params: { limit: 1, search: domain },
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 8000,
        });
        const items = resp.data?.items || resp.data?.data || [];
        return Array.isArray(items) && items.length > 0;
    } catch (err) {
        functions.logger.warn(`Instantly dedup check failed for ${domain}: ${err.message}`);
        return false;
    }
}

// ---- DataForSEO Maps discovery ----
async function fetchAgenciesForCity(dfsLogin, dfsPass, city, limit) {
    const body = [{
        language_code: "es",
        location_name: city,
        keyword: "real estate agency",
        limit,
    }];
    try {
        const r = await axios.post(
            "https://api.dataforseo.com/v3/business_data/google/my_business_info/live",
            body,
            {
                auth: { username: dfsLogin, password: dfsPass },
                timeout: 30000,
                headers: { "Content-Type": "application/json" },
            }
        );
        const items = r.data?.tasks?.[0]?.result?.[0]?.items || [];
        return items.filter((it) => it.phone && it.domain && !isPortal(it.domain));
    } catch (err) {
        functions.logger.error(`DFS Maps failed for ${city}:`, err.response?.data || err.message);
        return [];
    }
}

// ---- Hunter.io email enrichment ----
// v2 2026-04-21: HARD filter on decision-maker titles (TITLE_WHITELIST_RE).
// No more ranking — if the top match isn't an owner/CEO/director/broker, we
// return null. Also drops FAKE_FIRST_NAMES (info@, ventas@, etc).
// This replaces the soft-rank that was returning "marketing" + "sales" leads
// whose phones went to gatekeepers (see 2026-04-21 Jose Fernandez disaster).
async function enrichEmailViaHunter(hunterKey, domain) {
    if (!domain || isPortal(domain)) return null;
    try {
        const r = await axios.get("https://api.hunter.io/v2/domain-search", {
            params: { domain, api_key: hunterKey, limit: 10, type: "personal" },
            timeout: 15000,
        });
        const emails = r.data?.data?.emails || [];
        // HARD filter: confidence ≥70 + decision-maker title + not a fake first name
        const keepers = emails.filter((e) => {
            if ((e.confidence || 0) < 70) return false;
            if (!isDecisionMaker(e.position)) return false;
            if (isFakeFirstName(e.first_name)) return false;
            return true;
        });
        if (keepers.length === 0) {
            functions.logger.info(`Hunter: ${domain} → ${emails.length} emails but 0 decision-makers (rejected)`);
            return null;
        }
        // Prefer higher confidence among keepers
        keepers.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        return keepers[0];
    } catch (err) {
        functions.logger.warn(`Hunter enrich failed for ${domain}:`, err.message);
        return null;
    }
}

// ---- Firecrawl agency-signal enrichment ----
// v3 2026-04-21: real Firecrawl scrape that populates fc_* signals on
// phone_leads. Used by smart offer routing in coldCallAutopilot — high
// active_listings + stale blog → Offer B (audit), strong IG + no WhatsApp →
// Offer C (setup), default → Offer A (SEO pitch). Also enables coverage gates
// to filter out abandoned/orphan agency sites.
//
// Returns null on any failure — phone_leads.set() will write nulls and the
// downstream router falls back to default rotation. NEVER let Firecrawl
// failures block the lead-finder run.
async function firecrawlAgencySignals(domain) {
    if (!domain || isPortal(domain)) return null;
    const key = process.env.FIRECRAWL_API_KEY;
    if (!key) {
        functions.logger.warn("Firecrawl: FIRECRAWL_API_KEY missing — skipping signal enrichment");
        return null;
    }
    try {
        const r = await axios.post("https://api.firecrawl.dev/v1/scrape", {
            url: `https://${domain}`,
            formats: ["markdown", "html"],
            onlyMainContent: false,
            waitFor: 1500,
            timeout: 25000,
        }, {
            headers: { Authorization: `Bearer ${key}` },
            timeout: 30000,
        });
        const md = (r.data?.data?.markdown || "").toLowerCase();
        const html = (r.data?.data?.html || "").toLowerCase();
        const combined = md + "\n" + html;

        // Active listings — count typical property-card markers. Real estate
        // sites usually surface "$" or "MXN" or "USD" prices in card grids.
        // Cheap signal: if the homepage shows >5 prices, they have active
        // inventory. <2 → likely abandoned or showcase-only.
        const priceMatches = (md.match(/\$\s?[\d,]{3,}|mxn\s?[\d,]{3,}|usd\s?[\d,]{3,}/g) || []).length;
        const fc_active_listings = priceMatches;

        // Last blog post date — scan for ISO dates near "blog" / "article"
        // anchors. Returns YYYY-MM-DD or null.
        let fc_last_blog_post_date = null;
        const blogMatch = md.match(/(20\d{2}-[01]\d-[0-3]\d)[^\n]{0,140}(blog|art[ií]culo|news)/i);
        if (blogMatch) fc_last_blog_post_date = blogMatch[1];
        else {
            const altMatch = md.match(/(blog|art[ií]culo|news)[^\n]{0,140}(20\d{2}-[01]\d-[0-3]\d)/i);
            if (altMatch) fc_last_blog_post_date = altMatch[2];
        }

        // Instagram handle
        let fc_instagram_handle = null;
        const igMatch = combined.match(/instagram\.com\/([a-z0-9._]{2,30})/i);
        if (igMatch && !["p", "reel", "explore", "accounts"].includes(igMatch[1].toLowerCase())) {
            fc_instagram_handle = igMatch[1];
        }

        // WhatsApp link / wa.me
        let fc_whatsapp_link = null;
        const waMatch = combined.match(/(wa\.me\/[\d+]+|api\.whatsapp\.com\/send\?phone=[\d+]+)/i);
        if (waMatch) fc_whatsapp_link = waMatch[1];

        // Chat widget detection — common loaders
        const chatMarkers = [
            "tawk.to", "intercom", "drift.com", "crisp.chat", "livechatinc.com",
            "zendesk.com/embeddable", "tidio", "hubspot.com/usemessages",
            "manychat.com", "chatwoot",
        ];
        const fc_has_chat_widget = chatMarkers.some((m) => combined.includes(m));

        // Site stack — coarse detection of the platform
        let fc_site_stack = "unknown";
        if (combined.includes("wp-content") || combined.includes("wp-includes")) fc_site_stack = "wordpress";
        else if (combined.includes("squarespace")) fc_site_stack = "squarespace";
        else if (combined.includes("wixstatic.com") || combined.includes("wix.com")) fc_site_stack = "wix";
        else if (combined.includes("shopify")) fc_site_stack = "shopify";
        else if (combined.includes("webflow")) fc_site_stack = "webflow";
        else if (combined.includes("__next") || combined.includes("nextjs")) fc_site_stack = "nextjs";

        return {
            fc_active_listings,
            fc_last_blog_post_date,
            fc_instagram_handle,
            fc_instagram_followers: null, // requires IG Graph hit, deferred
            fc_whatsapp_link,
            fc_has_chat_widget,
            fc_pagespeed_mobile: null, // requires PSI hit, deferred to v4
            fc_site_stack,
            fc_enriched_at: admin.firestore.FieldValue.serverTimestamp(),
        };
    } catch (err) {
        functions.logger.warn(`Firecrawl signal enrich failed for ${domain}:`, err.message);
        return null;
    }
}

// =====================================================================
// leadFinderAutoTopUp — Daily 08:00 CDMX
// =====================================================================
exports.leadFinderAutoTopUp = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .pubsub.schedule("0 8 * * *")
    .timeZone("America/Mexico_City")
    .onRun(async () => {
        const db = admin.firestore();

        // ---- Step 1: count eligible pool ----
        const fourteenDaysAgo = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        );
        let poolSnap;
        try {
            poolSnap = await db.collection("phone_leads")
                .where("phone_verified", "==", true)
                .where("do_not_call", "==", false)
                .limit(500)
                .get();
        } catch (err) {
            functions.logger.error("leadFinderAutoTopUp: phone_leads query failed:", err.message);
            await sendTelegram(`⚠️ *leadFinderAutoTopUp* — phone_leads query failed: ${err.message}`);
            return null;
        }

        let eligibleCount = 0;
        poolSnap.forEach((doc) => {
            const d = doc.data();
            const lastCalled = d.last_called_at?.toDate?.() || null;
            if (!lastCalled || lastCalled < fourteenDaysAgo.toDate()) eligibleCount++;
        });

        functions.logger.info(`leadFinderAutoTopUp: eligible pool=${eligibleCount} target=${TARGET_POOL_SIZE}`);

        if (eligibleCount >= TARGET_POOL_SIZE) {
            functions.logger.info(`leadFinderAutoTopUp: pool healthy (${eligibleCount}), skipping top-up.`);
            // Log daily status even when healthy — autopilotReviewer reads this
            await db.collection("lead_topup_summaries").doc(new Date().toISOString().slice(0, 10)).set({
                date: new Date().toISOString().slice(0, 10),
                pool_before: eligibleCount,
                topup_fired: false,
                reason: "pool_healthy",
                ran_at: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            return null;
        }

        // ---- Step 2: API keys ----
        const DFS_LOGIN = process.env.DFS_LOGIN || process.env.DATAFORSEO_LOGIN;
        const DFS_PASS = process.env.DFS_PASSWORD || process.env.DATAFORSEO_PASSWORD;
        const HUNTER_KEY = process.env.HUNTER_API_KEY;

        if (!DFS_LOGIN || !DFS_PASS) {
            await sendTelegram(`⚠️ *leadFinderAutoTopUp* — pool at ${eligibleCount}, but DFS credentials not set. Top-up skipped.`);
            return null;
        }
        if (!HUNTER_KEY) {
            await sendTelegram(`⚠️ *leadFinderAutoTopUp* — pool at ${eligibleCount}, but HUNTER_API_KEY not set. Top-up skipped.`);
            return null;
        }

        // ---- Step 3: discovery ----
        const cities = pickTodayCities();
        const candidates = [];
        for (const city of cities) {
            const items = await fetchAgenciesForCity(DFS_LOGIN, DFS_PASS, city, LEADS_TO_FIND_PER_CITY);
            items.forEach((it) => candidates.push({ ...it, city }));
            await new Promise((r) => setTimeout(r, 2000));
        }

        functions.logger.info(`leadFinderAutoTopUp: discovered ${candidates.length} candidates`);

        // ---- Step 4: dedup against existing phone_leads ----
        const existingPhones = new Set();
        const existingDomains = new Set();
        poolSnap.forEach((doc) => {
            const d = doc.data();
            if (d.phone) existingPhones.add(d.phone.replace(/\D/g, "").slice(-10));
            if (d.domain) existingDomains.add(d.domain.toLowerCase());
            if (d.website) existingDomains.add(d.website.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]);
        });

        const fresh = candidates.filter((c) => {
            const ph = (c.phone || "").replace(/\D/g, "").slice(-10);
            const dom = (c.domain || "").toLowerCase();
            return ph && dom && !existingPhones.has(ph) && !existingDomains.has(dom);
        });

        functions.logger.info(`leadFinderAutoTopUp: ${fresh.length} fresh after dedup`);

        // ---- Step 5: enrich + write ----
        let written = 0, enriched = 0, skippedInstantly = 0, skippedNoOwner = 0;
        for (const c of fresh.slice(0, 60)) { // hard cap 60/day to respect Hunter quota
            // Cross-channel dedup: skip if domain is already an active Instantly lead.
            // Fails open on missing INSTANTLY_API_KEY (logged in helper).
            if (await isInInstantly(c.domain)) {
                skippedInstantly++;
                continue;
            }
            const hunter = await enrichEmailViaHunter(HUNTER_KEY, c.domain);
            if (hunter && hunter.value) {
                enriched++;
            } else {
                // Hunter returned no decision-maker. We still write the lead (phone-only
                // outreach is valid — receptionist can transfer to owner) but we tag it
                // so coldCallPrep can choose to down-rank name-less leads in the gate.
                skippedNoOwner++;
            }
            // v3: real Firecrawl signals — runs in parallel intent with Hunter
            // (sequential, but cheap per-domain ~1.5s + 350ms throttle = ~2s overhead)
            // Failures return null and the lead is still written with null fc_* fields.
            const fcSignals = await firecrawlAgencySignals(c.domain);
            const phoneClean = c.phone.replace(/[^\d+]/g, "");
            const phoneE164 = phoneClean.startsWith("+") ? phoneClean : `+52${phoneClean.slice(-10)}`;
            const docId = phoneE164.replace(/\D/g, "");

            try {
                await db.collection("phone_leads").doc(docId).set({
                    phone: phoneE164,
                    phone_verified: true,
                    do_not_call: false,
                    name: hunter?.first_name ? `${hunter.first_name}${hunter.last_name ? " " + hunter.last_name : ""}` : "",
                    first_name: hunter?.first_name || "",
                    email: hunter?.value || "",
                    position: hunter?.position || "",
                    is_decision_maker: !!(hunter && isDecisionMaker(hunter.position)),
                    company: c.title || "",
                    company_name: c.title || "",
                    website: c.domain ? `https://${c.domain}` : "",
                    domain: c.domain || "",
                    city: c.city,
                    source: "lead_finder_autoTopUp",
                    discovered_at: admin.firestore.FieldValue.serverTimestamp(),
                    // Explicitly unset last_called_at so coldCallPrep sees "never called"
                    last_called_at: null,
                    // Firecrawl signals (v3 2026-04-21) — populated by firecrawlAgencySignals().
                    // Used by coldCallAutopilot smart-routing for offer A/B/C selection.
                    fc_active_listings: fcSignals?.fc_active_listings ?? null,
                    fc_last_blog_post_date: fcSignals?.fc_last_blog_post_date ?? null,
                    fc_instagram_handle: fcSignals?.fc_instagram_handle ?? null,
                    fc_instagram_followers: fcSignals?.fc_instagram_followers ?? null,
                    fc_whatsapp_link: fcSignals?.fc_whatsapp_link ?? null,
                    fc_has_chat_widget: fcSignals?.fc_has_chat_widget ?? null,
                    fc_pagespeed_mobile: fcSignals?.fc_pagespeed_mobile ?? null,
                    fc_maps_rating: c.rating || null,
                    fc_maps_review_count: c.rating_count || null,
                    fc_site_stack: fcSignals?.fc_site_stack ?? null,
                    fc_enriched_at: fcSignals?.fc_enriched_at ?? null,
                }, { merge: true });
                written++;
            } catch (err) {
                functions.logger.warn(`phone_leads upsert failed for ${docId}:`, err.message);
            }
            await new Promise((r) => setTimeout(r, 350)); // throttle Hunter + Firecrawl
        }

        // ---- Step 6: post-check + alarm if still under floor ----
        let recountSnap;
        try {
            recountSnap = await db.collection("phone_leads")
                .where("phone_verified", "==", true)
                .where("do_not_call", "==", false)
                .limit(500)
                .get();
        } catch (err) {
            recountSnap = null;
        }
        let postCount = 0;
        recountSnap?.forEach((doc) => {
            const d = doc.data();
            const lastCalled = d.last_called_at?.toDate?.() || null;
            if (!lastCalled || lastCalled < fourteenDaysAgo.toDate()) postCount++;
        });

        const todayKey = new Date().toISOString().slice(0, 10);
        await db.collection("lead_topup_summaries").doc(todayKey).set({
            date: todayKey,
            pool_before: eligibleCount,
            pool_after: postCount,
            cities,
            candidates_found: candidates.length,
            fresh_after_dedup: fresh.length,
            enriched_with_hunter: enriched,
            skipped_instantly_overlap: skippedInstantly,
            skipped_no_owner: skippedNoOwner,
            written: written,
            topup_fired: true,
            ran_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        const lines = [
            `🔎 *leadFinderAutoTopUp ${todayKey}*`,
            `   Pool was ${eligibleCount} (threshold ${TARGET_POOL_SIZE}), ran top-up.`,
            `   Cities: ${cities.join(" + ")}`,
            `   Candidates: ${candidates.length} · Fresh: ${fresh.length} · Enriched: ${enriched} · Written: *${written}*`,
            `   Skipped: Instantly-overlap ${skippedInstantly} · no-owner ${skippedNoOwner}`,
            `   Pool now: *${postCount}*`,
        ];
        if (postCount < HARD_FLOOR) {
            lines.push("", `🚨 *ALARM:* pool still under ${HARD_FLOOR}. Review: (a) DFS quota, (b) Hunter hit-rate, (c) rotation cities may be exhausted.`);
        }
        await sendTelegram(lines.join("\n"));
        functions.logger.info(`leadFinderAutoTopUp: wrote=${written} pool_after=${postCount}`);
        return null;
    });
