/**
 * whatsappCloudInbound.js
 *
 * Cloud Function endpoint for Meta WhatsApp Cloud API inbound messages on
 * "+1 978 396 7234" (Phone Number ID 1044375245434120, WABA 1520533496454283).
 *
 * Endpoint: https://us-central1-jegodigital-e02fb.cloudfunctions.net/whatsappCloudInbound
 *
 * Setup (one-time, in Meta WABA → Configuration → Webhook):
 *   1. Callback URL = endpoint above
 *   2. Verify token = WA_CLOUD_VERIFY_TOKEN env var (default 'jego_wa_cloud_verify_2026')
 *   3. Subscribe to: messages, message_status
 *   4. ⚠️ The current configured webhook at WABA points to the abandoned
 *      jegodigital-2ed98 project — Alex must update it in Meta UI to swap to
 *      this URL.
 *
 * Flow on each inbound message:
 *   1. GET hub.challenge → echo
 *   2. POST { entry:[{ changes:[{ value:{ messages:[{from,id,type,text:{body}}] } }] }] }
 *      → load Sofia conversation history from Firestore (wa_cloud_conversations/{from})
 *      → call Gemini with system prompt (reuses Sofia's whatsappAIResponder logic shape)
 *      → reply via whatsappCloudSend.sendText
 *      → write to Firestore + alert Telegram + Slack on hot leads
 *
 * Last updated: 2026-05-03 (initial ship — replaces abandoned -2ed98 webhook).
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { sendText } = require('./whatsappCloudSend');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const VERIFY_TOKEN =
  process.env.WA_CLOUD_VERIFY_TOKEN || 'jego_wa_cloud_verify_2026';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const TG_BOT =
  process.env.TELEGRAM_BOT_TOKEN ||
  '8645322502:AAGSDeU-4JL5kl0V0zYS--nWXIgiacpcJu8';
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || '6637626501';

const GEMINI_MODEL = 'gemini-2.5-flash';

const SOFIA_PROMPT = `Eres Sofia, asistente IA de bienes raíces de JegoDigital. Hablas español neutro mexicano, registro "tú", peer-to-peer, NUNCA "usted". Tono: directo, breve, cálido, profesional.

REGLAS DURAS:
1. NUNCA cotices precios.
2. NUNCA digas que eres IA. Eres Sofia del equipo de JegoDigital.
3. Tu objetivo PRIMARIO: que la persona acepte una auditoría gratis de su sitio + AEO.
4. Tu objetivo SECUNDARIO: agendar Calendly https://calendly.com/jegoalexdigital/30min
5. Si dicen URGENTE → "Alex te contacta en los próximos 5 minutos."
6. Respuestas máximo 2-3 oraciones. Cierra con UNA pregunta para avanzar.

OUTPUT EXTRA — al final agrega INVISIBLE para el usuario un bloque <META>{"intent":"...","escalate":true|false,"qualified":true|false}</META>. NO se muestra al usuario.`;

async function callGemini(systemPrompt, history) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: history,
    generationConfig: { temperature: 0.65, maxOutputTokens: 400 },
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (j.error) {
    functions.logger.error('[whatsappCloudInbound] Gemini error', j.error);
    return {
      reply: 'Disculpa, hubo un detalle técnico. Te respondo en 1 minuto.',
      meta: {},
    };
  }
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let meta = {};
  const m = text.match(/<META>([\s\S]*?)<\/META>/);
  if (m) {
    try {
      meta = JSON.parse(m[1].trim());
    } catch (_e) {}
  }
  const cleanReply = text.replace(/<META>[\s\S]*?<\/META>/g, '').trim();
  return { reply: cleanReply, meta };
}

async function tgAlert(text) {
  if (!TG_BOT || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_BOT}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TG_CHAT,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    functions.logger.error('[whatsappCloudInbound] tg alert error', e.message);
  }
}

exports.whatsappCloudInbound = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB' })
  .https.onRequest(async (req, res) => {
    // GET — verification handshake
    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
      }
      return res.status(403).send('Verification failed');
    }
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');

    // ACK Meta fast
    res.status(200).send('OK');

    const entries = (req.body && req.body.entry) || [];
    for (const entry of entries) {
      for (const ch of entry.changes || []) {
        if (ch.field !== 'messages') continue;
        const v = ch.value || {};
        const messages = v.messages || [];
        const contacts = v.contacts || [];
        const contactName = contacts?.[0]?.profile?.name || '';

        for (const msg of messages) {
          const from = msg.from; // E.164 digits
          const msgId = msg.id;
          const type = msg.type;
          const text =
            type === 'text'
              ? msg.text?.body
              : type === 'button'
                ? msg.button?.text
                : type === 'interactive'
                  ? msg.interactive?.button_reply?.title ||
                    msg.interactive?.list_reply?.title ||
                    ''
                  : `[${type} message]`;

          if (!from || !text) continue;

          try {
            // Load conversation history (last 12 turns)
            const convoRef = db.collection('wa_cloud_conversations').doc(from);
            const convoDoc = await convoRef.get();
            const existing = convoDoc.exists ? convoDoc.data() : {};
            const history = (existing.messages || []).slice(-12);

            history.push({ role: 'user', parts: [{ text }] });

            // Call Sofia
            const { reply, meta } = await callGemini(SOFIA_PROMPT, history);
            history.push({ role: 'model', parts: [{ text: reply }] });

            // Send WA reply
            const sendResult = await sendText({ to: from, body: reply });

            // Persist
            await convoRef.set(
              {
                wa_number: from,
                contactName,
                messages: history.slice(-24), // cap
                last_meta: meta,
                last_sent_status: sendResult.status,
                last_inbound_id: msgId,
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            // Hot-lead alert
            if (meta.escalate === true || meta.qualified === true) {
              await tgAlert(
                `🔥 <b>Sofía WA hot lead</b>\n` +
                  `<b>From:</b> +${from}\n` +
                  `<b>Name:</b> ${contactName || '—'}\n` +
                  `<b>Intent:</b> ${meta.intent || '—'}\n` +
                  `<b>Escalate:</b> ${meta.escalate || false}\n` +
                  `<b>Qualified:</b> ${meta.qualified || false}\n` +
                  `<b>Last msg:</b> ${text.slice(0, 200)}`
              );

              try {
                const { slackPost } = require('./slackPost');
                await slackPost('leads-hot', {
                  text: `🔥 Sofía WA hot lead: +${from}`,
                  blocks: [
                    {
                      type: 'header',
                      text: {
                        type: 'plain_text',
                        text: '🔥 Sofía WA hot lead',
                      },
                    },
                    {
                      type: 'section',
                      fields: [
                        { type: 'mrkdwn', text: `*From:*\n+${from}` },
                        { type: 'mrkdwn', text: `*Name:*\n${contactName || '—'}` },
                        { type: 'mrkdwn', text: `*Intent:*\n${meta.intent || '—'}` },
                        {
                          type: 'mrkdwn',
                          text: `*Escalate:*\n${meta.escalate || false}`,
                        },
                      ],
                    },
                    {
                      type: 'section',
                      text: {
                        type: 'mrkdwn',
                        text: `*Last message:*\n>${text.slice(0, 400)}`,
                      },
                    },
                  ],
                });
              } catch (e) {
                functions.logger.error(
                  '[whatsappCloudInbound] slack alert error',
                  e.message
                );
              }
            }
          } catch (e) {
            functions.logger.error(
              `[whatsappCloudInbound] error on msg ${msgId}`,
              e.message,
              e.stack
            );
          }
        }
      }
    }
  });
