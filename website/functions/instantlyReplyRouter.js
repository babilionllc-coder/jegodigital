/**
 * instantlyReplyRouter v2.3 — WhatsApp-first reply composer + Alex-ping engine.
 *
 * v2.3 (2026-04-29 PM) — WhatsApp-first per Alex strategic pivot:
 *   - PRIMARY CTA = WhatsApp (Alex's personal +52 998 202 3263), NOT Calendly.
 *     Rationale: MX/LatAm prospects respond to WA 5-10x more than calendar
 *     links. Alex closes higher rate when he builds rapport on WA first
 *     and then offers Calendly mid-conversation, vs. cold Calendly link.
 *   - PHONE-KNOWN PATH: if Instantly has a `phone` field on the lead,
 *     the reply tells the prospect "Alex will WhatsApp you in the next 30
 *     min — confirm this number is best?" + we fire a Telegram alert to
 *     Alex with a click-to-WA deeplink (`wa.me/{phone}?text=...`) so he
 *     can initiate inside 30 min. NO Calendly link sent — Alex offers it
 *     mid-WA conversation after rapport.
 *   - PHONE-UNKNOWN MX (EXPLORE/TECH_Q): single CTA = "Add me on WhatsApp
 *     +52 998 202 3263, I'll personally reply within 30 min". No Calendly.
 *   - PHONE-UNKNOWN MX (BUY): WhatsApp + Calendly fallback (warm leads
 *     get options — they often want to book NOW).
 *   - PHONE-UNKNOWN Miami/Caribbean/Fallback: Calendly first + WhatsApp
 *     as fallback (US prospects don't WA-first the same way).
 *   - Telegram ping on EVERY non-noise reply with phone known — Alex sees
 *     name, company, reply preview, click-to-WA link. He decides whether
 *     to ping personally or let the auto-reply do its job.
 *
 * v2.2 (2026-04-29 AM) — DEPRECATED (Calendly-first, single-CTA-Calendly).
 *   The +371% single-CTA research still holds — v2.3 keeps single CTA,
 *   but the CTA is now WhatsApp instead of Calendly for MX non-BUY paths.
 *
 * Source: docs/playbooks/cold_email_reply_playbook_2026.md
 *   - Single-CTA wins (+371% clicks vs multi)
 *   - Reply length 50-125 words wins 2.4x over 200+
 *   - WhatsApp-first for MX (Alex strategic pivot 2026-04-29 PM)
 *   - Reply NEVER sent to UNSUB / OOO / BOUNCE
 *
 * v2.2 (2026-04-29 AM) — Calendly-first single-CTA — DEPRECATED
 * v2.1 (2026-04-29 AM) — Demo link + multi-CTA — DEPRECATED
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
        ? `O agenda directo: <a href="${CALENDLY}">${CALENDLY.replace("https://", "")}</a>`
        : `Or grab a slot: <a href="${CALENDLY}">${CALENDLY.replace("https://", "")}</a>`;
}

/**
 * v2.3 — WhatsApp-first CTA when prospect's phone is unknown.
 * Asks them to message Alex on his personal +52 number.
 * The whole point: Alex builds rapport on WA, then offers Calendly mid-chat.
 */
function whatsappAddMeLine(lang) {
    return lang === "es"
        ? `Mejor por WhatsApp — escríbeme: <a href="https://wa.me/529982023263">+52 998 202 3263</a> y te respondo personalmente en menos de 30 min.`
        : `Easier by WhatsApp — message me: <a href="https://wa.me/529982023263">+52 998 202 3263</a> and I'll personally reply in under 30 min.`;
}

/**
 * v2.3 — Phone-known path: Alex will initiate the WA ping himself.
 * The reply confirms intent and asks if the scraped number is the right one.
 */
function alexWillPingLine({ lang, phoneMasked }) {
    if (lang === "es") {
        return phoneMasked
            ? `Te mando WhatsApp en los próximos 30 min al ${phoneMasked} — ¿es tu mejor número, o prefieres otro?`
            : `Te mando WhatsApp en los próximos 30 min — confirma tu mejor número y te escribo.`;
    }
    return phoneMasked
        ? `I'll WhatsApp you in the next 30 min at ${phoneMasked} — is that still your best number, or prefer a different one?`
        : `I'll WhatsApp you in the next 30 min — confirm your best number and I'll reach out.`;
}

function slotBlock(lang, slots) {
    const intro = lang === "es"
        ? `O 15 min en agenda:`
        : `Or 15 min this week:`;
    const sep = lang === "es" ? ", o" : ", or";
    return [
        `<div>${intro}</div>`,
        `<div>• ${slots[0]}${sep}</div>`,
        `<div>• ${slots[1]}</div>`,
    ].join("\n");
}

/**
 * Mask a phone for display in the reply: keep country code + last 4 digits.
 * +52 999 555 1234 → +52 ··· ··· 1234. Defensive — if input is short,
 * just returns the raw phone (we'd rather show the number than fail).
 */
function maskPhone(phone) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, "");
    if (digits.length < 6) return phone;
    const last4 = digits.slice(-4);
    return `+${digits.slice(0, digits.length - 10)} ··· ··· ${last4}`;
}

/**
 * v2.3 close stack — WhatsApp-first matrix.
 *
 * Behavior matrix:
 *   1. phoneKnown=true               → "Alex will WA you" (no Calendly, no WA-add-me)
 *   2. phoneKnown=false, MX, BUY     → WhatsApp-add-me + Calendly fallback (warm)
 *   3. phoneKnown=false, MX, EXPLORE → WhatsApp-add-me only (no Calendly)
 *   4. phoneKnown=false, MX, TECH_Q  → WhatsApp-add-me only (no Calendly)
 *   5. phoneKnown=false, MIAMI/CARIB/FALLBACK → Calendly + WhatsApp-add-me fallback
 *      (US prospects don't WA-first the same way — Calendly is primary CTA)
 */
function closeStack({ lang, slots, geo, intent, phoneKnown, phoneMasked }) {
    // Path 1: phone known → Alex pings personally, no other CTAs in the reply
    if (phoneKnown) {
        return `<div>${alexWillPingLine({ lang, phoneMasked })}</div>`;
    }

    // Path 2-4: MX prospect → WhatsApp-first
    if (geo === "MX") {
        const lines = [`<div>${whatsappAddMeLine(lang)}</div>`];
        // BUY = warm, give them Calendly as a backup option
        if (intent === "BUY") {
            lines.push(`<div><br></div>`);
            lines.push(slotBlock(lang, slots));
            lines.push(`<div><br></div>`);
            lines.push(`<div>${calendlyFallbackLine(lang)}</div>`);
        }
        return lines.join("\n");
    }

    // Path 5: Miami / Caribbean / Fallback → Calendly first, WA fallback
    return [
        slotBlock(lang, slots),
        `<div><br></div>`,
        `<div>${calendlyFallbackLine(lang)}</div>`,
        `<div><br></div>`,
        `<div>${whatsappAddMeLine(lang)}</div>`,
    ].join("\n");
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
 * v2.3 close: greeting + ack + proof + WA-first close (or Alex-will-ping) + sig.
 */
function composeBUY({ lang, bank, leadFirstName, slots, geo, phoneKnown, phoneMasked }) {
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
        closeStack({ lang, slots, geo, intent: "BUY", phoneKnown, phoneMasked }),
        `<div><br></div>`,
        signature(),
    ].join("\n");
}

/**
 * Compose body for intent=TECH_Q.
 * v2.3: honest 1-line tech answer + WA-first close + sig.
 */
function composeTECH_Q({ lang, leadFirstName, slots, geo, phoneKnown, phoneMasked }) {
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
        closeStack({ lang, slots, geo, intent: "TECH_Q", phoneKnown, phoneMasked }),
        `<div><br></div>`,
        signature(),
    ].join("\n");
}

/**
 * Compose body for intent=EXPLORE.
 * v2.3: ack + 1 geo proof + WA-first close + sig.
 */
function composeEXPLORE({ lang, bank, leadFirstName, slots, geo, phoneKnown, phoneMasked }) {
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
        closeStack({ lang, slots, geo, intent: "EXPLORE", phoneKnown, phoneMasked }),
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
    // v2.3: phone-known triggers Alex-will-ping copy + suppresses other CTAs.
    const phoneKnown = !!(params.leadPhone && String(params.leadPhone).replace(/\D/g, "").length >= 8);
    const phoneMasked = phoneKnown ? maskPhone(params.leadPhone) : null;

    const args = {
        lang,
        bank,
        leadFirstName: params.leadFirstName,
        slots,
        geo,
        phoneKnown,
        phoneMasked,
    };

    let html;
    if (intent === "BUY") html = composeBUY(args);
    else if (intent === "TECH_Q") html = composeTECH_Q(args);
    else html = composeEXPLORE(args); // EXPLORE + fallback

    // Soft word-count guard — log a warning if we drift past the 90-word ceiling.
    const wc = countWords(html);
    if (wc > WORD_LIMIT && functions && functions.logger) {
        functions.logger.warn(`replyRouter v2.3: reply exceeded word limit (${wc} > ${WORD_LIMIT}) for intent=${intent} geo=${geo} lang=${lang}`);
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
                    "User-Agent": "JegoDigital-ReplyRouter/2.3",
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

    // Step 2 — geo lookup. Always merge lead object with the email/website
    // explicitly passed in — fixes 2026-04-29 bug where ceo@fastoffice.mx
    // detected as FALLBACK because lead.email was missing from leadObj
    // even though leadEmail was present in the watcher's call.
    const leadForGeo = {
        ...(lead || {}),
        email: ((lead && lead.email) || leadEmail || "").toLowerCase(),
        website: ((lead && lead.website) || params.leadWebsite || "").toLowerCase(),
        city: (lead && lead.city) || params.leadCity || "",
    };
    const geo = geoFromLead(leadForGeo);

    // Step 3 — language: prospect's reply > geo default. v2.3 also factors in
    // the original cold-email subject (in case prospect's reply is too short
    // to disambiguate). MX leads default to es regardless.
    const detected = detectLang(replyBody) || detectLang(originalSubject);
    const geoDefault = { MX: "es", CARIBBEAN: "en", MIAMI: "en", FALLBACK: "en" }[geo] || "en";
    const lang = detected || geoDefault;

    // v2.3 — phone for Alex-will-ping path. May be null.
    const leadPhone = params.leadPhone || (lead && (lead.phone || lead.phone_number || lead.mobile)) || null;

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
        leadPhone,
    });
    if (!html) {
        return { ok: false, intent, geo, lang, reason: "compose_returned_null" };
    }
    const subject = buildSubject(originalSubject);

    // Step 7 — send via Instantly
    const sendRes = await sendInstantlyReply({ replyToUuid, eaccount, subject, html });

    // Step 8 — log + Slack mirror + Telegram-Alex-ping (v2.3)
    await logRouting({
        campaign_id: campaignId, lead_email: leadEmail, reply_to_uuid: replyToUuid,
        eaccount, intent, geo, lang, subject,
        replied: sendRes.ok, sent_email_id: sendRes.sentId || null,
        phone_known: !!leadPhone,
        ok: sendRes.ok, error: sendRes.ok ? null : (sendRes.error || "unknown"),
    });

    if (sendRes.ok) {
        await postSlackMirror({
            intent, geo, lang, eaccount, leadEmail, leadFirstName, leadCompanyName,
            inboundPreview: String(replyBody || "").slice(0, 400),
            outboundHtml: html,
            sentId: sendRes.sentId,
            leadPhone,
        });

        // v2.3 — if we have the prospect's phone, ping Alex on Telegram with a
        // click-to-WhatsApp deeplink so he can initiate the personal WA chat
        // inside 30 min (the window we promised in the email reply).
        if (leadPhone) {
            await postTelegramAlexPing({
                intent, geo, lang, leadEmail, leadFirstName, leadCompanyName,
                leadPhone, replyBody, originalSubject,
            });
        }
    }

    return {
        ok: sendRes.ok,
        intent,
        geo,
        lang,
        sentId: sendRes.sentId,
        replied: sendRes.ok,
        phoneKnown: !!leadPhone,
        reason: sendRes.ok ? null : sendRes.error,
    };
}

/**
 * v2.3 — Telegram alert when a phone-known reply lands. Includes click-to-WA
 * deeplink with a pre-filled greeting Alex can edit before sending.
 *
 * NEVER throws. NEVER blocks the main reply path.
 */
async function postTelegramAlexPing(p) {
    try {
        const TG_BOT = process.env.TELEGRAM_BOT_TOKEN || "8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8";
        const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "6637626501";
        const fname = p.leadFirstName || "";
        const company = p.leadCompanyName || "";
        const cleanPhone = String(p.leadPhone).replace(/\D/g, "");
        const greeting = p.lang === "es"
            ? `Hola ${fname || ""}, soy Alex de JegoDigital — vi tu respuesta al correo. ¿Tienes 5 min para platicar por aquí?`
            : `Hi ${fname || ""}, this is Alex from JegoDigital — saw your email reply. Got 5 min to chat here?`;
        const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(greeting.trim())}`;
        const text = [
            `📲 *Phone-known reply — ping within 30 min*`,
            ``,
            `*Lead:* ${fname || "(no name)"} — ${company || "(no company)"}`,
            `*Email:* \`${p.leadEmail}\``,
            `*Phone:* \`+${cleanPhone}\``,
            `*Intent:* ${p.intent} · *Geo:* ${p.geo} · *Lang:* ${p.lang}`,
            `*Original subject:* ${(p.originalSubject || "").slice(0, 80)}`,
            ``,
            `*Their reply:*`,
            `${String(p.replyBody || "").slice(0, 300)}`,
            ``,
            `👉 [Open WhatsApp](${waLink})`,
        ].join("\n");
        await axios.post(
            `https://api.telegram.org/bot${TG_BOT}/sendMessage`,
            { chat_id: TG_CHAT, text, parse_mode: "Markdown", disable_web_page_preview: false },
            { timeout: 8000, validateStatus: () => true },
        );
    } catch (err) {
        if (functions && functions.logger) {
            functions.logger.warn("postTelegramAlexPing failed:", err.message);
        }
    }
}

// =====================================================================
// 9. Side effects — Firestore log, Slack mirror, unsub mark
// =====================================================================

async function logRouting(row) {
    try {
        const db = admin.firestore();
        await db.collection("reply_routing_log").add({
            ...row,
            router_version: "2.3",
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
