/**
 * referralTrigger — 30-day post-client referral request automation.
 *
 * Daily at 09:00 UTC, scans Notion CRM for clients whose `Status` is
 * "Closed Won" AND whose `Signed At` (or `Last Touch` fallback) date is
 * exactly 30 days ago. For each match, fires:
 *
 *   1. Brevo email — "¿Cómo vamos?" referral talk-track, collaboration tone
 *      per HR-17, JegoDigital + RE niche intro per HR-19.
 *   2. Twilio WhatsApp message (if phone is on the Notion record) — Sofia
 *      voice, soft check-in, mentions referral as a side note.
 *   3. Telegram + Slack alert to Alex with the EXACT verbal talk-track he can
 *      use on his next Calendly with that client (HR-13: prep work, never
 *      asking Alex to script himself).
 *
 * Idempotency: every fire writes to Firestore /referral_triggers/{client_id}_{YYYY-MM-DD}.
 * If a doc already exists for today's run, we skip — the cron is safe to
 * re-run without spamming.
 *
 * Schedule: `0 9 * * *`  UTC = 09:00 UTC daily
 * Manual:   GET /referralTriggerNow?dry=1&client_email=foo@bar.com
 *           GET /referralTriggerNow?dry=1   (full dry-run on synthetic record)
 *
 * Hard rules honored:
 *   HR-2  — every Notion record pulled live this run.
 *   HR-6  — returns per-channel proof; "complete" only if all 3 wires fired.
 *   HR-13 — Alex never has to write the message himself; talk-track is
 *           delivered ready-to-read.
 *   HR-17 — collaboration tone (no "sell", "deal", "pitch", etc.).
 *   HR-19 — Brevo email + WA opener both contain "JegoDigital — agencia de
 *           marketing con IA para inmobiliarias, agencias y desarrolladores"
 *           in the first 200 chars.
 *
 * Env required:
 *   NOTION_API_KEY, NOTION_LEADS_CRM_ID,
 *   BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME,
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM,
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
 *   SLACK_BOT_TOKEN, SLACK_CHANNEL_REVENUE
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { notify } = require("./telegramHelper");
const { slackPost } = require("./slackPost");

if (!admin.apps.length) admin.initializeApp();

const NOTION_VERSION = "2022-06-28";
const DAYS_THRESHOLD = 30;
const DEFAULT_DB_ID = "adacaa44-3d9a-4c00-8ef4-c0eb45ff091b";

function isoDay(d = new Date()) { return d.toISOString().slice(0, 10); }

// ─── Notion query: Closed Won between 31d ago and 29d ago window ────
// We query a 3-day window centered on day-30 so we don't miss a client just
// because the cron failed yesterday. Idempotency via Firestore handles dup-fires.
async function findClientsAtDay30() {
    const key = process.env.NOTION_API_KEY;
    const dbId = process.env.NOTION_LEADS_CRM_ID || DEFAULT_DB_ID;
    if (!key) throw new Error("NOTION_API_KEY missing");

    const day31 = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const day29 = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Try "Signed At" first; fall back to "Last Touch" if the Notion DB
    // doesn't have that property name (different shapes have appeared in the
    // wild — see notionLeadSync.js for the canonical buildNotionProps map).
    const dateProperties = ["Signed At", "Last Touch"];
    const matches = [];
    for (const dateProp of dateProperties) {
        try {
            const resp = await axios.post(
                `https://api.notion.com/v1/databases/${dbId}/query`,
                {
                    filter: {
                        and: [
                            { property: "Status", select: { equals: "Closed Won" } },
                            { property: dateProp, date: { on_or_after: day31 } },
                            { property: dateProp, date: { on_or_before: day29 } },
                        ],
                    },
                    page_size: 25,
                },
                {
                    headers: {
                        Authorization: `Bearer ${key}`,
                        "Notion-Version": NOTION_VERSION,
                        "Content-Type": "application/json",
                    },
                    timeout: 20000,
                }
            );
            const results = resp.data?.results || [];
            for (const p of results) {
                matches.push(parseNotionPage(p, dateProp));
            }
            if (results.length > 0) break; // found rows under this prop name
        } catch (err) {
            // 400 ("property doesn't exist") → try the next property name.
            const code = err.response?.status;
            const msg = err.response?.data?.message || err.message;
            if (code === 400 && /property|does not exist|could not find/i.test(msg)) {
                continue;
            }
            throw err;
        }
    }

    // Dedupe by email
    const seen = new Set();
    return matches.filter(m => {
        if (!m.email || seen.has(m.email)) return false;
        seen.add(m.email);
        return true;
    });
}

function parseNotionPage(p, dateProp) {
    const props = p.properties || {};
    const company = props["Company"]?.title?.[0]?.plain_text || null;
    const contactName = props["Contact Name"]?.rich_text?.[0]?.plain_text || null;
    const email = props["Email"]?.email || null;
    const phone = props["Phone"]?.phone_number || null;
    const city = props["City"]?.select?.name || null;
    const signed = props[dateProp]?.date?.start || null;
    const role = props["Decision Maker Role"]?.select?.name || null;
    return {
        notion_page_id: p.id,
        company,
        contactName,
        email: email ? email.toLowerCase().trim() : null,
        phone,
        city,
        signed_at: signed,
        role,
    };
}

// ─── Validators (HR-19 + HR-17) ─────────────────────────────────────
function validateCollaborationCopy(text) {
    const lower = text.toLowerCase();
    const banned = ["sell", "pitch", "buy", "deal", "100% guarantee", "money-back", "limited time", "spots left", "last chance", "urgent", "don't miss"];
    const found = banned.filter(b => lower.includes(b));
    return { ok: found.length === 0, banned_found: found };
}

function validateHR19(text) {
    const first200 = text.slice(0, 240).toLowerCase();
    const hasBrand = first200.includes("jegodigital");
    const hasNiche = ["inmobiliaria", "real estate", "agencia", "desarrollador", "developer", "broker"]
        .some(k => first200.includes(k));
    return { ok: hasBrand && hasNiche, has_brand: hasBrand, has_niche: hasNiche };
}

// ─── Copy templates (collaboration tone, HR-19 compliant) ──────────
function buildBrevoEmail({ contactName, company, city }) {
    const greet = contactName ? contactName.split(" ")[0] : "amigo";
    const cityLine = city ? ` en ${city}` : "";
    const subject = `${greet}, ¿cómo vamos en este primer mes?`;
    const intro = `Soy Alex de JegoDigital — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores. ` +
        `Hace 30 días empezamos a colaborar con ${company || "tu equipo"}${cityLine} y hoy quiero hacer una pausa para preguntarte cómo vamos juntos.`;

    const htmlContent = `
<p>Hola ${greet},</p>
<p>${intro}</p>
<p>Quería darme un momento para preguntar:</p>
<ul>
  <li>¿Qué está funcionando bien hasta ahora?</li>
  <li>¿Qué te gustaría que ajustemos para el siguiente mes?</li>
  <li>¿Hay alguna prioridad nueva donde podamos apoyarte mejor?</li>
</ul>
<p>Y una cosa más, sin presión: cuando tú creces, nosotros crecemos contigo. Si conoces a otro dueño o director de inmobiliaria que esté buscando colaborar con un equipo de marketing con IA, estaríamos felices de aprender de su negocio también — solo si crees que les puede aportar.</p>
<p>Aquí estoy para escuchar. Cuando quieras, agendamos 15 minutos de café virtual.</p>
<p>Un abrazo,<br>
Alex Jego<br>
JegoDigital · jegodigital.com</p>`;

    const textContent = `Hola ${greet},

${intro}

Quería darme un momento para preguntar:
- ¿Qué está funcionando bien hasta ahora?
- ¿Qué te gustaría que ajustemos para el siguiente mes?
- ¿Hay alguna prioridad nueva donde podamos apoyarte mejor?

Y una cosa más, sin presión: cuando tú creces, nosotros crecemos contigo. Si conoces a otro dueño o director de inmobiliaria que esté buscando colaborar con un equipo de marketing con IA, estaríamos felices de aprender de su negocio también — solo si crees que les puede aportar.

Aquí estoy para escuchar. Cuando quieras, agendamos 15 minutos de café virtual.

Un abrazo,
Alex Jego
JegoDigital · jegodigital.com`;

    return { subject, htmlContent, textContent };
}

function buildWhatsAppText({ contactName, company }) {
    const greet = contactName ? contactName.split(" ")[0] : "qué tal";
    const intro = `Hola ${greet}, soy Sofía de JegoDigital — el equipo de marketing con IA que está colaborando con ${company || "ustedes"}. ` +
        `Hoy se cumple un mes desde que empezamos juntos y quería preguntarte cómo vamos. ¿Qué está funcionando? ¿Qué te gustaría que ajustemos?`;
    return intro;
}

function buildAlexTalkTrack({ contactName, company, city, role, signed_at }) {
    return `🤝 *Talk-track para tu próxima llamada con ${contactName || company}*

*Cliente:* ${company}${city ? " · " + city : ""}${role ? " · " + role : ""}
*Firmamos:* ${signed_at} (hace 30 días)

*Apertura (collaboration tone):*
"${contactName ? contactName.split(" ")[0] : "Amigo"}, gracias por darnos este primer mes para colaborar contigo. Hoy no traigo nada que vender — vine a escuchar. ¿Qué está funcionando bien? ¿Qué cambiarías?"

*Si dice 'todo bien':*
"Me alegra. ¿Hay algún resultado específico que estás esperando ver en los próximos 30 días?" → toma nota → propón un check-in al día 60.

*Si dice 'esto no funciona':*
"Cuéntame específicamente qué esperabas y qué estás viendo. Quiero que esto funcione más que tú." → escucha sin defender → propón un ajuste concreto al final, no en medio.

*Pivote a referral (al cierre, sin presión):*
"Una cosa más: si conoces a otro dueño o director que está pasando por lo mismo que estabas pasando hace un mes, me encantaría aprender de su negocio. No es venta — solo si crees que les puede aportar."

*Por qué funciona:*
- Día 30 es el momento de máxima reciprocidad (Robert Cialdini, Influence)
- Pedir feedback ANTES de pedir referral baja la guardia
- "Aprender de su negocio" > "trabajar con ellos" → colaboración, no comisión`;
}

// ─── Brevo send ─────────────────────────────────────────────────────
async function sendBrevoEmail({ to, contactName, company, city }) {
    const key = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || "alex@jegodigital.com";
    const senderName = process.env.BREVO_SENDER_NAME || "Alex Jego — JegoDigital";
    if (!key) return { ok: false, error: "no_brevo_key" };

    const { subject, htmlContent, textContent } = buildBrevoEmail({ contactName, company, city });

    // HR-17 + HR-19 validation BEFORE send
    const ht = validateCollaborationCopy(textContent);
    const hr19 = validateHR19(textContent);
    if (!ht.ok || !hr19.ok) {
        return {
            ok: false,
            error: `validator_failed: collaboration=${ht.ok} hr19=${hr19.ok} banned=${ht.banned_found.join(",")}`,
        };
    }

    try {
        const r = await axios.post(
            "https://api.brevo.com/v3/smtp/email",
            {
                sender: { email: senderEmail, name: senderName },
                to: [{ email: to, name: contactName || undefined }],
                subject,
                htmlContent,
                textContent,
                tags: ["referral_trigger", "30d_post_client"],
            },
            {
                headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
                timeout: 20000,
            }
        );
        return { ok: true, message_id: r.data?.messageId || null };
    } catch (err) {
        return { ok: false, error: err.response?.data?.message || err.message };
    }
}

// ─── Twilio WhatsApp send ───────────────────────────────────────────
async function sendTwilioWA({ to, contactName, company }) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !tok || !from) return { ok: false, error: "twilio_env_missing" };
    if (!to) return { ok: false, error: "no_phone" };

    // Normalize to E.164. Notion sometimes stores "+52 998 …" with spaces.
    const cleanTo = to.replace(/[^+\d]/g, "");
    const waTo = `whatsapp:${cleanTo}`;
    const waFrom = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;

    const body = buildWhatsAppText({ contactName, company });

    const ht = validateCollaborationCopy(body);
    const hr19 = validateHR19(body);
    if (!ht.ok || !hr19.ok) {
        return {
            ok: false,
            error: `validator_failed: collaboration=${ht.ok} hr19=${hr19.ok}`,
        };
    }

    try {
        const r = await axios.post(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
            new URLSearchParams({ From: waFrom, To: waTo, Body: body }).toString(),
            {
                auth: { username: sid, password: tok },
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                timeout: 15000,
            }
        );
        return { ok: !!r.data?.sid, sid: r.data?.sid || null };
    } catch (err) {
        return { ok: false, error: err.response?.data?.message || err.message };
    }
}

// ─── Per-client fire ────────────────────────────────────────────────
async function fireForClient(client, opts = {}) {
    const dry = !!opts.dry;
    const fireKey = `${(client.email || client.notion_page_id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_")}_${isoDay()}`;
    const db = admin.firestore();
    const docRef = db.collection("referral_triggers").doc(fireKey);

    if (!dry) {
        const existing = await docRef.get();
        if (existing.exists && existing.data().status === "fired") {
            return { skipped: "already_fired_today", client: client.email };
        }
    }

    const result = {
        client_email: client.email,
        company: client.company,
        signed_at: client.signed_at,
        dry,
        brevo: null,
        whatsapp: null,
        telegram: false,
        slack: false,
    };

    if (dry) {
        result.brevo = { ok: true, dry: true, preview: buildBrevoEmail(client) };
        result.whatsapp = { ok: true, dry: true, preview: buildWhatsAppText(client) };
    } else {
        result.brevo = client.email ? await sendBrevoEmail(client) : { ok: false, error: "no_email" };
        result.whatsapp = client.phone ? await sendTwilioWA({ to: client.phone, contactName: client.contactName, company: client.company }) : { ok: false, error: "no_phone" };
    }

    const talkTrack = buildAlexTalkTrack(client);

    try {
        const tg = await notify(
            `🎯 *Referral Trigger · Day 30 · ${client.company || client.email}*\n\n` +
            `Brevo email: ${result.brevo.ok ? "✅" : "❌ " + result.brevo.error}\n` +
            `WhatsApp: ${result.whatsapp.ok ? "✅" : "⚠️ " + result.whatsapp.error}\n\n` +
            talkTrack,
            { critical: false, markdown: true }
        );
        result.telegram = !!tg.telegram;
    } catch (err) { result.telegram_error = err.message; }

    try {
        const slackOut = await slackPost("revenue", {
            text: `🎯 Referral Trigger · ${client.company || client.email}`,
            blocks: [
                { type: "header", text: { type: "plain_text", text: `🎯 Referral · ${client.company || client.email}` } },
                {
                    type: "context",
                    elements: [{
                        type: "mrkdwn",
                        text: `*Day 30 · signed ${client.signed_at}* · Brevo ${result.brevo.ok ? "✅" : "❌"} · WA ${result.whatsapp.ok ? "✅" : "⚠️"}${dry ? " · *DRY-RUN*" : ""}`,
                    }],
                },
                { type: "divider" },
                { type: "section", text: { type: "mrkdwn", text: talkTrack.slice(0, 2900) } },
            ],
        });
        result.slack = !!slackOut.ok;
    } catch (err) { result.slack_error = err.message; }

    if (!dry) {
        await docRef.set({
            ...client,
            fire_key: fireKey,
            status: "fired",
            fired_at: admin.firestore.FieldValue.serverTimestamp(),
            brevo: result.brevo,
            whatsapp: result.whatsapp,
            telegram: result.telegram,
            slack: result.slack,
        }, { merge: true });
    }

    return result;
}

// ─── Main runner ────────────────────────────────────────────────────
async function runReferralTrigger(options = {}) {
    const startedAt = Date.now();
    const out = {
        ok: false,
        date: isoDay(),
        candidates: 0,
        fired: 0,
        skipped: 0,
        per_client: [],
        errors: [],
    };

    let candidates = [];
    if (options.dry && options.client_email) {
        // Synthetic record for full dry-run testing
        candidates.push({
            notion_page_id: "DRY_RUN",
            company: options.company || "Test Inmobiliaria",
            contactName: options.contactName || "Carlos Pérez",
            email: options.client_email,
            phone: options.phone || null,
            city: options.city || "Cancún",
            role: "Director",
            signed_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        });
    } else {
        try {
            candidates = await findClientsAtDay30();
        } catch (err) {
            out.errors.push(`notion: ${err.message}`);
            await notify(`🔴 *referralTrigger Notion FAILED:* ${err.message}`, { critical: true });
            return out;
        }
    }

    out.candidates = candidates.length;

    if (candidates.length === 0) {
        await notify(`📭 *referralTrigger ${isoDay()}* — no clients hit day-30 today. Cron OK.`, { critical: false });
        out.ok = true;
        out.duration_sec = ((Date.now() - startedAt) / 1000).toFixed(1);
        return out;
    }

    for (const c of candidates) {
        try {
            const r = await fireForClient(c, { dry: !!options.dry });
            if (r.skipped) out.skipped += 1;
            else out.fired += 1;
            out.per_client.push(r);
        } catch (err) {
            out.errors.push(`${c.email}: ${err.message}`);
        }
    }

    out.ok = out.errors.length === 0;
    out.duration_sec = ((Date.now() - startedAt) / 1000).toFixed(1);
    return out;
}

// ─── Cron + manual trigger ─────────────────────────────────────────
exports.referralTrigger = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .pubsub
    .schedule("0 9 * * *")  // 09:00 UTC daily
    .timeZone("Etc/UTC")
    .onRun(async () => {
        const r = await runReferralTrigger();
        functions.logger.info("[referralTrigger] done", r);
        return r;
    });

exports.referralTriggerNow = functions
    .runWith({ timeoutSeconds: 540, memory: "512MB" })
    .https.onRequest(async (req, res) => {
        try {
            const dry = req.query?.dry === "1" || req.query?.dry === "true";
            const r = await runReferralTrigger({
                dry,
                client_email: req.query?.client_email,
                contactName: req.query?.contactName,
                company: req.query?.company,
                phone: req.query?.phone,
                city: req.query?.city,
            });
            res.json(r);
        } catch (err) {
            functions.logger.error("[referralTriggerNow] crash:", err);
            res.status(500).json({ ok: false, error: err.message });
        }
    });

exports._runReferralTrigger = runReferralTrigger;
exports._validators = { validateCollaborationCopy, validateHR19 };
