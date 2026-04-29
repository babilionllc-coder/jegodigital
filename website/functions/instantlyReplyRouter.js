/**
 * instantlyReplyRouter — autonomous per-campaign reply composer + sender.
 *
 * Solves the gap identified by Alex on 2026-04-28: Instantly's global AI Reply
 * Agent has no per-campaign prompt — it sends the same audit-funnel response
 * to every positive reply. So a developer who replied to "Lanzamiento Preventa"
 * was about to receive `/auditoria-gratis` (wrong link) instead of
 * `/lanzamiento-preventa` (the actual offer they bit on).
 *
 * What this does:
 *   1. Called by instantlyReplyWatcher on every classified positive reply
 *   2. Looks up the campaign UUID in CAMPAIGN_ROUTES
 *   3. Composes a tailored reply (link + CTA + social proof per campaign)
 *   4. POSTs to Instantly v2 /api/v2/emails/reply using the original mailbox
 *      (eaccount field = original sender), reply_to_uuid = the inbound reply UUID
 *   5. Logs to Firestore reply_routing_log for audit
 *   6. Returns {ok, sentEmailId, route} so the watcher can record on the activity ledger
 *
 * Verified 2026-04-28: POST /api/v2/emails/reply with {reply_to_uuid, eaccount,
 * subject, body:{html}} returns 200 + sent email object. Route confirmed live.
 *
 * Failure mode: if campaign_id not in routing table → returns
 * {ok:false, reason:'unknown_campaign'} and the watcher falls back to existing
 * Brevo Track A nurture (which already runs for all positives).
 *
 * No double-reply risk: Instantly's global AI Reply Agent has the routed
 * campaigns excluded via campaign tag (set up post-deploy in Unibox UI).
 *
 * Hard rules satisfied:
 *   HR-0 — every link/CTA/proof in the response is a real campaign-mapped string,
 *          no estimates, no "industry averages"
 *   HR-6 — caller must verify the Instantly response status before marking sent
 *   HR-12 — every routed reply uses plain Spanish/English, zero AI-tool jargon
 *   HR-13 — Alex never manually composes a reply for any routed campaign
 */

const axios = require("axios");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Phase 1 Slack command center 2026-04-29: cross-post every routed positive
// reply to #hot-leads so Alex sees fresh fires instantly without polling.
const { slackPost } = require("./slackPost");

const INSTANTLY_API = "https://api.instantly.ai/api/v2";
const INSTANTLY_KEY = process.env.INSTANTLY_API_KEY;

const CALENDLY = "https://calendly.com/jegoalexdigital/30min";
const WHATSAPP = "+52 998 202 3263";
const WHATSAPP_LINK = "https://wa.me/529982023263";

/**
 * Per-campaign reply routing table.
 * Add a new entry every time a new Instantly campaign launches.
 *
 * Schema:
 *   key: campaign UUID (from Instantly /api/v2/campaigns)
 *   primary_link: the URL the prospect clicks to take next step
 *   cta_es / cta_en: short call-to-action line (one sentence)
 *   social_proof_es / social_proof_en: one client/result anchor line
 *   lang_default: 'es' or 'en' if lead language can't be detected from body
 */
const CAMPAIGN_ROUTES = {
    // Lanzamiento Preventa 90 Días — for developers running pre-sale launches
    "2a810fd5-f236-4bb7-aec2-c1043f681561": {
        name: "Lanzamiento Preventa 90 Días",
        primary_link: "https://jegodigital.com/lanzamiento-preventa?source=reply_router",
        cta_es: "¿Qué desarrollo tienes en pipeline? 15 min para mapear los 90 días.",
        cta_en: "What development do you have in the pipeline? 15 min to map the 90 days.",
        social_proof_es: "Flamingo Real Estate: #1 Google Maps Cancún + 4.4x visibilidad en 90 días.",
        social_proof_en: "Flamingo Real Estate: #1 Google Maps Cancún + 4.4x visibility in 90 days.",
        lang_default: "es",
    },
    // Auditoría Gratis — Tu Sitio Web (MX audit funnel)
    "8b5f556f-9259-4258-b74b-2df55712f520": {
        name: "Auditoría Gratis",
        primary_link: "https://jegodigital.com/auditoria-gratis",
        cta_es: "Llega el reporte en 45 min, después agendamos 15 min para revisarlo juntos.",
        cta_en: "Report arrives in 45 min, then we schedule 15 min to review it together.",
        social_proof_es: "Solik Real Estate: 95% leads calificados automáticamente.",
        social_proof_en: "Solik Real Estate: 95% leads qualified automatically.",
        lang_default: "es",
    },
    // Trojan Horse — Captura de Leads Gratis
    "cd9f1abf-3ad5-460c-88e9-29c48bc058b3": {
        name: "Trojan Horse — Captura de Leads",
        primary_link: "https://jegodigital.com/lead-capture-demo",
        cta_es: "Te muestro cómo Sofia responde en menos de 60s. ¿Agendamos 15 min?",
        cta_en: "I'll show you how Sofia responds in under 60s. Want to grab 15 min?",
        social_proof_es: "Goza Real Estate: 3x más leads + 24/7 cobertura IA.",
        social_proof_en: "Goza Real Estate: 3x more leads + 24/7 AI coverage.",
        lang_default: "es",
    },
    // USA Hispanic RE — Hiring Intent A/B/C
    "e891bda7-bb24-4ed4-88e9-1ca8832cec05": {
        name: "USA Hispanic RE — Hiring Intent",
        primary_link: "https://jegodigital.com/auditoria-gratis?source=hiring_intent",
        cta_es: "Te llega un audit personalizado en 45 min — luego agendamos 15 min.",
        cta_en: "You'll get a personalized audit in 45 min — then we book 15 min.",
        social_proof_es: "Flamingo Real Estate: 4.4x visibilidad + #1 Google Maps en 90 días.",
        social_proof_en: "Flamingo Real Estate: 4.4x visibility + #1 Google Maps in 90 days.",
        lang_default: "en",
    },
    // US-Hispanic-Bilingual-Audit
    "dbb9dfd7-4ae2-4a44-ba28-d895206d78d6": {
        name: "US-Hispanic-Bilingual-Audit",
        primary_link: "https://jegodigital.com/auditoria-gratis?source=us_hispanic_audit",
        cta_es: "Audit bilingüe ES/EN llega en 45 min. ¿15 min después?",
        cta_en: "Bilingual ES/EN audit arrives in 45 min. 15 min after?",
        social_proof_es: "Solik Real Estate: bilingüe EN/ES + 95% calificación.",
        social_proof_en: "Solik Real Estate: bilingual EN/ES + 95% qualification rate.",
        lang_default: "en",
    },
    // Free Demo Website — MX RE
    "d486f1ab-4668-4674-ad6b-80ef12d9fd78": {
        name: "Free Demo Website — MX RE",
        primary_link: "https://jegodigital.com/demo-website",
        cta_es: "Te muestro el demo del sitio en 60 segundos. ¿Te lo paso?",
        cta_en: "I'll show you the demo site in 60 seconds. Want me to send it?",
        social_proof_es: "Goza Real Estate: 98 PageSpeed + sitio en menos de 2s.",
        social_proof_en: "Goza Real Estate: 98 PageSpeed + site loads in under 2s.",
        lang_default: "es",
    },
    // USA Miami RE — Hiring + Audit Personalization
    "acffe5c9-9a74-4b3f-8a95-37882a11f96b": {
        name: "USA Miami RE Hiring + Audit",
        primary_link: "https://jegodigital.com/auditoria-gratis?source=miami_hiring",
        cta_es: "Audit bilingüe Miami → 45 min, después 15 min en Calendly.",
        cta_en: "Miami bilingual audit → 45 min, then 15 min on Calendly.",
        social_proof_es: "Solik Real Estate: bilingüe EN/ES + escrow automation.",
        social_proof_en: "Solik Real Estate: bilingual EN/ES + escrow automation.",
        lang_default: "en",
    },
    // Trojan Horse V2 — Personalized
    "a1139971-4c50-44f1-ac79-3a726a70c8b5": {
        name: "Trojan Horse V2 — Personalized",
        primary_link: "https://jegodigital.com/lead-capture-demo",
        cta_es: "El sistema lo instalo gratis en 14 días. ¿15 min para verlo?",
        cta_en: "I install the system free in 14 days. 15 min to see it?",
        social_proof_es: "Goza: 3x leads. Flamingo: 88% leads automatizados.",
        social_proof_en: "Goza: 3x leads. Flamingo: 88% leads automated.",
        lang_default: "es",
    },
    // Audit_Trojan_MX_Supersearch_v1
    "51074dc9-fce9-4a20-b8a0-4f283ac52177": {
        name: "Audit_Trojan_MX_Supersearch_v1",
        primary_link: "https://jegodigital.com/auditoria-gratis?source=supersearch",
        cta_es: "Audit + sistema de captura — los 2. ¿15 min para mapearlo?",
        cta_en: "Audit + capture system — both. 15 min to map it?",
        social_proof_es: "Flamingo + Goza + Solik: tres casos en 90 días cada uno.",
        social_proof_en: "Flamingo + Goza + Solik: three cases in 90 days each.",
        lang_default: "es",
    },
    // signal_outbound_mx_20260424
    "45454ff8-6d2f-48db-8c62-e0c19a94a3c1": {
        name: "signal_outbound_mx_20260424",
        primary_link: "https://jegodigital.com/auditoria-gratis?source=signal_mx",
        cta_es: "Te llega el audit en 45 min. ¿Calendly después?",
        cta_en: "Audit arrives in 45 min. Calendly after?",
        social_proof_es: "Flamingo: 4.4x visibilidad. GoodLife: +300% orgánico.",
        social_proof_en: "Flamingo: 4.4x visibility. GoodLife: +300% organic.",
        lang_default: "es",
    },
};

/**
 * Detect language from reply body (simple heuristic).
 * Returns 'es' or 'en'.
 */
function detectLang(body) {
    const text = String(body || "").toLowerCase();
    const es = (text.match(/[¿áéíóúñ]|gracias|hola|saludos|me interesa|cuándo|información|cómo/g) || []).length;
    const en = (text.match(/\b(thanks|hello|hi|interested|when|info|how|sure)\b/g) || []).length;
    if (es > en) return "es";
    if (en > es) return "en";
    return null; // caller falls back to lang_default
}

/**
 * Compose the reply HTML body for a routed campaign.
 * Keeps the structure minimal — 4-5 short paragraphs, signature.
 */
function composeReply(route, lang, leadFirstName, leadCompanyName) {
    const fname = leadFirstName || (lang === "en" ? "there" : "");
    const greeting = lang === "en" ? `Hi ${fname},` : `Hola ${fname},`;
    const opener = lang === "en"
        ? `Thanks for the reply${leadCompanyName ? ` — great to hear from ${leadCompanyName}` : ""}.`
        : `Gracias por responder${leadCompanyName ? ` — gusto saber de ${leadCompanyName}` : ""}.`;
    const offer = lang === "en"
        ? `Quick next step: ${route.cta_en}`
        : `Siguiente paso: ${route.cta_es}`;
    const proof = lang === "en" ? route.social_proof_en : route.social_proof_es;
    const link = `<a href="${route.primary_link}">${route.primary_link.replace(/\?.*$/, "")}</a>`;
    const calendly = lang === "en"
        ? `Direct link: <a href="${CALENDLY}">${CALENDLY.replace("https://", "")}</a>`
        : `Link directo: <a href="${CALENDLY}">${CALENDLY.replace("https://", "")}</a>`;
    const wa = lang === "en"
        ? `WhatsApp backup: <a href="${WHATSAPP_LINK}">${WHATSAPP}</a>`
        : `WhatsApp si prefieres: <a href="${WHATSAPP_LINK}">${WHATSAPP}</a>`;
    const sig = `Alex<br>JegoDigital`;

    const html = `<div>${greeting}</div>
<div><br></div>
<div>${opener}</div>
<div><br></div>
<div>${offer}</div>
<div><br></div>
<div>${link}</div>
<div><br></div>
<div>${proof}</div>
<div><br></div>
<div>${calendly} · ${wa}</div>
<div><br></div>
<div>${sig}</div>`;
    return html;
}

/**
 * Build the subject line (Re: prefix on whatever original subject was).
 */
function buildSubject(originalSubject) {
    let s = String(originalSubject || "").trim();
    if (!s) return "Re: tu mensaje";
    if (/^re:/i.test(s)) return s;
    return `Re: ${s}`;
}

/**
 * Send the reply via Instantly v2 API.
 * Returns {ok, status, sentId, error}.
 */
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
                    "User-Agent": "JegoDigital-ReplyRouter/1.0",
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

/**
 * Main entry point — called by instantlyReplyWatcher on each positive reply.
 *
 * @param {object} params
 * @param {string} params.replyToUuid    — UUID of the inbound reply email
 * @param {string} params.campaignId     — Instantly campaign UUID
 * @param {string} params.eaccount       — original sender mailbox (e.g. ariana@zennoenigmawire.com)
 * @param {string} params.originalSubject — subject of the inbound reply
 * @param {string} params.replyBody      — raw text of inbound reply (for lang detection)
 * @param {string} params.leadEmail      — for logging
 * @param {string} [params.leadFirstName]
 * @param {string} [params.leadCompanyName]
 * @returns {object} {ok, route, sentId, lang, reason}
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
    } = params;

    if (!campaignId) return { ok: false, reason: "no_campaign_id" };
    const route = CAMPAIGN_ROUTES[campaignId];
    if (!route) {
        functions.logger.info(
            `instantlyReplyRouter: no route for campaign ${campaignId} — falling back to global agent`,
        );
        return { ok: false, reason: "unknown_campaign", campaign_id: campaignId };
    }
    if (!replyToUuid || !eaccount) {
        return { ok: false, reason: "missing_required_fields" };
    }

    const lang = detectLang(replyBody) || route.lang_default;
    const html = composeReply(route, lang, leadFirstName, leadCompanyName);
    const subject = buildSubject(originalSubject);

    const sendRes = await sendInstantlyReply({ replyToUuid, eaccount, subject, html });

    // Audit log to Firestore (HR-6 proof)
    try {
        const db = admin.firestore();
        await db.collection("reply_routing_log").add({
            campaign_id: campaignId,
            campaign_name: route.name,
            lead_email: leadEmail || null,
            reply_to_uuid: replyToUuid,
            eaccount,
            lang,
            subject,
            primary_link: route.primary_link,
            sent_email_id: sendRes.sentId || null,
            ok: sendRes.ok,
            error: sendRes.ok ? null : (sendRes.error || "unknown"),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (logErr) {
        functions.logger.warn("reply_routing_log write failed:", logErr.message);
    }

    // Phase 1 Slack command center 2026-04-29: cross-post every successful
    // routed reply to #hot-leads. Detect "interested" intent on the way in;
    // if the inbound reply text contains hot keywords ("interested",
    // "información", "cuánto", "sí me interesa") OR if Instantly already
    // labelled it positive (which is implied by the watcher calling us at
    // all), we cross-post. Failure is non-fatal — slackPost has its own
    // webhook fallback chain.
    if (sendRes.ok) {
        try {
            const hotKeywords = /\b(interested|interesa|información|informacion|cuánto|cuanto|sí|si me|tell me more|let'?s talk|hablemos|m[aá]s info)\b/i;
            const isHot = !replyBody || hotKeywords.test(replyBody);
            const intentEmoji = isHot ? "🔥" : "✅";
            const blocks = [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: `${intentEmoji} Hot reply — ${route.name}`,
                        emoji: true,
                    },
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text:
                            `*Lead:* ${leadFirstName ? leadFirstName + " · " : ""}\`${leadEmail || "?"}\`` +
                            (leadCompanyName ? ` · *${leadCompanyName}*` : "") +
                            `\n*Campaign:* ${route.name}\n*Lang:* ${lang}\n*Routed CTA:* ${route.primary_link || "—"}`,
                    },
                },
                {
                    type: "context",
                    elements: [
                        { type: "mrkdwn", text: `_Auto-replied via mailbox \`${eaccount}\` · sent_id \`${sendRes.sentId || "?"}\`. Open Instantly Unibox to nurture._` },
                    ],
                },
            ];
            if (replyBody) {
                blocks.splice(2, 0, {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `*Inbound reply:*\n>${replyBody.slice(0, 500).replace(/\n/g, "\n>")}`,
                    },
                });
            }
            await slackPost("hot-leads", {
                text: `${intentEmoji} Hot reply from ${leadEmail || "?"} on ${route.name}`,
                blocks,
            });
        } catch (slackErr) {
            functions.logger.warn("hot-leads cross-post failed:", slackErr.message);
        }
    }

    return {
        ok: sendRes.ok,
        route: route.name,
        sentId: sendRes.sentId,
        lang,
        reason: sendRes.ok ? null : sendRes.error,
    };
}

module.exports = {
    routeReply,
    CAMPAIGN_ROUTES,  // exported so health checks / tests can introspect
    composeReply,     // exported for unit tests
    detectLang,       // exported for unit tests
};
