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
 * Fire the audit pipeline so the lead gets a full audit emailed to them.
 */
async function fireAuditPipeline(email, url, firstName, leadgenId) {
  if (!url || !email) {
    console.warn('[metaLeadFormWebhook] Missing url or email for audit, skipping');
    return null;
  }
  const r = await fetch(AUDIT_INTERNAL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      url,
      firstName: firstName || 'Inmobiliaria',
      source: 'meta_lead_form',
      campaign: 'hiring_intent_retarget',
      leadgenId,
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
            '';
          const whatsapp =
            fields.whatsapp || fields.telefono || fields.phone || fields.phone_number || '';

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

          // 3. POST to Brevo
          const brevoResult = await postToBrevo(email, firstName, {
            LASTNAME: lastName,
            URL: url,
            WHATSAPP: whatsapp,
            META_LEADGEN_ID: leadgenId,
            META_AD_ID: adId,
            META_CAMPAIGN_ID: campaignId,
          });

          // 4. Fire audit pipeline (gets the full audit emailed in <60min)
          const auditResult = await fireAuditPipeline(email, url, firstName, leadgenId);

          // 5. Telegram ping
          await notifyTelegram(
            `🎯 <b>Meta Lead Form fill</b>\n` +
              `<b>Email:</b> ${email}\n` +
              `<b>URL:</b> ${url || '—'}\n` +
              `<b>WhatsApp:</b> ${whatsapp || '—'}\n` +
              `<b>Name:</b> ${firstName} ${lastName}\n` +
              `<b>Campaign:</b> hiring_intent_retarget\n` +
              `<b>Brevo:</b> ${brevoResult?.status || 'skip'} | <b>Audit:</b> ${auditResult?.status || 'skip'}`
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
