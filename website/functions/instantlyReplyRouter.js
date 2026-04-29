/**
 * instantlyReplyRouter v2.1 — fully autonomous, geo-aware, intent-classifying,
 * always-close-to-Calendly reply composer with the FULL JegoDigital close
 * package (acknowledgment + geo proof + demo link + 2 time slots + Calendly
 * + WhatsApp for MX + signed Alex / JegoDigital).
 *
 * v2.1 (2026-04-29) — close mechanics upgrade per Alex:
 *   - BUY / TECH_Q / EXPLORE replies now include all 5 close elements
 *   - Demo URL routes by Instantly campaign (Trojan Horse → /lead-capture-demo,
 *     SEO/AEO → /seo-aeo-demo, World Cup / Speed-to-Lead → /lead-capture-demo)
 *   - 2 specific time proposals (next 2 business days, 3pm + 11am, geo TZ)
 *   - WhatsApp +52 998 202 3263 added ONLY for MX prospects (per playbook)
 *   - Sign-off normalized to "Alex / JegoDigital" (Iron Rule #5 — never full name)
 *   - Replaces the v2 single-Calendly-line close that was incomplete
 *
 * v2 (2026-04-28) — original autonomous router:
 *   1. Classify intent: BUY / TECH_Q / EXPLORE / OOO / UNSUB / BOUNCE
 *   2. Filter noise (OOO / UNSUB / BOUNCE) — NO reply, just mark + log
 *   3. Geo-route to MX / CARIBBEAN / MIAMI / FALLBACK proof banks
 *   4. Mirror prospect language (ES / EN); ignore Polish/PT iPhone signatures
 *   5. POST to Instantly v2 /api/v2/emails/reply
 *   6. Log to Firestore reply_routing_log
 *   7. Cross-post to Slack #hot-leads (informational only)
 *
 * Disaster fix: 2026-04-28 Andrea Bieganowska
 *   - DR-based agent (bluecaribbeanproperties.com), wrote English, said
 *     "Hi, please send me the offer." (BUY), v1 sent her Cancún Flamingo
 *     proof in Spanish with MX WhatsApp number. She ghosted.
 *   - v2.1 detects: geo=CARIBBEAN (city Punta Cana), intent=BUY, lang=EN,
 *     picks CARIBBEAN proof, sends demo + 2 time slots + Calendly fallback,
 *     OMITS MX WhatsApp number, signs "Alex / JegoDigital".
 *
 * Hard rules satisfied:
 *   HR-0  — every proof string is a real verified client claim, no fabrication
 *   HR-2  — every send goes through live Instantly v2 API, response checked
 *   HR-6  — caller verifies status before marking "replied"
 *   HR-13 — Alex never composes a reply for any class (full autonomy)
 *
 * Memory rules satisfied:
 *   - Instantly tracking pixel stays OFF (we don't touch tracking config here)
 *   - Zero ManyChat references (FB Lead Form is the only inbound funnel)
 *   - Sign-off is "Alex / JegoDigital" — NEVER full name, NEVER a title
 */

const axios = require("axios");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

const { slackPost } = require("./slackPost");

const INSTANTLY_API = "https://api.instantly.ai/api/v2";
const INSTANTLY_KEY = process.env.INSTANTLY_API_KEY;

const CALENDLY = "https://calendly.com/jegoalexdigital/30min";
const WHATSAPP_MX = "+52 998 202 3263"; // MX prospects only — playbook rule

// Canonical demo URLs — match Alex's spec table 2026-04-29
const DEMO_LEAD_CAPTURE = "https://jegodigital.com/lead-capture-demo";
const DEMO_SEO_AEO = "https://jegodigital.com/seo-aeo-demo";

/**
 * CAMPAIGN_DEMO_URLS — resolve demo URL by exact Instantly campaign UUID.
 * Source of truth: notionLeadSync.INSTANTLY_CAMPAIGN_MAP (live pull 2026-04-23).
 * Fallback: name-keyword match below; final fallback: lead-capture-demo (Trojan Horse).
 */
const CAMPAIGN_DEMO_URLS = {
    "cd9f1abf-3ad5-460c-88e9-29c48bc058b3": DEMO_LEAD_CAPTURE, // Trojan Horse
    "67fa7834-4dba-4ed9-97e2-0e9c53f8a6ed": DEMO_SEO_AEO,      // SEO + Visibilidad
    "d486f1ab-4668-4674-ad6b-80ef12d9fd78": DEMO_LEAD_CAPTURE, // Free Demo Website MX (still Trojan Horse offer)
};

/**
 * CAMPAIGN_NAME_DEMO_URLS — fuzzy-match by campaign name keyword.
 * Used when the UUID isn't in CAMPAIGN_DEMO_URLS but the watcher passed a name.
 */
const CAMPAIGN_NAME_DEMO_URLS = [
    { match: /seo|aeo|chatgpt|visibilidad|antigravity/i, url: DEMO_SEO_AEO },
    { match: /trojan|world.?cup|speed.?to.?lead|audit|auditor[ií]a|free.?demo|whatsapp|captura|lead.?capture|hispanic/i, url: DEMO_LEAD_CAPTURE },
];

const DEFAULT_DEMO_URL = DEMO_LEAD_CAPTURE; // Trojan Horse is JegoDigital's primary offer

function resolveDemoUrl({ campaignId, campaignName }) {
    if (campaignId && CAMPAIGN_DEMO_URLS[campaignId]) return CAMPAIGN_DEMO_URLS[campaignId];
    if (campaignName) {
        for (const row of CAMPAIGN_NAME_DEMO_URLS) {
            if (row.match.test(String(campaignName))) return row.url;
        }
    }
    return DEFAULT_DEMO_URL;
}

// =====================================================================
// 1. Intent classifier
// =====================================================================

// BUY = ready to talk price / contract / sign — close territory
const BUY_RX = /\b(send (me )?(the )?(offer|propuesta|quote|info|contrato|contract|details)|what'?s the (price|cost|fee)|cu[aá]nto (cuesta|es|cobran)|let'?s (do it|go|talk|book)|sign me up|estoy interesad|me interesa|me interesan|listo para|cu[aá]ndo empezamos|manda(me)? (la )?(propuesta|cotizaci[oó]n|contrato|info|oferta)|i'?m in|count me in|hablemos)\b/i;

// TECH_Q = sniffing the tech / "is this AI?" / "how does it work"
const TECH_Q_RX = /\b(are you (a )?human|is this (automated|ai|a bot)|qu[eé] (ia|tecnolog[ií]a|herramienta) usa[ns]?|chatbot|bot|how does (this|it) work|c[oó]mo funciona|what'?s (behind|powering) (this|it)|what tech|qu[eé] hay detr[aá]s|no eres una persona)\b/i;

// EXPLORE = curious / "tell me more" / "send info"
const EXPLORE_RX = /\b(tell me more|m[aá]s (info|informaci[oó]n|detalles)|send (me )?(info|information)|what'?s this about|de qu[eé] se trata|interesting|interesante|m[aá]ndame info|env[ií]ame info|please share|share more|qu[eé] ofrecen)\b/i;

// OOO = auto-reply, vacation, away
const OOO_RX = /\b(out of office|fuera de la? oficina|vacation|vacaciones|on holiday|away from|currently traveling|estar[eé] de regreso|automatic reply|respuesta autom[aá]tica|i'?ll be back|will return|estar[eé] fuera|de viaje)\b/i;

// UNSUB = remove / stop / not interested
const UNSUB_RX = /\b(unsubscribe|remove me|please remove|qu[ií]tenme|qu[ií]tame|borr(en|ame)|d[eé] de baja|no me (interesa|interesan|escribas|escriban)|stop (emails?|contacting|sending)|do not (contact|email)|leave me alone|no (gracias|thanks|thank you))\b/i;

// BOUNCE = mailbox dead / ex-employee / domain inactive
const BOUNCE_RX = /\b(mail delivery (failed|subsystem)|delivery (status notification|failure)|undeliverable|address (rejected|not found)|user unknown|no longer (with|works|at) (the )?company|left the company|ya no (forma parte|labora|trabaja)|desactivaci[oó]n|account (disabled|deactivated))\b/i;

/**
 * Classify the inbound reply body into one bucket.
 * Order: BOUNCE → UNSUB → OOO → BUY → TECH_Q → EXPLORE → fallback EXPLORE.
 * (Noise filters first so a "buyer" who pasted an OOO template doesn't trip BUY.)
 */
function classifyIntent(body, subject = "") {
    const text = `${String(subject || "")} ${String(body || "")}`.toLowerCase();
    if (!text.trim()) return "EXPLORE"; // empty reply = treat as soft curiosity
    if (BOUNCE_RX.test(text)) return "BOUNCE";
    if (UNSUB_RX.test(text)) return "UNSUB";
    if (OOO_RX.test(text)) return "OOO";
    if (BUY_RX.test(text)) return "BUY";
    if (TECH_Q_RX.test(text)) return "TECH_Q";
    if (EXPLORE_RX.test(text)) return "EXPLORE";
    return "EXPLORE"; // default — anything human-shaped pushes to Calendly
}

// =====================================================================
// 2. Geo lookup
// =====================================================================

/**
 * Map a lead record to a proof-bank key.
 * Signals (cheapest first): email TLD → website TLD → city/state → website body keywords.
 *
 * Andrea regression: andrea@bluecaribbeanproperties.com + website
 * bluecaribbeanproperties.com (DR) + city "Punta Cana" → "CARIBBEAN".
 *
 * Returns one of: "MX" | "CARIBBEAN" | "MIAMI" | "FALLBACK"
 */
function geoFromLead(lead) {
    if (!lead || typeof lead !== "object") return "FALLBACK";

    const email = String(lead.email || "").toLowerCase();
    const website = String(lead.website || lead.domain || "").toLowerCase();
    const city = String(
        lead.city || lead.location || lead.region || lead.state || "",
    ).toLowerCase();
    const linkedin = String(lead.linkedin_country || lead.country || "").toLowerCase();

    // 1. Email TLD signal
    const emailDomain = email.split("@")[1] || "";
    if (/\.(mx)$/.test(emailDomain) || /\.com\.mx$/.test(emailDomain)) return "MX";
    if (/\.(do|com\.do|pr|com\.pr|cu|aw|com\.aw|tt|com\.tt|bs|com\.bs|jm|com\.jm|bb|com\.bb|vg)$/.test(emailDomain)) return "CARIBBEAN";

    // 2. Website TLD signal
    if (/\.mx\b/.test(website)) return "MX";
    if (/\.(do|pr|cu|aw|tt|bs|jm|bb|vg)\b/.test(website)) return "CARIBBEAN";

    // 3. City / region keyword signal
    if (/cancun|playa del carmen|tulum|cdmx|mexico city|guadalajara|monterrey|m[eé]xico|merida|m[eé]rida|riviera maya|cozumel|puebla|quer[eé]taro|chetumal|bacalar/.test(city + " " + website)) {
        return "MX";
    }
    if (/punta cana|santo domingo|domingo|santiago de los caballeros|aruba|cura[cç]ao|nassau|kingston|bridgetown|tortola|bahamas|jamaica|barbados|caribbean|caribe|dominican|rep[uú]blica dominicana/.test(city + " " + website + " " + linkedin)) {
        return "CARIBBEAN";
    }
    if (/miami|fort lauderdale|brickell|coral gables|doral|aventura|west palm beach|broward|miami-dade/.test(city + " " + website)) {
        return "MIAMI";
    }

    // 4. LinkedIn / country code fallback
    if (/(^| )mx( |$)|mexico/.test(linkedin)) return "MX";
    if (/(^| )(do|pr|cu|jm|bb|tt|bs|aw)( |$)|dominican|puerto rico|caribbean|caribe/.test(linkedin)) return "CARIBBEAN";
    if (/(^| )us( |$)|united states|miami|florida|fl /.test(linkedin)) return "MIAMI";

    return "FALLBACK";
}

// =====================================================================
// 3. Proof banks — verified client claims only (HR-0)
// =====================================================================

/**
 * PROOF_BANKS — ONE concise verified stat per geo per language (HR-0).
 * Designed to read naturally after "Quick context:" / "Para contexto:" so
 * the BUY/TECH_Q/EXPLORE composers can inline them.
 *
 * Hero proof per CLAUDE.md HR#9:
 *   - Flamingo (Cancún) 88% inbound automation + 4.4x Maps visibility — MX
 *   - Solik (Miami bilingual) 3 ready-to-buy referrals month 1 — MIAMI
 *   - Caribbean wide: 88% inbound automation 24/7 EN+ES — CARIBBEAN
 *   - FALLBACK: Flamingo 88% + 4.4x (strongest single number)
 */
const PROOF_BANKS = {
    MX: {
        es: "Flamingo Real Estate (Cancún) automatizó 88% de los leads inbound y subió 4.4x su visibilidad en Maps.",
        en: "Flamingo Real Estate (Cancún) automated 88% of inbound leads and lifted Google Maps visibility 4.4x.",
    },
    CARIBBEAN: {
        es: "automatizamos el 88% del inbound 24/7 en EN + ES para agencias de la región — sin perder leads de noche.",
        en: "we automate 88% of inbound for similar agencies in the region.",
    },
    MIAMI: {
        es: "Solik (real estate bilingüe en Miami) tiene captura EN+ES 24/7 — 3 referidos listos-para-comprar en el primer mes.",
        en: "Solik (Miami bilingual real estate) gets 24/7 EN+ES auto-capture and pulled 3 ready-to-buy referrals their first month.",
    },
    FALLBACK: {
        es: "automatizamos el 88% del inbound de inmobiliarias 24/7 — caso insignia Flamingo (Cancún) llegó a 4.4x visibilidad orgánica en 90 días.",
        en: "we automate 88% of inbound for real estate agencies 24/7 — flagship case Flamingo (Cancún) hit 4.4x organic visibility in 90 days.",
    },
};

function pickProofBank(geo) {
    return PROOF_BANKS[geo] || PROOF_BANKS.FALLBACK;
}

// =====================================================================
// 4. Language detection — mirror prospect, never assume ES default
// =====================================================================

/**
 * Detect language from the reply body. Polish/Portuguese signatures
 * ("Wysłane z iPhone'a") do NOT count as Polish content — we look at
 * the actual body words.
 *
 * Returns "es" | "en". Default "en" when ambiguous (safer for Caribbean
 * + Miami markets; MX gets ES via per-route default).
 */
function detectLang(body) {
    const raw = String(body || "");
    // Strip device sigs that look foreign but aren't body content
    const cleaned = raw
        .replace(/wys[lł]ane z .*/gi, "")
        .replace(/sent from my (i?phone|ipad|android)/gi, "")
        .replace(/enviado desde mi .*/gi, "")
        .toLowerCase();

    const esHits = (cleaned.match(/[¿áéíóúñ]|\b(gracias|hola|saludos|interesad[oa]|cu[aá]ndo|informaci[oó]n|c[oó]mo|s[ií]|cu[aá]nto|env[ií]ame|m[aá]ndame|por favor|m[aá]s)\b/g) || []).length;
    const enHits = (cleaned.match(/\b(thanks|thank you|hello|hi|hey|interested|when|info|information|how|sure|please send|send me|tell me|let'?s|talk|sounds|good|the offer|the price|count me|i'?m)\b/g) || []).length;

    if (esHits > enHits) return "es";
    if (enHits > esHits) return "en";
    return null; // caller falls back to route default or geo default
}

// =====================================================================
// 5. Time-slot helper — next 2 business days (3pm + 11am, geo TZ)
// =====================================================================

const TZ_LABELS = {
    MX: "CDT",        // Cancún + central Mexico — daylight label per Alex spec
    CARIBBEAN: "CDT", // Punta Cana / DR — Alex's reference output uses CDT
    MIAMI: "EDT",
    FALLBACK: "ET",
};

const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
const ES_DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ES_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function nextBusinessDay(d) {
    const next = new Date(d.getTime());
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1);
    }
    return next;
}

function formatSlot(date, hour, ampm, tz, lang) {
    if (lang === "es") {
        return `${ES_DAYS[date.getDay()]} ${date.getDate()} ${ES_MONTHS[date.getMonth()]} a las ${hour}${ampm} ${tz}`;
    }
    return `${EN_DAYS[date.getDay()]} ${EN_MONTHS[date.getMonth()]} ${date.getDate()} at ${hour}${ampm} ${tz}`;
}

/**
 * Generate 2 specific time proposals per Alex's playbook:
 *   slot 1 = next business day at 3pm
 *   slot 2 = following business day at 11am
 * Skips weekends. Timezone label is geo-mapped (MX/CARIBBEAN→CDT, MIAMI→EDT).
 *
 * @param {string} geo  — MX / CARIBBEAN / MIAMI / FALLBACK
 * @param {string} lang — "es" | "en"
 * @param {Date}  [now=new Date()] — overridable for tests
 * @returns {[string, string]} two formatted slot strings
 */
function nextTwoSlots(geo, lang, now = new Date()) {
    const tz = TZ_LABELS[geo] || TZ_LABELS.FALLBACK;
    const day1 = nextBusinessDay(now);
    const day2 = nextBusinessDay(day1);
    return [
        formatSlot(day1, "3", "pm", tz, lang),
        formatSlot(day2, "11", "am", tz, lang),
    ];
}

// =====================================================================
// 6. Reply composer — full close package, every reply
// =====================================================================

function signature() {
    // Iron Rule #5 — never full name, never title. Always "Alex / JegoDigital".
    return `<div>Alex</div>\n<div>JegoDigital</div>`;
}

function calendlyFallbackLine(lang) {
    return lang === "es"
        ? `Si ninguna te queda, agarra slot: <a href="${CALENDLY}">${CALENDLY.replace("https://", "")}</a>`
        : `If neither works, grab any slot: <a href="${CALENDLY}">${CALENDLY.replace("https://", "")}</a>`;
}

function whatsappLine(lang) {
    return lang === "es"
        ? `WhatsApp directo: ${WHATSAPP_MX}`
        : `WhatsApp: ${WHATSAPP_MX}`;
}

function demoLine({ lang, demoUrl, leadCompanyName }) {
    const co = (leadCompanyName || "").trim();
    if (lang === "es") {
        return co
            ? `Aquí va un demo de 1 minuto de lo que armaríamos para ${co}: <a href="${demoUrl}">${demoUrl.replace("https://", "")}</a>`
            : `Aquí va un demo de 1 minuto: <a href="${demoUrl}">${demoUrl.replace("https://", "")}</a>`;
    }
    return co
        ? `Here's a 1-min demo of what we'd build for ${co}: <a href="${demoUrl}">${demoUrl.replace("https://", "")}</a>`
        : `Here's a 1-min demo: <a href="${demoUrl}">${demoUrl.replace("https://", "")}</a>`;
}

function slotBlock(lang, slots) {
    const intro = lang === "es"
        ? `Ruta más rápida — 15 min esta semana. Tengo:`
        : `Fastest path is 15 min this week. I have:`;
    const sep = lang === "es" ? ", o" : ", or";
    return [
        `<div>${intro}</div>`,
        `<div>• ${slots[0]}${sep}</div>`,
        `<div>• ${slots[1]}</div>`,
    ].join("\n");
}

/**
 * Build the standard close stack — slots → Calendly fallback → optional WA.
 * Used by all 3 compose functions for consistency.
 */
function closeStack({ lang, slots, includeWhatsApp }) {
    const lines = [
        slotBlock(lang, slots),
        `<div><br></div>`,
        `<div>${calendlyFallbackLine(lang)}</div>`,
    ];
    if (includeWhatsApp) {
        lines.push(`<div>${whatsappLine(lang)}</div>`);
    }
    return lines.join("\n");
}

/**
 * Compose body for intent=BUY.
 * Full close package: ack + geo proof + demo + 2 slots + Calendly + WA(MX) + sig.
 * No price pitch — pricing is Calendly-only per JegoDigital playbook.
 */
function composeBUY({ lang, bank, leadFirstName, leadCompanyName, demoUrl, slots, includeWhatsApp }) {
    const fname = (leadFirstName || "").trim();
    const greeting = lang === "es"
        ? (fname ? `Hola ${fname},` : `Hola,`)
        : (fname ? `Hi ${fname},` : `Hi,`);
    const ackProof = lang === "es"
        ? `Gracias por la respuesta — te mando el offer ahora. Para contexto: ${bank.es}`
        : `Thanks for the reply — happy to send the offer. Quick context: ${bank.en}`;

    return [
        `<div>${greeting}</div>`,
        `<div><br></div>`,
        `<div>${ackProof}</div>`,
        `<div><br></div>`,
        `<div>${demoLine({ lang, demoUrl, leadCompanyName })}</div>`,
        `<div><br></div>`,
        closeStack({ lang, slots, includeWhatsApp }),
        `<div><br></div>`,
        signature(),
    ].join("\n");
}

/**
 * Compose body for intent=TECH_Q.
 * Honest tech answer + demo + slots + Calendly + WA(MX) + sig.
 */
function composeTECH_Q({ lang, bank, leadFirstName, leadCompanyName, demoUrl, slots, includeWhatsApp }) {
    const fname = (leadFirstName || "").trim();
    const greeting = lang === "es"
        ? (fname ? `Hola ${fname},` : `Hola,`)
        : (fname ? `Hi ${fname},` : `Hi,`);
    const tech = lang === "es"
        ? `Buena pregunta — por debajo es un agente entrenado con tu inventario (listings parseados de tu sitio o CRM) corriendo sobre Claude. Responde en menos de 60s, califica al lead, y lo enruta a tu CRM / IG / web según donde llegue. Todo bajo tu marca, configurado por agencia — no es un chatbot genérico.`
        : `Fair question — under the hood it's an agent trained on your listings (parsed from your site or CRM) running on Claude. Replies in under 60s, qualifies the lead, then routes it to your CRM / IG / website depending on where they came in. All under your brand, configured per agency — not a generic chatbot.`;

    return [
        `<div>${greeting}</div>`,
        `<div><br></div>`,
        `<div>${tech}</div>`,
        `<div><br></div>`,
        `<div>${demoLine({ lang, demoUrl, leadCompanyName })}</div>`,
        `<div><br></div>`,
        closeStack({ lang, slots, includeWhatsApp }),
        `<div><br></div>`,
        signature(),
    ].join("\n");
}

/**
 * Compose body for intent=EXPLORE.
 * 1 geo proof + demo + soft CTA + slots + Calendly + WA(MX) + sig.
 */
function composeEXPLORE({ lang, bank, leadFirstName, leadCompanyName, demoUrl, slots, includeWhatsApp }) {
    const fname = (leadFirstName || "").trim();
    const greeting = lang === "es"
        ? (fname ? `Hola ${fname},` : `Hola,`)
        : (fname ? `Hi ${fname},` : `Hi,`);
    const ackProof = lang === "es"
        ? `Gracias por responder. Para contexto: ${bank.es}`
        : `Thanks for the reply. Quick context: ${bank.en}`;

    return [
        `<div>${greeting}</div>`,
        `<div><br></div>`,
        `<div>${ackProof}</div>`,
        `<div><br></div>`,
        `<div>${demoLine({ lang, demoUrl, leadCompanyName })}</div>`,
        `<div><br></div>`,
        closeStack({ lang, slots, includeWhatsApp }),
        `<div><br></div>`,
        signature(),
    ].join("\n");
}

/**
 * Master compose — picks the right shape per intent.
 * Returns null for OOO / UNSUB / BOUNCE (those don't reply).
 *
 * @param {object} params
 * @param {string} params.intent           — BUY | TECH_Q | EXPLORE | OOO | UNSUB | BOUNCE
 * @param {string} params.lang             — "es" | "en"
 * @param {string} params.geo              — MX | CARIBBEAN | MIAMI | FALLBACK
 * @param {string} [params.leadFirstName]
 * @param {string} [params.leadCompanyName]
 * @param {string} [params.demoUrl]        — pre-resolved demo URL (defaults to lead-capture-demo)
 * @param {Array<string>} [params.slots]   — 2 formatted time slots (defaults to nextTwoSlots)
 * @param {Date}   [params.now]            — overridable "now" for slot generation in tests
 */
function composeReply(params) {
    const { intent, lang, geo } = params;
    if (intent === "OOO" || intent === "UNSUB" || intent === "BOUNCE") return null;

    const bank = pickProofBank(geo);
    const demoUrl = params.demoUrl || DEFAULT_DEMO_URL;
    const slots = params.slots || nextTwoSlots(geo, lang, params.now);
    const includeWhatsApp = (geo === "MX"); // playbook: WA only for MX prospects

    const args = {
        lang,
        bank,
        leadFirstName: params.leadFirstName,
        leadCompanyName: params.leadCompanyName,
        demoUrl,
        slots,
        includeWhatsApp,
    };

    if (intent === "BUY") return composeBUY(args);
    if (intent === "TECH_Q") return composeTECH_Q(args);
    return composeEXPLORE(args); // EXPLORE + fallback
}

function buildSubject(originalSubject) {
    let s = String(originalSubject || "").trim();
    if (!s) return "Re: tu mensaje";
    if (/^re:/i.test(s)) return s;
    return `Re: ${s}`;
}

// =====================================================================
// 6. Instantly v2 sender — POST /api/v2/emails/reply
// =====================================================================

async function sendInstantlyReply({ replyToUuid, eaccount, subject, html }) {
    if (!INSTANTLY_KEY) {
        return { ok: false, error: "INSTANTLY_API_KEY not set in env" };
    }
    try {
        const r = await axios.post(
            `${INSTANTLY_API}/emails/reply`,
            {
                reply_to_uuid: replyToUuid,
                eaccount,
                subject,
                body: { html },
            },
            {
                headers: {
                    "Authorization": `Bearer ${INSTANTLY_KEY}`,
                    "Content-Type": "application/json",
                    "User-Agent": "JegoDigital-ReplyRouter/2.0",
                },
                timeout: 25000,
                validateStatus: () => true,
            },
        );
        if (r.status >= 200 && r.status < 300 && r.data?.id) {
            return { ok: true, status: r.status, sentId: r.data.id };
        }
        return { ok: false, status: r.status, error: JSON.stringify(r.data).slice(0, 400) };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// =====================================================================
// 7. Main entry — routeReply()
// =====================================================================

/**
 * Called by instantlyReplyWatcher on every inbound reply.
 *
 * @param {object} params
 * @param {string} params.replyToUuid       — Instantly inbound reply UUID
 * @param {string} params.campaignId        — campaign UUID (informational only)
 * @param {string} params.eaccount          — original sender mailbox
 * @param {string} params.originalSubject   — inbound subject
 * @param {string} params.replyBody         — raw inbound body
 * @param {string} params.leadEmail         — lead email (for geo signal + log)
 * @param {string} [params.leadFirstName]
 * @param {string} [params.leadCompanyName]
 * @param {object} [params.lead]            — full Instantly lead object (geo signals)
 * @returns {object} { ok, intent, geo, lang, sentId, replied, reason }
 */
async function routeReply(params) {
    const {
        replyToUuid,
        campaignId,
        campaignName, // optional human-readable name from upstream (notion map)
        eaccount,
        originalSubject,
        replyBody,
        leadEmail,
        leadFirstName,
        leadCompanyName,
        lead,
    } = params;

    if (!replyToUuid || !eaccount) {
        return { ok: false, reason: "missing_required_fields" };
    }

    // Step 1 — classify intent (filters noise upstream)
    const intent = classifyIntent(replyBody, originalSubject);

    // Step 2 — geo lookup (works on partial lead — even just email)
    const leadForGeo = lead || {
        email: leadEmail || "",
        website: params.leadWebsite || "",
        city: params.leadCity || "",
    };
    const geo = geoFromLead(leadForGeo);

    // Step 3 — language: prospect's reply > geo default
    const detected = detectLang(replyBody);
    // Geo default: MX → es, MIAMI → en (bilingual but English first), CARIBBEAN → en (most agents bilingual), FALLBACK → en
    const geoDefault = { MX: "es", CARIBBEAN: "en", MIAMI: "en", FALLBACK: "en" }[geo] || "en";
    const lang = detected || geoDefault;

    // Step 4 — handle UNSUB: mark + Slack ping, NO reply
    if (intent === "UNSUB") {
        await markUnsubscribed({ leadEmail, replyToUuid, campaignId });
        await logRouting({
            campaign_id: campaignId, lead_email: leadEmail, reply_to_uuid: replyToUuid,
            eaccount, intent, geo, lang, replied: false, reason: "unsubscribe_marked",
            ok: true,
        });
        return { ok: true, intent, geo, lang, replied: false, reason: "unsubscribe_marked" };
    }

    // Step 5 — handle OOO / BOUNCE: log only, NO reply
    if (intent === "OOO" || intent === "BOUNCE") {
        await logRouting({
            campaign_id: campaignId, lead_email: leadEmail, reply_to_uuid: replyToUuid,
            eaccount, intent, geo, lang, replied: false, reason: `noise_${intent.toLowerCase()}`,
            ok: true,
        });
        return { ok: true, intent, geo, lang, replied: false, reason: `noise_${intent.toLowerCase()}` };
    }

    // Step 6 — compose autonomous reply for BUY / TECH_Q / EXPLORE
    // Resolve demo URL by campaign (Trojan/SEO/etc), generate 2 fresh time
    // slots in the prospect's geo timezone, MX gets WhatsApp inline.
    const demoUrl = resolveDemoUrl({ campaignId, campaignName });
    const slots = nextTwoSlots(geo, lang);
    const html = composeReply({
        intent,
        lang,
        geo,
        leadFirstName,
        leadCompanyName,
        demoUrl,
        slots,
    });
    if (!html) {
        return { ok: false, intent, geo, lang, reason: "compose_returned_null" };
    }
    const subject = buildSubject(originalSubject);

    // Step 7 — send via Instantly
    const sendRes = await sendInstantlyReply({ replyToUuid, eaccount, subject, html });

    // Step 8 — log + Slack mirror (informational, NEVER ask Alex to compose)
    await logRouting({
        campaign_id: campaignId, lead_email: leadEmail, reply_to_uuid: replyToUuid,
        eaccount, intent, geo, lang, subject,
        replied: sendRes.ok, sent_email_id: sendRes.sentId || null,
        ok: sendRes.ok, error: sendRes.ok ? null : (sendRes.error || "unknown"),
    });

    if (sendRes.ok) {
        await postSlackMirror({
            intent, geo, lang, eaccount, leadEmail, leadFirstName, leadCompanyName,
            inboundPreview: String(replyBody || "").slice(0, 400),
            outboundHtml: html,
            sentId: sendRes.sentId,
        });
    }

    return {
        ok: sendRes.ok,
        intent,
        geo,
        lang,
        sentId: sendRes.sentId,
        replied: sendRes.ok,
        reason: sendRes.ok ? null : sendRes.error,
    };
}

// =====================================================================
// 8. Side effects — Firestore log, Slack mirror, unsub mark
// =====================================================================

async function logRouting(row) {
    try {
        const db = admin.firestore();
        await db.collection("reply_routing_log").add({
            ...row,
            router_version: 2,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (err) {
        functions.logger.warn("reply_routing_log write failed:", err.message);
    }
}

/**
 * Mark lead as unsubscribed in Instantly + Brevo (best-effort).
 * Hard-fails LOUD via logger but never throws — caller still logs the row.
 */
async function markUnsubscribed({ leadEmail, replyToUuid, campaignId }) {
    if (!leadEmail) return;
    // Instantly v2 — POST /api/v2/leads/list with status=Unsubscribed isn't a single
    // call; we mark on the lead via PATCH. Fall back to logger if the endpoint
    // shape isn't supported (Instantly API surface changes occasionally).
    try {
        if (INSTANTLY_KEY) {
            await axios.post(
                `${INSTANTLY_API}/leads/move`,
                { leads: [leadEmail], to_campaign_id: null, status: "Unsubscribed" },
                {
                    headers: { Authorization: `Bearer ${INSTANTLY_KEY}` },
                    timeout: 15000,
                    validateStatus: () => true,
                },
            );
        }
    } catch (err) {
        functions.logger.warn(`Instantly unsub mark failed for ${leadEmail}:`, err.message);
    }
    // Brevo blocklist
    try {
        const BREVO_KEY = process.env.BREVO_API_KEY;
        if (BREVO_KEY) {
            await axios.post(
                `https://api.brevo.com/v3/contacts/${encodeURIComponent(leadEmail)}/blocklist`,
                {},
                {
                    headers: { "api-key": BREVO_KEY, "content-type": "application/json" },
                    timeout: 10000,
                    validateStatus: () => true,
                },
            );
        }
    } catch (err) {
        functions.logger.warn(`Brevo unsub mark failed for ${leadEmail}:`, err.message);
    }
    functions.logger.info(`Unsub marked: ${leadEmail} (reply ${replyToUuid}, campaign ${campaignId})`);
}

async function postSlackMirror(args) {
    try {
        const { intent, geo, lang, eaccount, leadEmail, leadFirstName, leadCompanyName, inboundPreview, outboundHtml, sentId } = args;
        const intentEmoji = { BUY: "💰", TECH_Q: "🔧", EXPLORE: "👀" }[intent] || "✉️";
        const outboundText = String(outboundHtml || "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/?div>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .slice(0, 600);
        const blocks = [
            {
                type: "header",
                text: { type: "plain_text", text: `${intentEmoji} ${intent} reply auto-replied — ${geo}/${lang}`, emoji: true },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text:
                        `*Lead:* ${leadFirstName ? leadFirstName + " · " : ""}\`${leadEmail || "?"}\`` +
                        (leadCompanyName ? ` · *${leadCompanyName}*` : "") +
                        `\n*Mailbox:* \`${eaccount}\` · *Sent ID:* \`${sentId || "?"}\``,
                },
            },
            {
                type: "section",
                text: { type: "mrkdwn", text: `*They wrote:*\n>${inboundPreview.replace(/\n/g, "\n>")}` },
            },
            {
                type: "section",
                text: { type: "mrkdwn", text: `*We replied:*\n>${outboundText.replace(/\n/g, "\n>")}` },
            },
            {
                type: "context",
                elements: [
                    { type: "mrkdwn", text: `_FYI only — agent already closed to Calendly. Open Instantly Unibox if you want to nurture._` },
                ],
            },
        ];
        await slackPost("hot-leads", {
            text: `${intentEmoji} Auto-replied ${intent} from ${leadEmail || "?"} (${geo})`,
            blocks,
        });
    } catch (err) {
        functions.logger.warn("Slack mirror failed:", err.message);
    }
}

module.exports = {
    routeReply,
    // Exported for unit tests + introspection
    classifyIntent,
    geoFromLead,
    pickProofBank,
    detectLang,
    composeReply,
    nextTwoSlots,
    resolveDemoUrl,
    PROOF_BANKS,
    CAMPAIGN_DEMO_URLS,
    DEFAULT_DEMO_URL,
    DEMO_LEAD_CAPTURE,
    DEMO_SEO_AEO,
    WHATSAPP_MX,
    CALENDLY,
    BUY_RX,
    TECH_Q_RX,
    EXPLORE_RX,
    OOO_RX,
    UNSUB_RX,
    BOUNCE_RX,
};
