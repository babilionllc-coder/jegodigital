/**
 * metaLeadFormWebhook.js
 * Receives Meta Instant Lead Form fills, fires audit pipeline + Brevo.
 *
 * Endpoint: https://us-central1-jegodigital-e02fb.cloudfunctions.net/metaLeadFormWebhook
 *
 * Setup (one-time, in Meta Events Manager):
 *   1. Pages → JegoDigital (page id 61581425401975) → Lead Center → "Apps connected to lead forms"
 *   2. Add app → callback URL = this endpoint, verify token = META_LEAD_VERIFY_TOKEN env var
 *   3. Subscribe to: leadgen events
 *
 * Flow on each lead:
 *   1. GET (verification): Meta sends ?hub.mode=subscribe&hub.challenge=... → echo challenge
 *   2. POST (lead event): { entry: [{ changes: [{ field:"leadgen", value:{leadgen_id, page_id, form_id, ...} }] }] }
 *      → fetch full lead via Graph API
 *      → POST to Brevo (add to "Hiring Intent FB" list)
 *      → POST to submitAuditRequest internal endpoint
 *      → write to Firestore meta_lead_events
 *      → return 200 fast (Meta retries on 5xx)
 *
 * ENV VARS REQUIRED:
 *   META_LEAD_VERIFY_TOKEN   - random string, set on both sides
 *   META_PAGE_ACCESS_TOKEN   - long-lived page token (60d) from JegoDigital Page
 *   BREVO_API_KEY            - already in env
 *   BREVO_HIRING_INTENT_FB_LIST_ID - Brevo list ID for the FB-sourced leads
 *   AUDIT_INTERNAL_ENDPOINT  - https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID - for Slack/Telegram ping
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const META_LEAD_VERIFY_TOKEN = process.env.META_LEAD_VERIFY_TOKEN || 'jegodigital_meta_lead_verify_2026';
const META_PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN || '';
const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_HIRING_INTENT_FB_LIST_ID = parseInt(
  process.env.BREVO_HIRING_INTENT_FB_LIST_ID || '0',
  10
);
const AUDIT_INTERNAL_ENDPOINT =
  process.env.AUDIT_INTERNAL_ENDPOINT ||
  'https://us-central1-jegodigital-e02fb.cloudfunctions.net/submitAuditRequest';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

/**
 * Fetch full lead details from Meta Graph API using the leadgen_id.
 */
async function fetchLeadFromMeta(leadgenId) {
  if (!META_PAGE_ACCESS_TOKEN) {
    console.warn('[metaLeadFormWebhook] META_PAGE_ACCESS_TOKEN missing');
    return null;
  }
  const url =
    `https://graph.facebook.com/v22.0/${leadgenId}?` +
    `access_token=${encodeURIComponent(META_PAGE_ACCESS_TOKEN)}` +
    `&fields=id,created_time,ad_id,form_id,campaign_id,adset_id,field_data`;
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) {
    console.error('[metaLeadFormWebhook] Graph API error:', j);
    return null;
  }
  return j;
}

/**
 * Parse Meta's field_data array into a flat dict.
 *   field_data: [{ name: "email", values: ["test@..."] }, ...]
 */
function parseFieldData(fieldData = []) {
  const out = {};
  for (const f of fieldData) {
    out[f.name.toLowerCase().replace(/\s+/g, '_')] = (f.values && f.values[0]) || '';
  }
  return out;
}

/**
 * Add to Brevo Hiring Intent FB list.
 */
async function postToBrevo(email, firstName, attributes = {}) {
  if (!BREVO_API_KEY) {
    console.warn('[metaLeadFormWebhook] BREVO_API_KEY missing');
    return null;
  }
  const body = {
    email,
    attributes: {
      ...(firstName && { FIRSTNAME: firstName }),
      ...attributes,
      SOURCE: 'meta_lead_form',
      MEDIUM: 'paid_social',
      CAMPAIGN: 'hiring_intent_retarget',
    },
    listIds: BREVO_HIRING_INTENT_FB_LIST_ID ? [BREVO_HIRING_INTENT_FB_LIST_ID] : [],
    updateEnabled: true,
  };
  const r = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok && r.status !== 400 /* dup ok */) {
    console.error('[metaLeadFormWebhook] Brevo error:', r.status, txt);
    return null;
  }
  return { status: r.status, body: txt };
}

/**
 * Send the FB welcome email immediately (within 30 sec of form fill).
 * Bridges the 45-min audit silence so we don't lose the highest-intent moment.
 * Per 2026 research: <5 min response = 21x conversion lift.
 *
 * Brevo transactional template ID 71 ("FB Welcome — Auditoría cocinándose 2026-04")
 * Subject: "✅ {firstName}, tu auditoría llega en 60 min"
 */
async function sendFBWelcomeEmail(email, firstName, url) {
  if (!BREVO_API_KEY) return null;
  const TEMPLATE_ID = parseInt(process.env.BREVO_FB_WELCOME_TEMPLATE_ID || '71', 10);
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: TEMPLATE_ID,
        to: [{ email, name: firstName || 'Inmobiliaria' }],
        params: {
          FIRSTNAME: firstName || 'Inmobiliaria',
          URL: url || 'tu sitio',
        },
      }),
    });
    const txt = await r.text();
    if (!r.ok) {
      console.error('[metaLeadFormWebhook] welcome email error:', r.status, txt);
      return null;
    }
    console.log(`[metaLeadFormWebhook] ✓ welcome email sent to ${email}`);
    return { status: r.status, body: txt };
  } catch (e) {
    console.error('[metaLeadFormWebhook] welcome email exception:', e.message);
    return null;
  }
}

/**
 * Fire the audit pipeline so the lead gets a full audit emailed to them.
 */
async function fireAuditPipeline(email, url, firstName, leadgenId, extraAttrs = {}) {
  if (!url || !email) {
    console.warn('[metaLeadFormWebhook] Missing url or email for audit, skipping');
    return null;
  }
  // submitAuditRequest expects: website_url, name, email, source, company (NOT url, firstName)
  const r = await fetch(AUDIT_INTERNAL_ENDPOINT + '?source=meta_lead_form', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      website_url: url,
      name: firstName || 'Inmobiliaria',
      email,
      source: 'meta_lead_form',
      // Pass through Lead Form qualification answers as company-side context
      // so the audit narrative can mention "you mentioned X" — these are
      // saved into Firestore audit doc and used by the email template.
      meta_leads_per_month: extraAttrs.leads_per_month || '',
      meta_main_frustration: extraAttrs.main_frustration || '',
      meta_leadgen_id: leadgenId,
      meta_campaign: 'hiring_intent_retarget',
    }),
  });
  const txt = await r.text();
  return { status: r.status, body: txt };
}

/**
 * Telegram alert.
 */
async function notifyTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error('[metaLeadFormWebhook] Telegram error:', e.message);
  }
}

exports.metaLeadFormWebhook = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    // ── GET: Meta verification handshake ─────────────────────
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === META_LEAD_VERIFY_TOKEN) {
        console.log('[metaLeadFormWebhook] Verification OK');
        return res.status(200).send(challenge);
      }
      console.warn('[metaLeadFormWebhook] Verification FAILED', { mode, token });
      return res.status(403).send('Verification failed');
    }

    // ── POST: lead event ─────────────────────────────────────
    if (req.method !== 'POST') {
      return res.status(405).send('Method not allowed');
    }

    const body = req.body || {};
    const entries = body.entry || [];

    // Process each lead change. Respond 200 immediately to Meta to prevent retries.
    res.status(200).send('OK');

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const ch of changes) {
        if (ch.field !== 'leadgen') continue;
        const v = ch.value || {};
        const leadgenId = v.leadgen_id;
        const formId = v.form_id;
        const adId = v.ad_id;
        const adsetId = v.adset_id;
        const campaignId = v.campaign_id;
        const pageId = v.page_id;
        const createdTime = v.created_time;

        if (!leadgenId) continue;

        try {
          // 1. Fetch full lead
          const lead = await fetchLeadFromMeta(leadgenId);
          if (!lead) {
            console.warn(`[metaLeadFormWebhook] Lead ${leadgenId} fetch failed`);
            continue;
          }

          const fields = parseFieldData(lead.field_data || []);
          const email = (fields.email || fields.correo_electrónico || '').toLowerCase().trim();
          const firstName = fields.first_name || fields.nombre || '';
          const lastName = fields.last_name || fields.apellido || '';
          const url =
            fields.url_del_sitio_web_inmobiliario ||
            fields.url ||
            fields.sitio_web ||
            fields.website ||
            fields.site_url ||
            '';
          const whatsapp =
            fields.whatsapp || fields.telefono || fields.phone || fields.phone_number || '';
          // Lead Form qualification answers — used to personalize audit + segment Brevo
          const leadsPerMonth = fields.leads_per_month || fields['_cuantos_leads_por_mes_manejas_hoy?'] || '';
          const mainFrustration = fields.main_frustration || fields['_que_te_frustra_mas_de_tu_marketing_actual?'] || '';

          // 2. Write to Firestore (audit log)
          await db.collection('meta_lead_events').doc(leadgenId).set(
            {
              leadgenId,
              formId,
              adId,
              adsetId,
              campaignId,
              pageId,
              createdTime,
              email,
              firstName,
              lastName,
              url,
              whatsapp,
              fields,
              processedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          // 3. POST to Brevo (with qualification answers for segmentation)
          const brevoResult = await postToBrevo(email, firstName, {
            LASTNAME: lastName,
            URL: url,
            WHATSAPP: whatsapp,
            META_LEADGEN_ID: leadgenId,
            META_AD_ID: adId,
            META_CAMPAIGN_ID: campaignId,
            LEADS_PER_MONTH: leadsPerMonth,
            MAIN_FRUSTRATION: mainFrustration,
          });

          // 4a. WELCOME EMAIL — fires within 30 sec of form fill.
          //     Bridges the 45-min audit silence.
          //     Per 2026 research: <5 min response = 21× conversion lift.
          const welcomeResult = await sendFBWelcomeEmail(email, firstName, url);

          // 4a2. Meta CAPI Lead event — sends to Meta server-side for dedup
          //      with native Pixel tracking. Improves Event Match Quality.
          let capiLeadResult = null;
          try {
            const { sendLeadEvent } = require('./metaCAPIDispatcher');
            capiLeadResult = await sendLeadEvent({
              email, firstName, phone: whatsapp, country: 'mx', leadgenId,
            });
          } catch (e) {
            console.error('[metaLeadFormWebhook] CAPI Lead event failed (non-fatal):', e.message);
          }

          // 4b. Fire audit pipeline (gets the full audit emailed in <60min)
          //     submitAuditRequest expects website_url + name + email (NOT url + firstName).
          //     Pass qualification answers so audit narrative can reference them.
          const auditResult = await fireAuditPipeline(email, url, firstName, leadgenId, {
            leads_per_month: leadsPerMonth,
            main_frustration: mainFrustration,
          });

          // 5. Telegram ping (includes welcome status)
          await notifyTelegram(
            `🎯 <b>Meta Lead Form fill</b>\n` +
              `<b>Email:</b> ${email}\n` +
              `<b>URL:</b> ${url || '—'}\n` +
              `<b>WhatsApp:</b> ${whatsapp || '—'}\n` +
              `<b>Name:</b> ${firstName} ${lastName}\n` +
              `<b>Leads/mo:</b> ${leadsPerMonth || '—'} | <b>Frustration:</b> ${mainFrustration || '—'}\n` +
              `<b>Campaign:</b> hiring_intent_retarget\n` +
              `<b>Brevo:</b> ${brevoResult?.status || 'skip'} | <b>Welcome:</b> ${welcomeResult?.status || 'skip'} | <b>Audit:</b> ${auditResult?.status || 'skip'}`
          );

          console.log(`[metaLeadFormWebhook] ✓ Processed lead ${leadgenId} (${email})`);
        } catch (e) {
          console.error(`[metaLeadFormWebhook] Error processing ${leadgenId}:`, e.message, e.stack);
          await notifyTelegram(
            `🚨 Meta Lead Form webhook error\nLeadgen: ${leadgenId}\nError: ${e.message}`
          );
        }
      }
    }
  });
