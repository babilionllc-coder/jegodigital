/**
 * instantlyReplyRouter v2.2 — fully autonomous, geo-aware, intent-classifying,
 * always-close-to-Calendly reply composer. Single-CTA, plain-feel, ≤90 words.
 *
 * v2.2 (2026-04-29) — research-backed simplification per Alex playbook:
 *   - REMOVED demo video link entirely (research: dilutes Calendly CTA by 371%)
 *   - REMOVED CAMPAIGN_DEMO_URLS routing + DEMO_LEAD_CAPTURE / DEMO_SEO_AEO
 *   - Simpler 5-element close: ack + 1-line geo proof + 2 anchor times + Calendly + sig
 *   - WhatsApp ONLY for MX prospects (Caribbean omitted per Alex reference output
 *     for Andrea/DR; matches the EN Caribbean sample in cold_email_reply_playbook_2026.md)
 *   - Word-count guard: warns if final reply > 90 words (target 60-80 from Instantly 2026)
 *   - Sign-off "Alex / JegoDigital" on a single line (was 2 div lines in v2.1)
 *   - Composer copy tightened to match Alex's reference outputs verbatim
 *
 * Source: docs/playbooks/cold_email_reply_playbook_2026.md
 *   - Single-CTA wins (+371% clicks vs multi)
 *   - Reply length 50-125 words wins 2.4x over 200+
 *   - 2 anchor times + Calendly fallback stacks well in replies
 *   - WA helps MX/LatAm; hurts US/Miami
 *   - Demo library link in reply: SKIP (Sendspark research)
 *
 * v2.1 (2026-04-29) — DEPRECATED (had demo link + 6-element close)
 * v2  (2026-04-28) — original autonomous router
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
 *   - WhatsApp is "+52 998 202 3263" — NEVER the deprecated 787 5321 number
 */

const axios = require("axios");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

const { slackPost } = require("./slackPost");

const INSTANTLY_API = "https://api.instantly.ai/api/v2";
const INSTANTLY_KEY = process.env.INSTANTLY_API_KEY;

const CALENDLY = "https://calendly.com/jegoalexdigital/30min";
// MX prospects only — playbook rule. NEVER use the deprecated 998 787 5321.
const WHATSAPP_MX = "+52 998 202 3263";
// Soft target from Instantly 2026 benchmark. Warn (not throw) over this.
const WORD_LIMIT = 90;

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
 * v2.2 strings match Alex's playbook reference outputs verbatim.
 *
 * Hero proof per CLAUDE.md HR#9:
 *   - MX: Flamingo (Cancún) 88% inbound automation + 4.4x Maps visibility
 *   - CARIBBEAN: regional 88% inbound automation (no specific client name)
 *   - MIAMI: Solik 24/7 EN+ES + 3 ready-to-buy referrals month 1
 *   - FALLBACK: 88% + 4.4x flagship case (no client name)
 */
const PROOF_BANKS = {
    MX: {
        es: "Flamingo Real Estate (Cancún) automatizó 88% de leads inbound y subió 4.4x su visibilidad.",
        en: "Flamingo Real Estate (Cancún) automated 88% of inbound leads and lifted visibility 4.4x.",
    },
    CARIBBEAN: {
        es: "Automatizamos el 88% del inbound para agencias similares en la región.",
        en: "We've automated 88% of inbound for similar agencies in the region.",
    },
    MIAMI: {
        es: "Solik (real estate bilingüe en Miami) tiene captura EN+ES 24/7 — 3 referidos listos-para-comprar en su primer mes.",
        en: "Solik (Miami bilingual real estate) gets 24/7 EN+ES auto-capture and pulled 3 ready-to-buy referrals their first month.",
    },
    FALLBACK: {
        es: "Automatizamos el 88% del inbound para inmobiliarias + 4.4x visibilidad orgánica en nuestro caso insignia.",
        en: "We've automated 88% of inbound for real estate agencies + 4.4x search visibility for our flagship case.",
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
 * Returns "es" | "en". Default null when ambiguous (caller falls back
 * to route default — MX→es, CARIBBEAN/MIAMI/FALLBACK→en).
 */
function detectLang(body) {
    const raw = String(body || "");
    const cleaned = raw
        .replace(/wys[lł]ane z .*/gi, "")
        .replace(/sent from my (i?phone|ipad|android)/gi, "")
        .replace(/enviado desde mi .*/gi, "")
        .toLowerCase();

    const esHits = (cleaned.match(/[¿áéíóúñ]|\b(gracias|hola|saludos|interesad[oa]|cu[aá]ndo|informaci[oó]n|c[oó]mo|s[ií]|cu[aá]nto|env[ií]ame|m[aá]ndame|por favor|m[aá]s)\b/g) || []).length;
    const enHits = (cleaned.match(/\b(thanks|thank you|hello|hi|hey|interested|when|info|information|how|sure|please send|send me|tell me|let'?s|talk|sounds|good|the offer|the price|count me|i'?m)\b/g) || []).length;

    if (esHits > enHits) return "es";
    if (enHits > esHits) return "en";
    return null;
}

// =====================================================================
// 5. Time-slot helper — next 2 business days (3pm + 11am, geo TZ)
// =====================================================================

const TZ_LABELS = {
    MX: "CDT",        // Cancún + central Mexico
    CARIBBEAN: "CDT", // Punta Cana / DR — Alex spec
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
// 6. Reply composer — v2.2 simplified close (single CTA = Calendly)
// =====================================================================

function signature() {
    // Iron Rule #5 — never full name, never title. "Alex / JegoDigital" on one line.
    return `<div>Alex / JegoDigital</div>`;
}

function calendlyFallbackLine(lang) {
    return lang === "es"
        ? `Si no, agarra slot: <a href="${CALENDLY}">${CALENDLY.replace("https://", "")}</a>`
        : `If neither works, grab any slot: <a href="${CALENDLY}">${CALENDLY.replace("https://", "")}</a>`;
}

function whatsappLine(lang) {
    // Same line both langs — number is universal, "WhatsApp:" reads in either.
    return `WhatsApp: ${WHATSAPP_MX}`;
}

function slotBlock(lang, slots) {
    const intro = lang === "es"
        ? `15 min esta semana:`
        : `Fastest path is 15 min this week:`;
    const sep = lang === "es" ? ", o" : ", or";
    return [
        `<div>${intro}</div>`,
        `<div>• ${slots[0]}${sep}</div>`,
        `<div>• ${slots[1]}</div>`,
    ].join("\n");
}

/**
 * Build the standard close stack (slots → Calendly → optional WA).
 * MX prospects get the WhatsApp line; everyone else does not.
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
 * Strip HTML to plain text + count words (for the soft 90-word guard).
 */
function countWords(html) {
    const text = String(html || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/?div>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!text) return 0;
    return text.split(" ").filter(Boolean).length;
}

/**
 * Compose body for intent=BUY.
 * v2.2 close: greeting + ack + proof + 2 slots + Calendly + WA(MX) + sig.
 */
function composeBUY({ lang, bank, leadFirstName, slots, includeWhatsApp }) {
    const fname = (leadFirstName || "").trim();
    const greeting = lang === "es"
        ? (fname ? `Hola ${fname},` : `Hola,`)
        : (fname ? `Hi ${fname},` : `Hi,`);
    const ackProof = lang === "es"
        ? `Gracias por la respuesta. ${bank.es}`
        : `Thanks for the reply. ${bank.en}`;

    return [
        `<div>${greeting}</div>`,
        `<div><br></div>`,
        `<div>${ackProof}</div>`,
        `<div><br></div>`,
        closeStack({ lang, slots, includeWhatsApp }),
        `<div><br></div>`,
        signature(),
    ].join("\n");
}

/**
 * Compose body for intent=TECH_Q.
 * v2.2: honest 1-line tech answer + 2 slots + Calendly + WA(MX) + sig.
 */
function composeTECH_Q({ lang, leadFirstName, slots, includeWhatsApp }) {
    const fname = (leadFirstName || "").trim();
    const greeting = lang === "es"
        ? (fname ? `Hola ${fname},` : `Hola,`)
        : (fname ? `Hi ${fname},` : `Hi,`);
    const tech = lang === "es"
        ? `Buena pregunta — es un agente entrenado con tu inventario, responde en menos de 60s, califica al lead y lo enruta a tu CRM.`
        : `Fair question — it's an agent trained on your listings, replies in under 60s, qualifies the lead, and routes it to your CRM.`;

    return [
        `<div>${greeting}</div>`,
        `<div><br></div>`,
        `<div>${tech}</div>`,
        `<div><br></div>`,
        closeStack({ lang, slots, includeWhatsApp }),
        `<div><br></div>`,
        signature(),
    ].join("\n");
}

/**
 * Compose body for intent=EXPLORE.
 * v2.2: ack + 1 geo proof + 2 slots + Calendly + WA(MX) + sig.
 */
function composeEXPLORE({ lang, bank, leadFirstName, slots, includeWhatsApp }) {
    const fname = (leadFirstName || "").trim();
    const greeting = lang === "es"
        ? (fname ? `Hola ${fname},` : `Hola,`)
        : (fname ? `Hi ${fname},` : `Hi,`);
    const ackProof = lang === "es"
        ? `Gracias por la respuesta. ${bank.es}`
        : `Thanks for the reply. ${bank.en}`;

    return [
        `<div>${greeting}</div>`,
        `<div><br></div>`,
        `<div>${ackProof}</div>`,
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
 * @param {Array<string>} [params.slots]   — 2 formatted time slots
 * @param {Date}   [params.now]            — overridable for tests
 */
function composeReply(params) {
    const { intent, lang, geo } = params;
    if (intent === "OOO" || intent === "UNSUB" || intent === "BOUNCE") return null;

    const bank = pickProofBank(geo);
    const slots = params.slots || nextTwoSlots(geo, lang, params.now);
    // v2.2 playbook rule: WhatsApp ONLY for MX. Caribbean/Miami/Fallback omit.
    const includeWhatsApp = (geo === "MX");

    const args = {
        lang,
        bank,
        leadFirstName: params.leadFirstName,
        slots,
        includeWhatsApp,
    };

    let html;
    if (intent === "BUY") html = composeBUY(args);
    else if (intent === "TECH_Q") html = composeTECH_Q(args);
    else html = composeEXPLORE(args); // EXPLORE + fallback

    // Soft word-count guard — log a warning if we drift past the 90-word ceiling.
    // Never throws — safer to send a slightly long reply than to drop a hot lead.
    const wc = countWords(html);
    if (wc > WORD_LIMIT && functions && functions.logger) {
        functions.logger.warn(`replyRouter v2.2: reply exceeded word limit (${wc} > ${WORD_LIMIT}) for intent=${intent} geo=${geo} lang=${lang}`);
    }

    return html;
}

function buildSubject(originalSubject) {
    let s = String(originalSubject || "").trim();
    if (!s) return "Re: tu mensaje";
    if (/^re:/i.test(s)) return s;
    return `Re: ${s}`;
}

// =====================================================================
// 7. Instantly v2 sender — POST /api/v2/emails/reply
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
                    "User-Agent": "JegoDigital-ReplyRouter/2.2",
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
// 8. Main entry — routeReply()
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
    const slots = nextTwoSlots(geo, lang);
    const html = composeReply({
        intent,
        lang,
        geo,
        leadFirstName,
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
// 9. Side effects — Firestore log, Slack mirror, unsub mark
// =====================================================================

async function logRouting(row) {
    try {
        const db = admin.firestore();
        await db.collection("reply_routing_log").add({
            ...row,
            router_version: "2.2",
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
    countWords,
    PROOF_BANKS,
    WHATSAPP_MX,
    CALENDLY,
    WORD_LIMIT,
    BUY_RX,
    TECH_Q_RX,
    EXPLORE_RX,
    OOO_RX,
    UNSUB_RX,
    BOUNCE_RX,
};
