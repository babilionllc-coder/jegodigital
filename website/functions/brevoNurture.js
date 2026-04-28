/**
 * brevoNurture — Reply→Brevo bridge + 4-touch Spanish nurture Track A.
 *
 * Built 2026-04-22 after audit found 0 of 9 Instantly human repliers were
 * in Brevo. Every positive signal was falling off a cliff; this closes it.
 *
 * Flow:
 *   1. instantlyReplyWatcher detects POSITIVE or POSITIVE_WITH_OBJECTION reply.
 *   2. It calls startTrackA() here → we upsert contact to Brevo (list 25),
 *      queue 4 Firestore docs (Day 0, 2, 5, 10) with per-campaign hook merge.
 *   3. processBrevoNurtureQueue (scheduled every 30 min in index.js) picks
 *      up due docs and sends via Brevo SMTP transactional API.
 *   4. If lead books Calendly before queue finishes, we cancel remaining.
 *
 * Spanish-first copy (client base is MX real estate). If body_preview has
 * English markers we auto-swap to the EN templates.
 *
 * Firestore shape:
 *   brevo_nurture_queue/{auto}
 *     email, firstName, company, campaignId, hook, touchNumber (0..3),
 *     sendAt (Timestamp), sent (bool), sentMessageId, sentAt, canceled (bool)
 *
 *   brevo_nurture_index/{email}
 *     track: "track_a", startedAt, replyId, calendlyBooked (bool)
 *     — one per lead, used to cancel all pending touches if they book.
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// ---------------- Brevo lists ----------------
// Legacy combined lists (kept for backwards compatibility, contacts will
// continue to flow here too — but new code routes by language to the
// segmented lists below for cleaner sends).
const LIST_HOT_LEADS = 25;   // Hot Leads - Engaged Under 30 Days (legacy combined)
const LIST_WARM_RE   = 26;   // Warm Leads - Real Estate (legacy combined fallback)

// Language-segmented lists added 2026-04-26 PM (USA Hispanic Hiring leads
// were getting Spanish nurture by default — these split EN vs ES so wrong-
// language sends can't happen even if detectLang() ever fails).
const LIST_HOT_EN  = 37;     // Hot Leads EN — Engaged USA/Bilingual
const LIST_HOT_ES  = 38;     // Hot Leads ES — Engaged Mexico
const LIST_WARM_EN = 39;     // Warm Leads EN — Real Estate USA/Bilingual
const LIST_WARM_ES = 40;     // Warm Leads ES — Real Estate Mexico

function pickHotList(lang) {
    return (lang || "").toLowerCase() === "en" ? LIST_HOT_EN : LIST_HOT_ES;
}
function pickWarmList(lang) {
    return (lang || "").toLowerCase() === "en" ? LIST_WARM_EN : LIST_WARM_ES;
}

// ---------------- Campaign → hook map ----------------
// Maps Instantly campaign_id → Spanish hook phrase used in Email 1.
// When a campaign isn't in the map we fall back to DEFAULT_HOOK.
const CAMPAIGN_HOOKS = {
    "cd9f1abf-3ad5-460c-88e9-29c48bc058b3": "el sistema de captura de leads 24/7",           // Trojan Horse MX
    "6e193b9d-819f-48c9-9300-5c0cfb3cfbc7": "our 24/7 AI lead capture system",                 // Trojan Horse EN
    "67fa7834-dc54-423c-be39-8b4ad6e57ce3": "tu visibilidad en Google",                        // SEO Visibilidad
    "733dfdd4-5813-48d6-8419-ebca3b40d783": "Sofia, la asistente de IA que contesta leads",    // AI SDR
    "eaeffabb-6c22-49e9-81ca-95dd62693c4b": "el sistema de captura de leads",                  // Trojan (luxury)
    "8b5f556f-9259-4258-b74b-2df55712f520": "la auditoría gratuita de 45 minutos",             // Free Audit
    "a9924239-49c4-4a79-8471-4391c4ec07ab": "el Mundial 2026 y la inversión inmobiliaria",     // World Cup
    "dbb78bf7-1ce3-4043-9c20-f085f326c9bd": "ChatGPT y tu presencia online",                   // Speed to Lead / ChatGPT
    "d486f1ab-4668-4674-ad6b-80ef12d9fd78": "el sitio web demo gratuito",                      // Free Demo Website
    "29a86daa-1269-4b4a-924f-c7ed52209fe4": "el sitio web demo gratuito",                      // Free Demo Website (CTD test)
    "5683573b-362a-45dd-966a-0e0377833ab4": "las fotos de propiedad en 48h",                   // Fotos 48h
    "0ef4ed58-a349-421f-af74-39795564602c": "el sistema de captura de leads",                  // legacy
};
const DEFAULT_HOOK = "mi mensaje de la semana pasada";

function pickHook(campaignId) {
    return CAMPAIGN_HOOKS[campaignId] || DEFAULT_HOOK;
}

// Multi-signal English detection — replaces 9-marker heuristic that missed
// many EN replies and routed Hispanic-USA leads to Spanish nurture.
// Signals scored: reply body stopwords, sender email TLD/domain, lead first name.
// Returns 'en' if score_en > score_es, else 'es' (Spanish-first default since
// MX is the primary market). 2026-04-26 PM upgrade — see BREVO_AUDIT_*.md.
function detectLang({ text = "", email = "", firstName = "" } = {}) {
    const t = (text || "").toLowerCase();
    const em = (email || "").toLowerCase();
    const fn = (firstName || "").toLowerCase().split(/\s+/)[0] || "";
    const domain = em.includes("@") ? em.split("@")[1] : "";

    let scoreEn = 0;
    let scoreEs = 0;

    // ---- Body-of-reply stopword ratio (strongest signal when present)
    if (t) {
        const enStop = [" the ", " your ", " thanks", " hi ", " hello ", " yes ", " please ",
                        " interested", " sounds good", " let's talk", " tell me more",
                        " send me", " can you", " i would", " we are", " i'm", " what ",
                        " how ", " when ", " more info", " video", " demo "];
        const esStop = [" hola", " gracias", " sí ", " si ", " por favor", " me interesa",
                        " mándame", " envíame", " puedes", " quiero", " quisiera", " somos",
                        " soy ", " qué ", " cómo ", " cuándo ", " agendar", " llamada",
                        " video", " demo", " adelante", " ok ", " perfecto", " claro"];
        for (const m of enStop) if (t.includes(m)) scoreEn += 1;
        for (const m of esStop) if (t.includes(m)) scoreEs += 1;
    }

    // ---- Sender TLD (very strong for ES — .mx, .com.mx, .es always Spanish)
    const esDomains = [".mx", ".com.mx", ".es", ".com.ar", ".com.co", ".cl", ".pe", ".uy"];
    for (const s of esDomains) if (domain.endsWith(s)) scoreEs += 4;

    // ---- Domain keyword (Spanish business markers)
    const esKeywords = ["inmobiliaria", "casas", "bienes", "cancun", "merida", "tulum",
                        "playa", "cdmx", "mexico", "rivieramaya", "propiedades",
                        "tropicasa", "trustreal", "oceanfrontcancun"];
    for (const k of esKeywords) if (domain.includes(k)) scoreEs += 3;

    // ---- First name (strong but tricky — many overlap)
    const enNames = new Set(["mitch","stephen","steve","john","michael","robert","william",
        "james","richard","charles","joseph","thomas","christopher","daniel","paul","mark",
        "donald","steven","andrew","kenneth","george","joshua","kevin","brian","edward",
        "ronald","timothy","jason","jeffrey","ryan","jacob","gary","nicholas","eric",
        "jonathan","larry","justin","scott","brandon","frank","benjamin","gregory","samuel",
        "raymond","patrick","jack","dennis","tyler","aaron","adam","nathan","henry",
        "douglas","peter","zachary","kyle","walter","ethan","jeremy","harold","keith",
        "christian","roger","noah","gerald","carl","terry","sean","austin","arthur",
        "lawrence","jesse","dylan","bryan","jordan","mary","patricia","jennifer","linda",
        "elizabeth","barbara","jessica","karen","lisa","nancy","betty","helen","donna",
        "carol","ruth","sharon","michelle","kimberly","deborah","dorothy","amy","angela",
        "ashley","brenda","emma","olivia","cynthia","marie","janet","catherine","frances",
        "christine","samantha","debra","rachel","cambria","susan","claire","melody",
        "jaquelin","heather","cheryl","andrea","quin","syring"]);
    const esNames = new Set(["jose","maria","juan","luis","carlos","pedro","antonio",
        "alejandro","francisco","manuel","jorge","rafael","miguel","jesus","javier",
        "sergio","fernando","ricardo","roberto","eduardo","andres","adrian","mario",
        "victor","arturo","enrique","salvador","oscar","gabriel","hector","julio","marco",
        "ramon","agustin","diego","emilio","felipe","guillermo","ivan","leonardo",
        "marcelo","mateo","pablo","rodrigo","santiago","tomas","sebastian","carmen",
        "rosa","ana","laura","sandra","isabel","sofia","lucia","elena","silvia","cristina",
        "beatriz","gabriela","natalia","julia","adriana","daniela","carolina","paula",
        "monica","veronica","marisol","marta","lourdes","luisa","margarita","susana",
        "priscila","leticia","nayeli","alejandra"]);
    if (fn) {
        if (esNames.has(fn) && !enNames.has(fn)) scoreEs += 3;
        else if (enNames.has(fn) && !esNames.has(fn)) scoreEn += 3;
    }

    // ---- Email-prefix patterns
    const prefix = em.includes("@") ? em.split("@")[0] : "";
    if (["contacto","ventas","reserva","soporte","atencion","recepcion"].includes(prefix)) scoreEs += 2;
    if (["contact","sales","reservations","bookings","support","reply"].includes(prefix)) scoreEn += 1;

    // ---- Tiebreaker: TLD on .com/.net/.io with no ES signal → EN
    if (Math.abs(scoreEn - scoreEs) <= 1) {
        const enLeaningTlds = [".com",".net",".help",".io",".org",".cz",".online",".top"];
        for (const s of enLeaningTlds) {
            if (domain.endsWith(s) && scoreEs === 0) { scoreEn += 1; break; }
        }
    }

    return scoreEn > scoreEs ? "en" : "es";
}

// Backwards-compat shim — old code paths still call looksEnglish(text).
function looksEnglish(text) {
    return detectLang({ text }) === "en";
}

// ---------------- Templates ----------------
const CALENDLY = "https://calendly.com/jegoalexdigital/30min";

function wrapHtml(innerHtml, lang = "es") {
    const footerEs = `Alex Jego · JegoDigital · Cancún, México<br>
Si prefieres que no te escriba más, respóndeme "no gracias" y te elimino hoy mismo.`;
    const footerEn = `Alex Jego · JegoDigital · Cancun, Mexico<br>
Reply "no thanks" and I'll remove you from my list today.`;
    const footer = lang === "en" ? footerEn : footerEs;
    return `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 15px; line-height: 1.55; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 20px;">
${innerHtml}
<br><br>
<p style="font-size: 12px; color: #777; border-top: 1px solid #eee; padding-top: 12px; margin-top: 30px;">
${footer}
</p>
</body></html>`;
}

// --- Spanish ---
function tplEs_0({ firstName, hook, company }) {
    const fn = firstName ? ` ${firstName}` : "";
    const co = company ? ` de ${company}` : "";
    return {
        subject: `Recibí tu respuesta${fn} — siguiente paso`,
        html: wrapHtml(`
<p>Hola${fn},</p>
<p>Gracias por tu respuesta a mi mensaje sobre <strong>${hook}</strong>.</p>
<p>El siguiente paso natural es una llamada corta (30 min) para ver si realmente tiene sentido aplicarlo en tu caso${co}. Sin presión, sin vender — solo ver si encaja.</p>
<p><a href="${CALENDLY}" style="display:inline-block; background:#C5A059; color:#0f1115; padding:12px 22px; border-radius:6px; text-decoration:none; font-weight:600;">Reservar 30 min →</a></p>
<p>Si prefieres WhatsApp primero, contéstame con tu número y te escribo personalmente.</p>
<p>Saludos,<br>Alex</p>
        `),
    };
}
function tplEs_1({ firstName }) {
    const fn = firstName ? ` ${firstName}` : "";
    return {
        subject: `${firstName || "Hola"}, así lo está logrando Flamingo Real Estate`,
        html: wrapHtml(`
<p>Hola${fn},</p>
<p>Un cliente mío (Flamingo Real Estate, Cancún) me compartió sus números del trimestre:</p>
<ul style="padding-left:18px;">
  <li><strong>4.4x</strong> más visibilidad en búsquedas de Google</li>
  <li><strong>#1</strong> en Google Maps para "inmobiliaria Cancún"</li>
  <li><strong>+320%</strong> tráfico orgánico a su sitio</li>
  <li><strong>88%</strong> de sus leads se atienden sin intervención humana</li>
</ul>
<p>Lo construimos en 6 semanas. Y sí, replicable.</p>
<p>¿Quieres que te muestre cómo aplicaría en tu inmobiliaria?</p>
<p><a href="${CALENDLY}" style="display:inline-block; background:#C5A059; color:#0f1115; padding:12px 22px; border-radius:6px; text-decoration:none; font-weight:600;">Agendar 30 min →</a></p>
<p>Alex</p>
        `),
    };
}
function tplEs_2({ firstName }) {
    const fn = firstName ? ` ${firstName}` : "";
    return {
        subject: `¿Es tema de tiempo${fn ? "," : ""}${fn}?`,
        html: wrapHtml(`
<p>Hola${fn},</p>
<p>Noté que aún no has agendado la llamada y quiero preguntarte directo:</p>
<p><strong>¿Es tema de timing, o ya no te interesa?</strong></p>
<p>Cualquier respuesta me sirve:</p>
<ul style="padding-left:18px;">
  <li>"Sí, pero la próxima semana" → te escribo el lunes.</li>
  <li>"No gracias" → te saco de la lista hoy mismo, sin problema.</li>
  <li>"Mándame más info" → te mando un caso de estudio concreto.</li>
</ul>
<p>Solo responde con una palabra y listo.</p>
<p>Alex</p>
        `),
    };
}
function tplEs_3({ firstName, company }) {
    const fn = firstName ? ` ${firstName}` : "";
    const co = company || "tu inmobiliaria";
    return {
        subject: `Cerrando tu expediente${fn}`,
        html: wrapHtml(`
<p>Hola${fn},</p>
<p>No quiero seguir llenando tu bandeja si el momento no es el correcto, así que voy a cerrar tu expediente por aquí.</p>
<p>Si cambias de opinión, mi calendario siempre está abierto:</p>
<p><a href="${CALENDLY}" style="display:inline-block; background:#C5A059; color:#0f1115; padding:12px 22px; border-radius:6px; text-decoration:none; font-weight:600;">Reservar cuando quieras →</a></p>
<p>Te deseo mucho éxito con ${co}.</p>
<p>Alex Jego<br>Fundador, JegoDigital</p>
        `),
    };
}

// --- English (fallback for English repliers) ---
function tplEn_0({ firstName, hook, company }) {
    const fn = firstName ? ` ${firstName}` : "";
    const co = company ? ` at ${company}` : "";
    return {
        subject: `Got your reply${fn} — next step`,
        html: wrapHtml(`
<p>Hi${fn},</p>
<p>Thanks for replying to my note about <strong>${hook}</strong>.</p>
<p>Natural next step is a short call (30 min) to see whether this actually fits your situation${co}. No pressure, no pitch — just a fit check.</p>
<p><a href="${CALENDLY}" style="display:inline-block; background:#C5A059; color:#0f1115; padding:12px 22px; border-radius:6px; text-decoration:none; font-weight:600;">Book 30 min →</a></p>
<p>Prefer WhatsApp first? Reply with your number and I'll text you.</p>
<p>Alex</p>
        `, "en"),
    };
}
function tplEn_1({ firstName }) {
    const fn = firstName ? ` ${firstName}` : "";
    return {
        subject: `${firstName || "Hey"} — here's what Flamingo RE just hit`,
        html: wrapHtml(`
<p>Hi${fn},</p>
<p>One of my clients (Flamingo Real Estate, Cancun) just shared their quarterly numbers:</p>
<ul style="padding-left:18px;">
  <li><strong>4.4x</strong> more Google search visibility</li>
  <li><strong>#1</strong> on Google Maps for "real estate Cancun"</li>
  <li><strong>+320%</strong> organic site traffic</li>
  <li><strong>88%</strong> of leads handled with zero human intervention</li>
</ul>
<p>Built in 6 weeks. Repeatable.</p>
<p>Want me to walk you through what it would look like for you?</p>
<p><a href="${CALENDLY}" style="display:inline-block; background:#C5A059; color:#0f1115; padding:12px 22px; border-radius:6px; text-decoration:none; font-weight:600;">Book 30 min →</a></p>
<p>Alex</p>
        `, "en"),
    };
}
function tplEn_2({ firstName }) {
    const fn = firstName ? ` ${firstName}` : "";
    return {
        subject: `Timing issue${fn ? "," : ""}${fn}?`,
        html: wrapHtml(`
<p>Hi${fn},</p>
<p>You haven't booked yet — asking directly:</p>
<p><strong>Is it timing, or did it fall off your radar?</strong></p>
<p>Either answer is useful:</p>
<ul style="padding-left:18px;">
  <li>"Next week" → I'll ping you Monday.</li>
  <li>"Not for me" → I'll remove you today.</li>
  <li>"Send more info" → I'll send a concrete case study.</li>
</ul>
<p>One word works.</p>
<p>Alex</p>
        `, "en"),
    };
}
function tplEn_3({ firstName, company }) {
    const fn = firstName ? ` ${firstName}` : "";
    const co = company || "your team";
    return {
        subject: `Closing your file${fn}`,
        html: wrapHtml(`
<p>Hi${fn},</p>
<p>I don't want to keep crowding your inbox if the timing is wrong — so I'm closing your file on my end.</p>
<p>If anything changes, my calendar is always open:</p>
<p><a href="${CALENDLY}" style="display:inline-block; background:#C5A059; color:#0f1115; padding:12px 22px; border-radius:6px; text-decoration:none; font-weight:600;">Book whenever →</a></p>
<p>Best of luck with ${co}.</p>
<p>Alex Jego<br>Founder, JegoDigital</p>
        `, "en"),
    };
}

// ---------------- Schedule ----------------
// Touch offsets in hours from T=0 (reply detected).
const TRACK_A_OFFSETS_HOURS = [0, 48, 120, 240]; // Day 0, 2, 5, 10

function buildTouches({ firstName, company, hook, lang, replyDate }) {
    const now = replyDate ? new Date(replyDate) : new Date();
    const tplES = [tplEs_0, tplEs_1, tplEs_2, tplEs_3];
    const tplEN = [tplEn_0, tplEn_1, tplEn_2, tplEn_3];
    const tpls = lang === "en" ? tplEN : tplES;
    return TRACK_A_OFFSETS_HOURS.map((h, i) => {
        const ctx = { firstName, company, hook };
        const { subject, html } = tpls[i](ctx);
        const sendAt = new Date(now.getTime() + h * 60 * 60 * 1000);
        return { touchNumber: i, subject, html, sendAt };
    });
}

// ---------------- Brevo API helpers ----------------
async function brevoUpsertContact({ email, firstName, lastName, attributes = {}, addToListIds = [LIST_HOT_LEADS] }) {
    const key = process.env.BREVO_API_KEY;
    if (!key || !email) return { ok: false, skipped: true };
    try {
        const r = await axios.post("https://api.brevo.com/v3/contacts", {
            email,
            attributes: {
                FIRSTNAME: firstName || "",
                LASTNAME: lastName || "",
                ...attributes,
            },
            listIds: addToListIds,
            updateEnabled: true,
        }, {
            headers: {
                "api-key": key,
                "Content-Type": "application/json",
                accept: "application/json",
            },
            timeout: 10000,
        });
        return { ok: true, id: r.data?.id };
    } catch (err) {
        functions.logger.error("brevoNurture upsert failed:", err.response?.data || err.message);
        return { ok: false, error: err.response?.data || err.message };
    }
}

async function brevoSendTransactional({ to, toName, subject, html, tags = [], templateId = null, params = null }) {
    const key = process.env.BREVO_API_KEY;
    if (!key) return { ok: false, skipped: true };
    try {
        const body = {
            to: [{ email: to, name: toName || to }],
            tags,
        };
        if (templateId) {
            // Template-based send (sender + subject + HTML come from the Brevo template itself)
            body.templateId = parseInt(templateId, 10);
            if (params) body.params = params;
        } else {
            // Inline HTML send (legacy path — used by Track A nurture)
            body.sender = {
                name: "Alex · JegoDigital",
                email: process.env.BREVO_SENDER_EMAIL || "info@jegodigital.com",
            };
            body.subject = subject;
            body.htmlContent = html;
            body.replyTo = { email: "jegoalexdigital@gmail.com", name: "Alex Jego" };
        }
        const r = await axios.post("https://api.brevo.com/v3/smtp/email", body, {
            headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
            timeout: 15000,
        });
        return { ok: true, messageId: r.data?.messageId };
    } catch (err) {
        functions.logger.error("brevoNurture send failed:", err.response?.data || err.message);
        return { ok: false, error: err.response?.data || err.message };
    }
}

// ---------------- Public API ----------------

/**
 * Start Track A for a lead who just replied positive to an Instantly campaign.
 * Idempotent — if lead already on a track, we skip (won't double-enroll).
 *
 * @param {object} opts
 * @param {string} opts.email          lead email (required)
 * @param {string} opts.firstName
 * @param {string} opts.company
 * @param {string} opts.campaignId     Instantly campaign UUID (for hook map)
 * @param {string} opts.replyId        Instantly reply id (for audit trail)
 * @param {string} opts.replyBody      used for lang detection
 * @param {Date}   opts.replyDate      defaults to now
 * @param {number} opts.startFromTouch 0..3 — for backfill, skip ahead (e.g. 10-day-old reply → start at touch 3)
 */
async function startTrackA({
    email, firstName = "", company = "", campaignId = null,
    replyId = null, replyBody = "", replyDate = null, startFromTouch = 0,
}) {
    if (!email) return { ok: false, reason: "no email" };
    const db = admin.firestore();
    const idxRef = db.collection("brevo_nurture_index").doc(email.toLowerCase());

    // Idempotency
    const existing = await idxRef.get();
    if (existing.exists && !existing.data()?.canceled) {
        return { ok: true, skipped: true, reason: "already_enrolled" };
    }

    // 2026-04-26 PM upgrade: pass full context (reply body + email + firstName)
    // to the new detectLang() — way better than the old looksEnglish() which
    // only checked for 9 markers and routed many EN leads to Spanish nurture.
    const lang = detectLang({ text: replyBody, email, firstName });
    const hook = pickHook(campaignId);
    const touches = buildTouches({ firstName, company, hook, lang, replyDate });

    // Upsert Brevo contact
    // 2026-04-26 PM: route to language-segmented lists (37 EN / 38 ES) IN ADDITION
    // to legacy combined Hot Leads list 25, so segmentation works even if
    // detectLang() ever fails downstream.
    const upsert = await brevoUpsertContact({
        email,
        firstName,
        attributes: {
            CAMPAIGN_SOURCE: campaignId || "unknown",
            HOOK_USED: hook,
            REPLY_DATE: new Date(replyDate || Date.now()).toISOString().slice(0, 10),
            COMPANY: company,
            TRACK: "track_a_reply_nurture",
            LANG: lang,
        },
        addToListIds: [LIST_HOT_LEADS, pickHotList(lang)],
    });

    // Queue touches (skip any at/before startFromTouch if backfilling)
    const batch = db.batch();
    const queued = [];
    for (const t of touches) {
        if (t.touchNumber < startFromTouch) continue;
        const ref = db.collection("brevo_nurture_queue").doc();
        batch.set(ref, {
            email: email.toLowerCase(),
            firstName,
            company,
            campaignId: campaignId || null,
            hook,
            lang,
            track: "track_a",
            touchNumber: t.touchNumber,
            subject: t.subject,
            html: t.html,
            sendAt: admin.firestore.Timestamp.fromDate(t.sendAt),
            sent: false,
            canceled: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            replyId: replyId || null,
        });
        queued.push({ touchNumber: t.touchNumber, sendAt: t.sendAt.toISOString() });
    }

    batch.set(idxRef, {
        email: email.toLowerCase(),
        firstName,
        company,
        campaignId: campaignId || null,
        track: "track_a",
        lang,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        startFromTouch,
        replyId: replyId || null,
        calendlyBooked: false,
        canceled: false,
        brevoUpsertOk: upsert.ok,
    });

    await batch.commit();

    return { ok: true, queued: queued.length, touches: queued, brevoUpsertOk: upsert.ok };
}

/**
 * Process due touches in brevo_nurture_queue. Meant to be called by a
 * scheduled Cloud Function every 30 min.
 *
 * Sends via Brevo transactional API. Marks sent=true on success.
 * Skips canceled touches. Skips if lead has calendlyBooked=true in the index.
 */
async function processNurtureQueue({ limit = 40 } = {}) {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    // Single-field query on sendAt only (no composite index required).
    // Filter sent/canceled in code after fetch — fetch 3x limit to compensate.
    const dueSnap = await db.collection("brevo_nurture_queue")
        .where("sendAt", "<=", now)
        .orderBy("sendAt", "asc")
        .limit(limit * 3)
        .get();

    if (dueSnap.empty) return { processed: 0, sent: 0, skipped: 0, failed: 0 };

    // In-code filter: only pending touches
    const pendingDocs = dueSnap.docs
        .filter((d) => {
            const data = d.data();
            return data.sent !== true && data.canceled !== true;
        })
        .slice(0, limit);

    if (pendingDocs.length === 0) return { processed: 0, sent: 0, skipped: 0, failed: 0 };

    let processed = 0, sent = 0, skipped = 0, failed = 0;
    const results = [];

    for (const doc of pendingDocs) {
        processed++;
        const d = doc.data();

        // If lead booked Calendly, short-circuit
        const idxDoc = await db.collection("brevo_nurture_index").doc(d.email).get();
        if (idxDoc.exists && idxDoc.data()?.calendlyBooked) {
            await doc.ref.update({
                canceled: true,
                canceledReason: "calendly_booked",
                canceledAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            skipped++;
            results.push({ email: d.email, touch: d.touchNumber, result: "canceled_booked" });
            continue;
        }

        const r = await brevoSendTransactional({
            to: d.email,
            toName: d.firstName || d.email,
            subject: d.subject,
            html: d.html,
            templateId: d.templateId || null,  // FB nurture uses template IDs (72-76)
            params: d.params || null,           // {FIRSTNAME, COMPANY, URL}
            tags: ["nurture", d.track, `touch_${d.touchNumber}`, d.campaignId || d.track || "no_campaign"],
        });

        if (r.ok) {
            await doc.ref.update({
                sent: true,
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                sentMessageId: r.messageId || null,
            });
            sent++;
            results.push({ email: d.email, touch: d.touchNumber, result: "sent", messageId: r.messageId });
        } else {
            await doc.ref.update({
                lastError: typeof r.error === "string" ? r.error : JSON.stringify(r.error).slice(0, 500),
                lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(),
                attempts: admin.firestore.FieldValue.increment(1),
            });
            failed++;
            results.push({ email: d.email, touch: d.touchNumber, result: "failed", error: r.error });
        }
    }

    // Daily rollup
    const dateKey = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await db.collection("brevo_nurture_summaries").doc(dateKey).set({
        date: dateKey,
        processed: admin.firestore.FieldValue.increment(processed),
        sent: admin.firestore.FieldValue.increment(sent),
        skipped: admin.firestore.FieldValue.increment(skipped),
        failed: admin.firestore.FieldValue.increment(failed),
        lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { processed, sent, skipped, failed, results };
}

/**
 * Cancel all pending touches for an email (used when lead books Calendly).
 */
async function cancelTrackForEmail(email, reason = "calendly_booked") {
    const db = admin.firestore();
    const emailLc = email.toLowerCase();
    const idxRef = db.collection("brevo_nurture_index").doc(emailLc);
    await idxRef.set({
        calendlyBooked: reason === "calendly_booked",
        canceled: true,
        canceledReason: reason,
        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Single-field equality (no composite index required).
    // Filter sent/canceled in code.
    const pending = await db.collection("brevo_nurture_queue")
        .where("email", "==", emailLc)
        .get();

    const toCancel = pending.docs.filter((d) => {
        const data = d.data();
        return data.sent !== true && data.canceled !== true;
    });

    if (toCancel.length === 0) {
        return { canceled: 0 };
    }

    const batch = db.batch();
    toCancel.forEach((d) => {
        batch.update(d.ref, {
            canceled: true,
            canceledReason: reason,
            canceledAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });
    await batch.commit();

    return { canceled: toCancel.length };
}

// =============================================================
// FB LEAD FORM NURTURE — 5-email sequence over 21 days
// Templates: 72 (D+1), 73 (D+3), 74 (D+7), 75 (D+14), 76 (D+21)
// Triggered from metaLeadFormWebhook after Brevo contact creation.
// Uses templateId path of brevoSendTransactional (sends through Brevo
// templates so Alex can edit copy in Brevo UI without code deploys).
//
// Auto-cancels on Calendly booking (handled by cancelTrackForEmail).
//
// Per 2026 nurture research (B2B):
//   - Front-loaded cadence (D+1, D+3, D+7, D+14, D+21)
//   - 4-7 emails = 3× reply rate of shorter sequences
//   - 3:1 give-value-before-asking rule honored
//   - Template-based for editability without redeploys
// =============================================================

const FB_NURTURE_SCHEDULE = [
    { touch: 1, templateId: 72, sendAfterHours: 24,  subject: "una pregunta sobre tu auditoría" },
    { touch: 2, templateId: 73, sendAfterHours: 72,  subject: "lo que flamingo hizo diferente" },
    { touch: 3, templateId: 74, sendAfterHours: 168, subject: "idea para {{COMPANY}}" },
    { touch: 4, templateId: 75, sendAfterHours: 336, subject: "¿hablamos 15 min?" },
    { touch: 5, templateId: 76, sendAfterHours: 504, subject: "última, prometido" },
];

async function enqueueFBNurture({ email, firstName, company = "", websiteUrl = "", leadgenId = null }) {
    if (!email) return { ok: false, error: "no_email" };
    const db = admin.firestore();
    const emailLc = email.toLowerCase();
    const idxRef = db.collection("brevo_nurture_index").doc(emailLc);

    // Idempotency — if already enrolled in fb_lead_form track, skip
    const idxDoc = await idxRef.get();
    if (idxDoc.exists && idxDoc.data()?.track === "fb_lead_form") {
        return { ok: true, skipped: true, reason: "already_enrolled" };
    }

    const now = Date.now();
    const batch = db.batch();
    const queued = [];

    for (const t of FB_NURTURE_SCHEDULE) {
        const ref = db.collection("brevo_nurture_queue").doc();
        batch.set(ref, {
            email: emailLc,
            firstName: firstName || "Inmobiliaria",
            company: company || "",
            track: "fb_lead_form",
            touchNumber: t.touch,
            templateId: t.templateId,
            params: {
                FIRSTNAME: firstName || "Inmobiliaria",
                COMPANY: company || "tu agencia",
                URL: websiteUrl || "tu sitio",
                CALENDLY: "https://calendly.com/jegoalexdigital/30min?utm_source=brevo&utm_campaign=fb_nurture",
            },
            subject: t.subject, // backup if templateId fails
            sendAt: admin.firestore.Timestamp.fromMillis(now + t.sendAfterHours * 3600 * 1000),
            sent: false,
            canceled: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            leadgenId: leadgenId || null,
        });
        queued.push({ touch: t.touch, sendAt: new Date(now + t.sendAfterHours * 3600 * 1000).toISOString() });
    }

    batch.set(idxRef, {
        email: emailLc,
        firstName,
        company,
        track: "fb_lead_form",
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        leadgenId: leadgenId || null,
        calendlyBooked: false,
        canceled: false,
    }, { merge: true });

    await batch.commit();
    return { ok: true, queued: queued.length, touches: queued };
}

module.exports = {
    startTrackA,
    processNurtureQueue,
    cancelTrackForEmail,
    enqueueFBNurture,           // NEW — 5-email FB Lead Form sequence
    FB_NURTURE_SCHEDULE,        // exposed for skill docs + tests
    // exposed for tests
    pickHook,
    looksEnglish,
    buildTouches,
    brevoUpsertContact,
    brevoSendTransactional,
};
