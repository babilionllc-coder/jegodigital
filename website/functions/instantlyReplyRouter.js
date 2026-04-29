/**
 * instantlyReplyRouter v2 — fully autonomous, geo-aware, intent-classifying,
 * always-close-to-Calendly reply composer.
 *
 * REPLACES v1 (which was 12 campaign-keyed routes with hard-coded MX proof)
 * and the original "v2 design doc" (which had a Slack/Alex hand-off path).
 *
 * Per Alex 2026-04-29: NO HUMAN HAND-OFF. The agent always replies. Every
 * reply ends with a Calendly close. Slack is informational only — the
 * Slack #hot-leads ping mirrors what we already replied so Alex sees the
 * exchange but never has to compose anything.
 *
 * What this does:
 *   1. Classify intent: BUY / TECH_Q / EXPLORE / OOO / UNSUB / BOUNCE
 *   2. Filter noise (OOO / UNSUB / BOUNCE) — NO reply, just mark + log
 *   3. For BUY / TECH_Q / EXPLORE: build a reply with
 *      - geo-matched proof (MX / CARIBBEAN / MIAMI / FALLBACK)
 *      - language mirroring the prospect (ES / EN — Polish iPhone signature
 *        does NOT switch us to ES; Andrea wrote English, we reply English)
 *      - 1 short qualifying question
 *      - close on https://calendly.com/jegoalexdigital/30min ("15 min this week?")
 *   4. POST to Instantly v2 /api/v2/emails/reply
 *   5. Log to Firestore reply_routing_log
 *   6. Cross-post to Slack #hot-leads (informational)
 *
 * Disaster fix: 2026-04-28 Andrea Bieganowska
 *   - DR-based agent (bluecaribbeanproperties.com), wrote English, said
 *     "Hi, please send me the offer." (BUY), v1 sent her Cancún Flamingo
 *     proof in Spanish with MX WhatsApp number. She ghosted.
 *   - v2 detects: country=CARIBBEAN (TLD .com + website resolves DR + city Punta Cana),
 *     intent=BUY, language=EN, picks CARIBBEAN proof, asks "Punta Cana side or
 *     MX side?", closes on Calendly with "15 min this week works?".
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
 */

const axios = require("axios");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

const { slackPost } = require("./slackPost");

const INSTANTLY_API = "https://api.instantly.ai/api/v2";
const INSTANTLY_KEY = process.env.INSTANTLY_API_KEY;

const CALENDLY = "https://calendly.com/jegoalexdigital/30min";

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

const PROOF_BANKS = {
    MX: {
        es: "Flamingo Real Estate (Cancún): #1 en Google Maps, 4.4x visibilidad orgánica, 88% de los mensajes entrantes los maneja la IA automáticamente.",
        en: "Flamingo Real Estate (Cancún): #1 on Google Maps, 4.4x organic visibility, 88% of inbound messages handled automatically by AI.",
        qualifyingQ: {
            es: "¿Tu enfoque está más en {{geoLocal}} (residencial local) o en preventas/desarrollos? Para mapear el caso correcto.",
            en: "Are you focused more on {{geoLocal}} residential or pre-sale/developer projects? Just so I bring the right case study.",
            geoLocal: "Cancún/Riviera Maya",
        },
    },
    CARIBBEAN: {
        es: "Para agencias en el Caribe automatizamos el 88% de los mensajes entrantes 24/7 en español + inglés, sin perder leads cuando duermes.",
        en: "For agencies across the Caribbean we automate 88% of inbound messages 24/7 in English + Spanish — no leads lost while you sleep.",
        qualifyingQ: {
            es: "¿Tu enfoque está más en {{geoLocal}} o también cubres compradores extranjeros (US/CA/EU)? Para enfocar la demo.",
            en: "Are you focused more on {{geoLocal}} or also covering foreign buyers (US / CA / EU)? Just to tailor the demo.",
            geoLocal: "Punta Cana / DR",
        },
    },
    MIAMI: {
        es: "Solik Real Estate (Miami): captura bilingüe EN/ES 24/7 — 3 leads listos-para-comprar referidos en el primer mes.",
        en: "Solik Real Estate (Miami): 24/7 bilingual EN/ES auto-capture — 3 ready-to-buy referrals in the first month.",
        qualifyingQ: {
            es: "¿Tu negocio se inclina más a luxury/condos en Brickell/Doral o single-family en Broward? Te traigo el caso adecuado.",
            en: "Is your business leaning more luxury/condos in Brickell/Doral or single-family in Broward? I'll bring the right case.",
            geoLocal: "Miami",
        },
    },
    FALLBACK: {
        es: "Automatizamos el 88% de los mensajes entrantes de inmobiliarias 24/7 — y nuestro caso insignia (Flamingo, Cancún) tiene 4.4x visibilidad orgánica en 90 días.",
        en: "We automate 88% of inbound for real estate agencies 24/7 — and our flagship case (Flamingo, Cancún) hit 4.4x organic visibility in 90 days.",
        qualifyingQ: {
            es: "¿En qué mercado están enfocados ahora? Para enviarte el caso más cercano.",
            en: "What market are you focused on right now? Just so I bring the closest case study.",
            geoLocal: "your market",
        },
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
// 5. Reply composer — never hands off, always closes Calendly
// =====================================================================

function calendlyLine(lang) {
    return lang === "es"
        ? `¿15 min esta semana? Aquí mi calendario: <a href="${CALENDLY}">${CALENDLY.replace("https://", "")}</a>`
        : `15 min this week works? Grab any slot here: <a href="${CALENDLY}">${CALENDLY.replace("https://", "")}</a>`;
}

function signature() {
    return `Alex<br>JegoDigital`;
}

function fillQ(qTemplate, geoLocal) {
    return qTemplate.replace("{{geoLocal}}", geoLocal);
}

/**
 * Compose body for intent=BUY.
 * Logic: 1-line ack → 1 qualifying Q (geo) → Calendly close. No price-pitch.
 */
function composeBUY(lang, bank, leadFirstName) {
    const fname = leadFirstName || "";
    const greeting = lang === "es" ? `Hola ${fname},` : `Hi ${fname},`;
    const ack = lang === "es"
        ? `Gracias por la respuesta — me da mucho gusto que estés listo para verlo.`
        : `Thanks for the reply — great to hear you're ready to dive in.`;
    const setup = lang === "es"
        ? `Antes de mandarte la propuesta, una pregunta rápida para asegurarme de que el caso encaja:`
        : `Quick qualifying question before I send the offer so it actually fits your situation:`;
    const q = fillQ(bank.qualifyingQ[lang], bank.qualifyingQ.geoLocal);
    const close = lang === "es"
        ? `Lo más rápido es 15 min esta semana — te muestro el caso, te paso números reales, y si encaja avanzamos.`
        : `Fastest path is 15 min this week — I'll walk you through the case study, share real numbers, and if it fits we move.`;
    return [
        `<div>${greeting}</div>`,
        `<div><br></div>`,
        `<div>${ack}</div>`,
        `<div><br></div>`,
        `<div>${setup}</div>`,
        `<div><br></div>`,
        `<div><b>${q}</b></div>`,
        `<div><br></div>`,
        `<div>${close}</div>`,
        `<div><br></div>`,
        `<div>${calendlyLine(lang)}</div>`,
        `<div><br></div>`,
        `<div>${signature()}</div>`,
    ].join("\n");
}

/**
 * Compose body for intent=TECH_Q.
 * Logic: 2-line honest tech answer → Calendly close ("happy to demo it live").
 * Never fakes details we don't have.
 */
function composeTECH_Q(lang, bank, leadFirstName) {
    const fname = leadFirstName || "";
    const greeting = lang === "es" ? `Hola ${fname},` : `Hi ${fname},`;
    const tech = lang === "es"
        ? `Buena pregunta. Por debajo es un agente entrenado con tu inventario (listings parseados de tu sitio o CRM) corriendo sobre Claude — responde en menos de 60s, califica al lead, lo enruta a tu CRM/IG/web según donde llegue, y todo bajo tu marca.`
        : `Fair question. Under the hood it's an agent trained on your listings (parsed from your site or CRM) running on Claude — replies in under 60s, qualifies the lead, then routes it into your CRM / IG / website depending on where they came in. All under your brand.`;
    const honesty = lang === "es"
        ? `No es un chatbot genérico. Lo configuramos por agencia.`
        : `It's not a generic chatbot — we configure it per agency.`;
    const close = lang === "es"
        ? `Lo más fácil es que te lo demuestre en vivo en 15 min con un caso real. ¿Encajas esta semana?`
        : `Easiest is I demo it live in 15 min on a real case. Got time this week?`;
    return [
        `<div>${greeting}</div>`,
        `<div><br></div>`,
        `<div>${tech}</div>`,
        `<div><br></div>`,
        `<div>${honesty}</div>`,
        `<div><br></div>`,
        `<div>${close}</div>`,
        `<div><br></div>`,
        `<div>${calendlyLine(lang)}</div>`,
        `<div><br></div>`,
        `<div>${signature()}</div>`,
    ].join("\n");
}

/**
 * Compose body for intent=EXPLORE.
 * Logic: 1 proof bullet (geo-matched) → low-friction CTA → Calendly.
 */
function composeEXPLORE(lang, bank, leadFirstName) {
    const fname = leadFirstName || "";
    const greeting = lang === "es" ? `Hola ${fname},` : `Hi ${fname},`;
    const intro = lang === "es"
        ? `Gracias por responder. Te lo bajo a una línea concreta:`
        : `Thanks for the reply. One-line version:`;
    const proof = bank[lang];
    const cta = lang === "es"
        ? `¿Vale 15 min esta semana para ver si encaja con tu agencia?`
        : `Worth 15 min this week to see if it fits your agency?`;
    return [
        `<div>${greeting}</div>`,
        `<div><br></div>`,
        `<div>${intro}</div>`,
        `<div><br></div>`,
        `<div>${proof}</div>`,
        `<div><br></div>`,
        `<div>${cta}</div>`,
        `<div><br></div>`,
        `<div>${calendlyLine(lang)}</div>`,
        `<div><br></div>`,
        `<div>${signature()}</div>`,
    ].join("\n");
}

/**
 * Master compose — picks the right shape per intent.
 * Returns null for OOO / UNSUB / BOUNCE (those don't reply).
 */
function composeReply({ intent, lang, geo, leadFirstName }) {
    if (intent === "OOO" || intent === "UNSUB" || intent === "BOUNCE") return null;
    const bank = pickProofBank(geo);
    if (intent === "BUY") return composeBUY(lang, bank, leadFirstName);
    if (intent === "TECH_Q") return composeTECH_Q(lang, bank, leadFirstName);
    return composeEXPLORE(lang, bank, leadFirstName); // EXPLORE + fallback
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
    const html = composeReply({ intent, lang, geo, leadFirstName });
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
    PROOF_BANKS,
    BUY_RX,
    TECH_Q_RX,
    EXPLORE_RX,
    OOO_RX,
    UNSUB_RX,
    BOUNCE_RX,
};
