/**
 * leadRecoveryQueue.js
 *
 * Implements the 6-touch Meta Lead Form recovery sequence on top of the
 * existing metaLeadFormWebhook flow. The webhook already covers:
 *   T+0       → welcome email (Brevo template 71)
 *   T+0       → immediate Sofia WA opener (Meta Cloud API)
 *   T+1/3/7/14/21d → 5-email Brevo nurture (D+1 / D+3 / D+7 / D+14 / D+21)
 *
 * THIS module adds the missing pieces per Alex's 2026-05-04 spec:
 *   T+60min   → Twilio WA recovery follow-up (recovery_followup_es / _en
 *               content templates submitted 2026-05-04 — wait for Meta
 *               approval before this fires successfully).
 *   T+10d     → cold-mark + move to long-term nurture list.
 *
 * Mechanism: Firestore-backed queue (`lead_recovery_queue`) processed by a
 * scheduled Cloud Function every 10 min. Each row is a single touch with a
 * `fireAt` timestamp; processed rows are flagged `done` (or `failed`).
 *
 * Why a Firestore queue (not Cloud Tasks): Cloud Tasks needs a queue created
 * via gcloud and adds a deploy dependency. The Firestore-poll pattern
 * already exists in calendlyWebhook.processScheduledEmails — same shape.
 */

const admin = require('firebase-admin');
const functions = require('firebase-functions');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

// Twilio WhatsApp BSP "from" number — Sofia AI WA per Alex 2026-05-04 brief.
// Format Twilio expects: whatsapp:+19783967234
const TWILIO_WA_FROM =
  process.env.TWILIO_WA_FROM || 'whatsapp:+19783967234';

// Content SIDs minted 2026-05-04 (status: received → pending Meta review).
// When Meta approves they flip to 'approved' automatically — no code change.
const CONTENT_SID_ES =
  process.env.TWILIO_CONTENT_SID_RECOVERY_ES ||
  'HX967007aed41675057d137e874fc7c2ea';
const CONTENT_SID_EN =
  process.env.TWILIO_CONTENT_SID_RECOVERY_EN ||
  'HXaf21322e170e1894b46d92ae9fb1431f';

const BREVO_API_KEY = process.env.BREVO_API_KEY || '';
const BREVO_LONG_TERM_NURTURE_LIST_ID = parseInt(
  process.env.BREVO_LONG_TERM_NURTURE_LIST_ID || '42',
  10
);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const ONE_MIN = 60 * 1000;
const ONE_DAY = 24 * 60 * ONE_MIN;

/**
 * Decide which language the Twilio recovery template should fire in.
 * Mexico/MX numbers + Spanish-domain leads → ES. US numbers → EN.
 */
function pickRecoveryLanguage({ whatsapp = '', email = '' }) {
  const num = (whatsapp || '').toString().replace(/[^\d]/g, '');
  if (num.startsWith('52')) return 'es';
  if (num.startsWith('1')) return 'en';
  // Default: Spanish (JegoDigital's primary market is MX real estate).
  return 'es';
}

/**
 * enqueueRecoveryTouches — called by metaLeadFormWebhook after the
 * immediate touchpoints fire. Writes 2 future touches to Firestore.
 *
 * Returns: { queued: 2, touches: ['t60min_wa', 't10d_cold'] }
 */
async function enqueueRecoveryTouches(lead) {
  const now = Date.now();
  const lang = pickRecoveryLanguage(lead);
  const sharedFields = {
    leadgenId: lead.leadgenId,
    email: (lead.email || '').toLowerCase().trim(),
    firstName: lead.firstName || '',
    company: lead.company || '',
    websiteUrl: lead.websiteUrl || '',
    whatsapp: (lead.whatsapp || '').toString().replace(/[^\d]/g, ''),
    enqueuedAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending',
  };

  const touches = [];

  // ── T+60min — Twilio WA recovery follow-up ─────────────────────
  if (sharedFields.whatsapp && sharedFields.whatsapp.length >= 10) {
    const t60min = {
      ...sharedFields,
      kind: 't60min_wa_recovery',
      fireAt: admin.firestore.Timestamp.fromMillis(now + 60 * ONE_MIN),
      contentSid: lang === 'en' ? CONTENT_SID_EN : CONTENT_SID_ES,
      language: lang,
    };
    await db.collection('lead_recovery_queue').add(t60min);
    touches.push('t60min_wa_recovery');
  } else {
    console.log(
      `[leadRecoveryQueue] skip t60min for ${sharedFields.email} — no WA number`
    );
  }

  // ── T+10d — cold-mark + move to long-term nurture list ─────────
  const t10d = {
    ...sharedFields,
    kind: 't10d_cold_mark',
    fireAt: admin.firestore.Timestamp.fromMillis(now + 10 * ONE_DAY),
  };
  await db.collection('lead_recovery_queue').add(t10d);
  touches.push('t10d_cold_mark');

  return { queued: touches.length, touches, language: lang };
}

/**
 * Send a Twilio WhatsApp message using a Content Template SID.
 * Returns { ok, status, body, sid? }
 */
async function sendTwilioWaTemplate({
  to,
  contentSid,
  contentVariables,
}) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { ok: false, status: 0, body: 'twilio_creds_missing' };
  }
  const auth = Buffer.from(
    `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
  ).toString('base64');
  const params = new URLSearchParams();
  params.append('From', TWILIO_WA_FROM);
  params.append('To', `whatsapp:+${to.replace(/[^\d]/g, '')}`);
  params.append('ContentSid', contentSid);
  if (contentVariables) {
    params.append('ContentVariables', JSON.stringify(contentVariables));
  }
  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  );
  const txt = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(txt); } catch (_) {}
  return {
    ok: r.ok,
    status: r.status,
    body: txt,
    sid: parsed?.sid || null,
    errorCode: parsed?.code || null,
  };
}

/**
 * Add an existing Brevo contact to a different list and tag as cold.
 * Used for T+10d cold-mark.
 */
async function moveBrevoContactToLongTerm(email) {
  if (!BREVO_API_KEY || !email) return null;
  try {
    const r = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        updateEnabled: true,
        listIds: [BREVO_LONG_TERM_NURTURE_LIST_ID],
        attributes: {
          LEAD_TEMPERATURE: 'Cold',
          COLD_MARKED_AT: new Date().toISOString(),
        },
      }),
    });
    return { status: r.status, body: await r.text() };
  } catch (e) {
    return { status: 0, body: e.message };
  }
}

async function notifyTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );
  } catch (_) { /* non-fatal */ }
}

/**
 * processRecoveryQueue — scheduled Cloud Function, runs every 10 min.
 * Picks up due touches (`fireAt <= now`, `status == 'pending'`) and fires.
 */
exports.processRecoveryQueue = functions
  .runWith({ timeoutSeconds: 540, memory: '256MB' })
  .pubsub.schedule('every 10 minutes')
  .timeZone('America/Cancun')
  .onRun(async () => {
    const nowTs = admin.firestore.Timestamp.now();
    const snap = await db
      .collection('lead_recovery_queue')
      .where('status', '==', 'pending')
      .where('fireAt', '<=', nowTs)
      .limit(50)
      .get();

    if (snap.empty) {
      console.log('[processRecoveryQueue] no due touches');
      return null;
    }

    let processed = 0;
    let failed = 0;

    for (const doc of snap.docs) {
      const t = doc.data();
      try {
        if (t.kind === 't60min_wa_recovery') {
          // Personalize {{1}}=FirstName, {{2}}=Company per Twilio template variables
          const firstName = t.firstName || 'there';
          const company = t.company || t.websiteUrl || 'tu inmobiliaria';
          const wa = await sendTwilioWaTemplate({
            to: t.whatsapp,
            contentSid: t.contentSid,
            contentVariables: { 1: firstName, 2: company },
          });
          if (wa.ok && wa.sid) {
            await doc.ref.update({
              status: 'done',
              firedAt: admin.firestore.FieldValue.serverTimestamp(),
              twilioSid: wa.sid,
            });
            processed++;
            console.log(
              `[processRecoveryQueue] ✓ t60min_wa sent to +${t.whatsapp} (sid=${wa.sid})`
            );
          } else if (wa.errorCode === 63016 || /not approved/i.test(wa.body || '')) {
            // Template not yet approved by Meta → re-queue +24h, don't fail.
            await doc.ref.update({
              status: 'pending',
              fireAt: admin.firestore.Timestamp.fromMillis(
                Date.now() + ONE_DAY
              ),
              lastError: 'template_pending_approval',
              retryCount: admin.firestore.FieldValue.increment(1),
            });
            console.log(
              `[processRecoveryQueue] template pending approval, re-queued ${doc.id} +24h`
            );
          } else {
            await doc.ref.update({
              status: 'failed',
              firedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastError: `twilio_${wa.status}_${wa.errorCode || 'err'}`,
              lastErrorBody: (wa.body || '').slice(0, 500),
            });
            failed++;
          }
        } else if (t.kind === 't10d_cold_mark') {
          await moveBrevoContactToLongTerm(t.email);
          await db.collection('lead_journey').add({
            leadgenId: t.leadgenId,
            email: t.email,
            event: 'cold_marked_t10d',
            ts: admin.firestore.FieldValue.serverTimestamp(),
          });
          await doc.ref.update({
            status: 'done',
            firedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          processed++;
          await notifyTelegram(
            `🧊 <b>Lead cold-marked (T+10d)</b>\n${t.email} (${t.company || '—'}) moved to long-term nurture list ${BREVO_LONG_TERM_NURTURE_LIST_ID}`
          );
        } else {
          await doc.ref.update({
            status: 'failed',
            lastError: `unknown_kind_${t.kind}`,
          });
          failed++;
        }
      } catch (e) {
        await doc.ref.update({
          status: 'failed',
          lastError: e.message?.slice(0, 500) || 'unknown',
        });
        failed++;
        console.error(
          `[processRecoveryQueue] error on ${doc.id}:`,
          e.message
        );
      }
    }

    console.log(
      `[processRecoveryQueue] processed=${processed} failed=${failed} batch=${snap.size}`
    );
    return null;
  });

module.exports = {
  enqueueRecoveryTouches,
  processRecoveryQueue: exports.processRecoveryQueue,
  pickRecoveryLanguage,
  // Exposed for tests / manual replay
  sendTwilioWaTemplate,
  moveBrevoContactToLongTerm,
};
