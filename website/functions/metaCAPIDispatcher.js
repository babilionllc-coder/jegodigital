/**
 * metaCAPIDispatcher.js — sends Meta Conversion API events server-side.
 *
 * Why: Meta optimizes against the events it sees. Without CAPI, it only sees
 * Lead Form fills (form_fill = noisy, low quality). With CAPI, it sees Schedule
 * (Calendly bookings) and CompleteRegistration (audit page views) — far better
 * signals. Result per Meta data: 15-30% lower CPL with higher win rates.
 *
 * The 4 events we send:
 *   1. Lead                  — Lead Form fill (already auto-tracked via webhook, but we
 *                              also send via CAPI for deduplication)
 *   2. CompleteRegistration  — submitAuditRequest fires (audit pipeline started)
 *   3. Schedule              — Calendly booking (the highest-value signal pre-revenue)
 *   4. Purchase              — Client signs proposal (ultimate ROI signal)
 *
 * Pixel ID: 2356041791557638
 * Auth: uses FB_USER_TOKEN (has ads_management — verified working 2026-04-28)
 */

const admin = require('firebase-admin');
const crypto = require('crypto');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const PIXEL_ID = '2356041791557638';
const ACCESS_TOKEN = process.env.FB_USER_TOKEN || '';
const TEST_EVENT_CODE = process.env.META_CAPI_TEST_CODE || ''; // set during testing only

/**
 * SHA-256 hash for PII fields (email, phone, fn, ln, etc) per Meta CAPI spec.
 * Lowercase + trim before hashing.
 */
function hash(s) {
  if (!s) return undefined;
  return crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex');
}

/**
 * Strip + format phone for hashing: digits only, with country code (no +/spaces/dashes).
 */
function hashPhone(p) {
  if (!p) return undefined;
  const digits = String(p).replace(/\D/g, '');
  if (!digits) return undefined;
  return crypto.createHash('sha256').update(digits).digest('hex');
}

/**
 * Build the user_data block for a CAPI event.
 * Pass whatever you have — Meta uses match-priority across fields.
 */
function buildUserData({ email, phone, firstName, lastName, country, zip, fbp, fbc, externalId, clientIp, userAgent }) {
  const ud = {};
  if (email) ud.em = [hash(email)];
  if (phone) ud.ph = [hashPhone(phone)];
  if (firstName) ud.fn = [hash(firstName)];
  if (lastName) ud.ln = [hash(lastName)];
  if (country) ud.country = [hash(country)];
  if (zip) ud.zp = [hash(zip)];
  if (externalId) ud.external_id = [hash(externalId)];
  // Browser-side cookies (pass through if available — boost match quality from ~5 to ~8+)
  if (fbp) ud.fbp = fbp;
  if (fbc) ud.fbc = fbc;
  if (clientIp) ud.client_ip_address = clientIp;
  if (userAgent) ud.client_user_agent = userAgent;
  return ud;
}

/**
 * Send a single CAPI event. Returns { ok, response, error }.
 */
async function sendEvent({
  eventName,           // 'Lead' | 'CompleteRegistration' | 'Schedule' | 'Purchase'
  eventTime,           // unix seconds; default = now
  eventId,             // unique dedupe key — REQUIRED for clean optimization
  eventSourceUrl,      // page URL the event happened on
  actionSource = 'website', // 'website' | 'system_generated' | 'physical_store' | 'app'
  userData = {},       // see buildUserData
  customData = {},     // currency, value, content_name, etc
}) {
  if (!ACCESS_TOKEN) {
    console.warn('[metaCAPI] FB_USER_TOKEN missing');
    return { ok: false, error: 'no_token' };
  }
  if (!eventName) {
    return { ok: false, error: 'missing_eventName' };
  }

  const evt = {
    event_name: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data: userData,
  };
  if (eventId) evt.event_id = eventId;
  if (eventSourceUrl) evt.event_source_url = eventSourceUrl;
  if (customData && Object.keys(customData).length) evt.custom_data = customData;

  const body = new URLSearchParams();
  body.set('data', JSON.stringify([evt]));
  body.set('access_token', ACCESS_TOKEN);
  if (TEST_EVENT_CODE) body.set('test_event_code', TEST_EVENT_CODE);

  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const j = await r.json();
    if (!r.ok || j.error) {
      console.error('[metaCAPI] error:', j);
      // Log every CAPI failure to Firestore for debugging
      await db.collection('meta_capi_errors').add({
        eventName, eventId, error: j.error || j, sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { ok: false, response: j, error: j.error };
    }
    console.log(`[metaCAPI] ✓ ${eventName} (event_id=${eventId}) → received: ${j.events_received}`);
    return { ok: true, response: j };
  } catch (e) {
    console.error('[metaCAPI] exception:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Convenience: Schedule event for Calendly bookings.
 * Call from calendlyWebhook on invitee.created.
 */
async function sendScheduleEvent({ email, firstName, lastName, phone, country, eventId, calendlyEventUrl, value, currency }) {
  return sendEvent({
    eventName: 'Schedule',
    eventId,
    eventSourceUrl: calendlyEventUrl || 'https://calendly.com/jegoalexdigital/30min',
    actionSource: 'website',
    userData: buildUserData({ email, phone, firstName, lastName, country: country || 'mx' }),
    customData: { currency: currency || 'USD', value: value || 50 },
  });
}

/**
 * Convenience: Lead event for Meta Lead Form fills.
 * Call from metaLeadFormWebhook (in addition to native Pixel tracking — for dedup).
 */
async function sendLeadEvent({ email, firstName, phone, country, leadgenId }) {
  return sendEvent({
    eventName: 'Lead',
    eventId: leadgenId, // Meta dedupes against this
    eventSourceUrl: 'https://www.facebook.com/' + leadgenId,
    actionSource: 'system_generated',
    userData: buildUserData({ email, phone, firstName, country: country || 'mx' }),
    customData: { lead_event_source: 'meta_instant_form' },
  });
}

/**
 * Convenience: CompleteRegistration when audit pipeline fires.
 * Call from submitAuditRequest after Firestore write.
 */
async function sendCompleteRegistrationEvent({ email, firstName, source, websiteUrl, eventId }) {
  return sendEvent({
    eventName: 'CompleteRegistration',
    eventId,
    eventSourceUrl: 'https://jegodigital.com/auditoria-gratis',
    actionSource: 'website',
    userData: buildUserData({ email, firstName }),
    customData: {
      content_name: 'auditoria_gratis',
      registration_source: source || 'unknown',
      website_audited: websiteUrl,
    },
  });
}

/**
 * Convenience: Purchase when client signs proposal (manual trigger or Notion CRM webhook).
 */
async function sendPurchaseEvent({ email, firstName, phone, value, currency, contentName, eventId }) {
  return sendEvent({
    eventName: 'Purchase',
    eventId,
    actionSource: 'physical_store',
    userData: buildUserData({ email, phone, firstName }),
    customData: {
      currency: currency || 'MXN',
      value: value || 18900,
      content_name: contentName || 'Pack Crecimiento',
    },
  });
}

module.exports = {
  sendEvent,
  sendScheduleEvent,
  sendLeadEvent,
  sendCompleteRegistrationEvent,
  sendPurchaseEvent,
  buildUserData,
  hash,
  hashPhone,
};
