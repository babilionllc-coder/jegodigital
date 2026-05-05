/**
 * whatsappCloudSend.js
 *
 * Outbound helper for Sofia AI WhatsApp on "+1 978 396 7234".
 * Architecture (verified 2026-05-05): Twilio is the BSP for this number.
 * Sends route through Twilio Messages API.
 *
 *   Twilio account SID  : env TWILIO_ACCOUNT_SID
 *   Twilio auth token   : env TWILIO_AUTH_TOKEN
 *   Sofia from number   : env TWILIO_WHATSAPP_FROM (default +19783967234)
 *
 * Three send modes (preserved API surface for callers):
 *   1. sendText({ to, body })          — only inside the 24-hour conversation
 *                                         window (user has messaged us first).
 *   2. sendTemplate({ to, templateName, languageCode, components })
 *                                       — outbound-initiated. Translates the
 *                                         Meta-style template params to a
 *                                         Twilio ContentSid + ContentVariables.
 *   3. sendTemplateBySid({ to, contentSid, contentVariables })
 *                                       — direct Twilio path when you already
 *                                         know the ContentSid.
 *
 * Template-name → ContentSid mapping is defined in TWILIO_TEMPLATE_MAP below.
 * Update when new templates are approved.
 *
 * Returns: { ok:bool, status:int, id?:string, error?:string, body?:any }
 *
 * Last updated: 2026-05-05 — refactored to Twilio. Meta direct path retained
 *               as fallback in `sendTextViaMeta` for migration off Twilio.
 */
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM_RAW = process.env.TWILIO_WHATSAPP_FROM || '+19783967234';

// Meta direct (kept for fallback only — current architecture uses Twilio):
const PHONE_NUMBER_ID =
  process.env.WA_CLOUD_PHONE_NUMBER_ID || '1044375245434120';
const META_TOKEN =
  process.env.WA_CLOUD_ACCESS_TOKEN || process.env.FB_USER_TOKEN || '';
const GRAPH_VERSION = 'v22.0';

// Map Meta-style templateName → Twilio ContentSid
// Update this when new templates are approved at content.twilio.com
const TWILIO_TEMPLATE_MAP = {
  recovery_followup_en: 'HXaf21322e170e1894b46d92ae9fb1431f',
  recovery_followup_es: 'HX967007aed41675057d137e874fc7c2ea',
  // sofia_lead_form_opener_es: '<add when approved>',
  // hello_world: '<add when registered in Twilio Content API>',
};

/**
 * Normalize a phone number to E.164 digits-only (no +, no spaces).
 *   "+52 998 202 3263" → "529982023263"
 */
function normalizeWa(num) {
  if (!num) return '';
  return String(num).replace(/[^\d]/g, '');
}

/**
 * Convert a digits-only number into Twilio's `whatsapp:+...` format.
 */
function twilioWa(num) {
  const digits = normalizeWa(num);
  if (!digits) return '';
  return `whatsapp:+${digits}`;
}

/**
 * Twilio basic-auth header.
 */
function twilioAuthHeader() {
  if (!TWILIO_SID || !TWILIO_AUTH) return null;
  const cred = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64');
  return `Basic ${cred}`;
}

/**
 * Translate Meta-style components array to Twilio ContentVariables.
 * Meta:   [{ type:'body', parameters:[{ type:'text', text:'Alex' }, { type:'text', text:'JegoDigital' }] }]
 * Twilio: { "1": "Alex", "2": "JegoDigital" }
 */
function componentsToContentVariables(components) {
  const variables = {};
  if (!Array.isArray(components)) return variables;
  let idx = 1;
  for (const comp of components) {
    if (comp?.type === 'body' && Array.isArray(comp.parameters)) {
      for (const p of comp.parameters) {
        if (p?.type === 'text' && p.text != null) {
          variables[String(idx)] = String(p.text);
          idx++;
        }
      }
    }
  }
  return variables;
}

/**
 * Send a free-form text message (only valid inside the 24h conversation window).
 */
async function sendText({ to, body }) {
  const auth = twilioAuthHeader();
  if (!auth)
    return {
      ok: false,
      status: 0,
      error: 'TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN required',
    };
  if (!to) return { ok: false, status: 0, error: 'invalid_to_number' };
  if (!body || typeof body !== 'string')
    return { ok: false, status: 0, error: 'empty_body' };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams();
  params.set('From', `whatsapp:${TWILIO_FROM_RAW}`);
  params.set('To', twilioWa(to));
  params.set('Body', body);

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const j = await r.json();
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: j?.message || 'send_failed',
        body: j,
      };
    }
    return { ok: true, status: r.status, id: j?.sid, body: j };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * Send an APPROVED template (works outside the 24-hour window).
 * Translates Meta-style template params → Twilio ContentSid + ContentVariables.
 */
async function sendTemplate({
  to,
  templateName,
  languageCode = 'es_MX', // accepted for API compat — Twilio derives lang from ContentSid
  components = [],
}) {
  if (!templateName)
    return { ok: false, status: 0, error: 'template_name_required' };
  const contentSid = TWILIO_TEMPLATE_MAP[templateName];
  if (!contentSid) {
    return {
      ok: false,
      status: 0,
      error: `template_not_in_twilio_map: ${templateName}. Add ContentSid to TWILIO_TEMPLATE_MAP.`,
    };
  }
  const contentVariables = componentsToContentVariables(components);
  return sendTemplateBySid({ to, contentSid, contentVariables });
}

/**
 * Direct path: send a Twilio template by ContentSid (skips the name-mapping step).
 */
async function sendTemplateBySid({ to, contentSid, contentVariables = {} }) {
  const auth = twilioAuthHeader();
  if (!auth)
    return {
      ok: false,
      status: 0,
      error: 'TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN required',
    };
  if (!to) return { ok: false, status: 0, error: 'invalid_to_number' };
  if (!contentSid)
    return { ok: false, status: 0, error: 'content_sid_required' };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;
  const params = new URLSearchParams();
  params.set('From', `whatsapp:${TWILIO_FROM_RAW}`);
  params.set('To', twilioWa(to));
  params.set('ContentSid', contentSid);
  if (Object.keys(contentVariables).length) {
    params.set('ContentVariables', JSON.stringify(contentVariables));
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const j = await r.json();
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: j?.message || 'send_failed',
        body: j,
      };
    }
    return { ok: true, status: r.status, id: j?.sid, body: j };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * LEGACY: Meta direct send (preserved for the day we migrate off Twilio).
 * Currently fails with code 200 because Twilio holds the BSP relationship.
 * Do NOT use unless you've migrated the phone number off Twilio.
 */
async function sendTextViaMeta({ to, body }) {
  if (!META_TOKEN)
    return { ok: false, status: 0, error: 'WA_CLOUD_ACCESS_TOKEN missing' };
  const phone = normalizeWa(to);
  if (!phone) return { ok: false, status: 0, error: 'invalid_to_number' };
  if (!body || typeof body !== 'string')
    return { ok: false, status: 0, error: 'empty_body' };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'text',
    text: { preview_url: false, body },
  };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: j?.error?.message || 'send_failed',
        body: j,
      };
    }
    return { ok: true, status: r.status, id: j?.messages?.[0]?.id, body: j };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

module.exports = {
  sendText,
  sendTemplate,
  sendTemplateBySid,
  sendTextViaMeta, // legacy fallback
  normalizeWa,
  TWILIO_TEMPLATE_MAP,
};
