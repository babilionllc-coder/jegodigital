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

// Cheap contamination filter (same rules as lead-finder-v4 Iron Rule 7)
const PORTAL_DOMAINS = [
    "inmuebles24.com", "vivanuncios.com.mx", "lamudi.com.mx", "propiedades.com",
    "century21.com.mx", "remax.com.mx", "metroscubicos.com", "mitula.com.mx",
    "trovit.com.mx", "booking.com", "airbnb.com", "expedia.com", "hotels.com",
    "linktr.ee", "linkin.bio", "beacons.ai", "instabio.cc",
];
function isPortal(domain) {
    const d = (domain || "").toLowerCase();
    return PORTAL_DOMAINS.some((p) => d.endsWith(p) || d.includes(`.${p}`));
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
async function enrichEmailViaHunter(hunterKey, domain) {
    if (!domain || isPortal(domain)) return null;
    try {
        const r = await axios.get("https://api.hunter.io/v2/domain-search", {
            params: { domain, api_key: hunterKey, limit: 5, type: "personal" },
            timeout: 15000,
        });
        const emails = r.data?.data?.emails || [];
        // Prefer decision-maker titles
        const ranked = emails.filter((e) => e.confidence >= 70).sort((a, b) => {
            const score = (e) => {
                const pos = (e.position || "").toLowerCase();
                if (/owner|founder|ceo|director|presiden/i.test(pos)) return 3;
                if (/manager|gerente|jefe|head/i.test(pos)) return 2;
                if (/market|sales|ventas/i.test(pos)) return 1;
                return 0;
            };
            return score(b) - score(a);
        });
        return ranked[0] || null;
    } catch (err) {
        functions.logger.warn(`Hunter enrich failed for ${domain}:`, err.message);
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
        let written = 0, enriched = 0;
        for (const c of fresh.slice(0, 60)) { // hard cap 60/day to respect Hunter quota
            const hunter = await enrichEmailViaHunter(HUNTER_KEY, c.domain);
            if (hunter && hunter.value) enriched++;
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
                    company: c.title || "",
                    company_name: c.title || "",
                    website: c.domain ? `https://${c.domain}` : "",
                    domain: c.domain || "",
                    city: c.city,
                    source: "lead_finder_autoTopUp",
                    discovered_at: admin.firestore.FieldValue.serverTimestamp(),
                    // Explicitly unset last_called_at so coldCallPrep sees "never called"
                    last_called_at: null,
                }, { merge: true });
                written++;
            } catch (err) {
                functions.logger.warn(`phone_leads upsert failed for ${docId}:`, err.message);
            }
            await new Promise((r) => setTimeout(r, 350)); // throttle Hunter
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
            written: written,
            topup_fired: true,
            ran_at: admin.firestore.FieldValue.serverTimestamp(),
        });

        const lines = [
            `🔎 *leadFinderAutoTopUp ${todayKey}*`,
            `   Pool was ${eligibleCount} (threshold ${TARGET_POOL_SIZE}), ran top-up.`,
            `   Cities: ${cities.join(" + ")}`,
            `   Candidates: ${candidates.length} · Fresh: ${fresh.length} · Enriched: ${enriched} · Written: *${written}*`,
            `   Pool now: *${postCount}*`,
        ];
        if (postCount < HARD_FLOOR) {
            lines.push("", `🚨 *ALARM:* pool still under ${HARD_FLOOR}. Review: (a) DFS quota, (b) Hunter hit-rate, (c) rotation cities may be exhausted.`);
        }
        await sendTelegram(lines.join("\n"));
        functions.logger.info(`leadFinderAutoTopUp: wrote=${written} pool_after=${postCount}`);
        return null;
    });
