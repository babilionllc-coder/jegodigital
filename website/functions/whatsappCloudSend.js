/**
 * whatsappCloudSend.js
 *
 * Outbound helper for Meta WhatsApp Cloud API on the
 * VERIFIED, GREEN-quality phone "+1 978 396 7234".
 *
 *   WABA ID         : 1520533496454283
 *   Phone Number ID : 1044375245434120  (Cloud API, TIER_250)
 *
 * Two send modes:
 *   1. sendText({ to, body })          — only inside the 24-hour conversation
 *                                         window (user has messaged us first).
 *   2. sendTemplate({ to, templateName, languageCode, components })
 *                                       — outbound-initiated. Requires an
 *                                         APPROVED template under the WABA.
 *
 * ENV (Firebase Functions config or .env):
 *   WA_CLOUD_PHONE_NUMBER_ID   1044375245434120
 *   WA_CLOUD_ACCESS_TOKEN      <long-lived system-user token w/ whatsapp_business_messaging>
 *   (fallback) FB_USER_TOKEN   long-lived user token — works if it has wa perms
 *
 * Returns: { ok:bool, status:int, id?:string, error?:string, body?:any }
 *
 * Last updated: 2026-05-03 (initial ship — wires Sofia AI on Meta WA Cloud API,
 *               replacing the abandoned jegodigital-2ed98 webhook).
 */
const PHONE_NUMBER_ID =
  process.env.WA_CLOUD_PHONE_NUMBER_ID || '1044375245434120';
const TOKEN =
  process.env.WA_CLOUD_ACCESS_TOKEN || process.env.FB_USER_TOKEN || '';
const GRAPH_VERSION = 'v22.0';

/**
 * Normalize a phone number to E.164 digits-only (no +, no spaces).
 *   "+52 998 202 3263" → "529982023263"
 *   "529982023263"     → "529982023263"
 */
function normalizeWa(num) {
  if (!num) return '';
  return String(num).replace(/[^\d]/g, '');
}

async function sendText({ to, body, leadId, userInitiated = true, firstTouch = false }) {
  if (!TOKEN)
    return { ok: false, status: 0, error: 'WA_CLOUD_ACCESS_TOKEN missing' };
  const phone = normalizeWa(to);
  if (!phone) return { ok: false, status: 0, error: 'invalid_to_number' };
  if (!body || typeof body !== 'string')
    return { ok: false, status: 0, error: 'empty_body' };

  // ---------- Compliance gate (sofia_wa channel) ----------
  // Free-form text only valid inside the 24h conversation window — userInitiated
  // defaults to TRUE (lead messaged us first). Gates 1-3 honor that. Gates 4-7
  // always run. Kill switch: env COMPLIANCE_GATE_ENFORCE=false.
  try {
    const { complianceGate } = require('./complianceGate');
    const gate = await complianceGate(
      {
        to,
        body,
        sender: PHONE_NUMBER_ID || '+19783967234',
        leadId: leadId || null,
        userInitiated,
        firstTouch,
      },
      'sofia_wa'
    );
    if (!gate.pass) {
      return {
        ok: false,
        status: 0,
        error: `compliance_block:${gate.reason}`,
        compliance: gate,
      };
    }
  } catch (e) {
    // Gate errors must not break valid user-initiated work — log but proceed.
  }

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
        Authorization: `Bearer ${TOKEN}`,
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
    return {
      ok: true,
      status: r.status,
      id: j?.messages?.[0]?.id,
      body: j,
    };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * Send an APPROVED template (works outside the 24-hour window).
 * components example:
 *   [{ type:'body', parameters:[{ type:'text', text:'Alex' }] }]
 */
async function sendTemplate({
  to,
  templateName,
  languageCode = 'es_MX',
  components = [],
}) {
  if (!TOKEN)
    return { ok: false, status: 0, error: 'WA_CLOUD_ACCESS_TOKEN missing' };
  const phone = normalizeWa(to);
  if (!phone) return { ok: false, status: 0, error: 'invalid_to_number' };
  if (!templateName)
    return { ok: false, status: 0, error: 'template_name_required' };

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {}),
    },
  };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
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
    return {
      ok: true,
      status: r.status,
      id: j?.messages?.[0]?.id,
      body: j,
    };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

module.exports = { sendText, sendTemplate, normalizeWa };
