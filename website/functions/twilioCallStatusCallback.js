/**
 * Twilio StatusCallback → ElevenLabs zombie-call killer (proxy)
 * ===============================================================
 * Twilio POSTs every call status change here. We do TWO things:
 *
 *   1. PROXY the same POST body upstream to ElevenLabs's own status-callback
 *      endpoint (https://api.elevenlabs.io/twilio/status-callback) so their
 *      internal bookkeeping (transcripts, billing, session lifecycle) keeps
 *      working. Before this function existed, Twilio called ElevenLabs
 *      directly. We sit in the middle now, so we MUST forward.
 *
 *   2. On terminal status (completed/failed/no-answer/busy/canceled), look
 *      up the linked ElevenLabs conversation by callSid and force-close it
 *      via DELETE. Solves the zombie-SIP bug where Twilio drops in 0-1s but
 *      the ElevenLabs agent holds the session open until max_duration_seconds.
 *
 * Wired on phone number +52 998 387 1618 (Twilio SID PN62b3ad78ab3c268cccf7a9230cb7fc46
 * / ElevenLabs ID phnum_8801kp77en3ee56t0t291zyv40ne) via
 * IncomingPhoneNumbers.statusCallback. See SYSTEM.md §10.4 for context.
 *
 * Created 2026-04-21 — fixes the Twilio↔ElevenLabs SIP divergence root cause.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const https = require("https");
const crypto = require("crypto");
const querystring = require("querystring");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ElevenLabs's own status-callback endpoint — the original target before we
// inserted ourselves in the middle. We forward unchanged to keep their
// internal lifecycle accounting healthy.
const ELEVENLABS_STATUS_CALLBACK_URL =
  "https://api.elevenlabs.io/twilio/status-callback";

// Twilio sends terminal statuses for outbound calls. We act on these:
const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "no-answer",
  "busy",
  "canceled",
]);

/**
 * Validate Twilio's signature so random callers can't trigger force-close.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
function validateTwilioSignature(authToken, signatureHeader, fullUrl, params) {
  if (!signatureHeader || !authToken) return false;
  const sortedKeys = Object.keys(params).sort();
  let data = fullUrl;
  for (const k of sortedKeys) data += k + (params[k] || "");
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
  return expected === signatureHeader;
}

/**
 * Forward the original application/x-www-form-urlencoded body to ElevenLabs's
 * own status-callback so their lifecycle/transcripts/billing keep working.
 * Fire-and-observe — logs but never throws (we must always ack Twilio 200).
 */
function forwardToElevenLabs(params) {
  return new Promise((resolve) => {
    const body = querystring.stringify(params);
    const url = new URL(ELEVENLABS_STATUS_CALLBACK_URL);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 5000,
      },
      (res) => {
        let bodyTxt = "";
        res.on("data", (c) => (bodyTxt += c));
        res.on("end", () =>
          resolve({ ok: res.statusCode < 500, status: res.statusCode, body: bodyTxt.slice(0, 200) }),
        );
      },
    );
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.write(body);
    req.end();
  });
}

/**
 * DELETE /v1/convai/conversations/{id} — ends the ElevenLabs session.
 * Returns true on 200/204, false otherwise (logs the error).
 */
function deleteElevenLabsConversation(conversationId, apiKey) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: "api.elevenlabs.io",
        path: `/v1/convai/conversations/${conversationId}`,
        method: "DELETE",
        headers: { "xi-api-key": apiKey },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, status: res.statusCode });
          } else {
            resolve({
              ok: false,
              status: res.statusCode,
              body: body.slice(0, 200),
            });
          }
        });
      },
    );
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

/**
 * Main handler — Twilio POSTs application/x-www-form-urlencoded.
 * Firebase parses it into req.body for us.
 */
exports.twilioCallStatusCallback = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    // Always return 200 to Twilio so they don't auto-disable the webhook.
    // We acknowledge first, then do the work.
    if (req.method !== "POST") return res.status(200).send("ignored");

    const params = req.body || {};
    const callSid = params.CallSid;
    const callStatus = params.CallStatus;
    const callDuration = parseInt(params.CallDuration || "0", 10);
    const direction = params.Direction;

    if (!callSid) {
      functions.logger.warn("twilioCallStatusCallback: missing CallSid");
      return res.status(200).send("no-callsid");
    }

    // Signature validation (optional — set TWILIO_AUTH_TOKEN to enable)
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (authToken) {
      const sig = req.header("X-Twilio-Signature");
      const fullUrl = `https://${req.hostname}${req.originalUrl}`;
      if (!validateTwilioSignature(authToken, sig, fullUrl, params)) {
        functions.logger.warn(
          `twilioCallStatusCallback: bad signature for ${callSid}`,
        );
        return res.status(403).send("invalid signature");
      }
    }

    functions.logger.info(
      `📞 Twilio status: ${callSid} → ${callStatus} (${callDuration}s, ${direction})`,
    );

    // ALWAYS forward to ElevenLabs first (for every status, non-terminal too)
    // so their session lifecycle tracking stays accurate. Fire-and-observe.
    const forwardResult = await forwardToElevenLabs(params);
    if (!forwardResult.ok) {
      functions.logger.warn(
        `twilioCallStatusCallback: forward to ElevenLabs failed for ${callSid} — ` +
          `${forwardResult.status || forwardResult.error}`,
      );
    }

    // Only run force-close on terminal statuses
    if (!TERMINAL_STATUSES.has(callStatus)) {
      return res.status(200).send(`status=${callStatus} (non-terminal, forwarded)`);
    }

    // Look up the ElevenLabs conversation_id by CallSid
    let conversationId = null;
    try {
      const snap = await db
        .collection("call_analysis")
        .where("callSid", "==", callSid)
        .limit(1)
        .get();
      if (!snap.empty) {
        conversationId = snap.docs[0].id;
      }
    } catch (err) {
      functions.logger.error(
        `twilioCallStatusCallback: lookup failed for ${callSid}: ${err.message}`,
      );
    }

    if (!conversationId) {
      functions.logger.warn(
        `twilioCallStatusCallback: no call_analysis match for CallSid=${callSid}. ` +
          `Lead probably dispatched before callSid persistence shipped.`,
      );
      return res.status(200).send("no-match");
    }

    // Force-close the ElevenLabs conversation
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      functions.logger.error(
        "twilioCallStatusCallback: missing ELEVENLABS_API_KEY",
      );
      return res.status(200).send("no-api-key");
    }

    const startedAt = Date.now();
    const result = await deleteElevenLabsConversation(conversationId, apiKey);
    const elapsedMs = Date.now() - startedAt;

    functions.logger.info(
      `🛑 Force-close ${conversationId.slice(-12)} (CallSid ${callSid.slice(-8)}): ` +
        `ok=${result.ok} status=${result.status} took=${elapsedMs}ms`,
    );

    // Annotate call_analysis so reports can see the force-close happened
    try {
      await db
        .collection("call_analysis")
        .doc(conversationId)
        .set(
          {
            twilio_final_status: callStatus,
            twilio_duration_seconds: callDuration,
            force_closed: result.ok,
            force_closed_at: admin.firestore.FieldValue.serverTimestamp(),
            force_close_status_code: result.status || null,
            ...(result.ok ? {} : { force_close_error: result.body || result.error || null }),
          },
          { merge: true },
        );
    } catch (err) {
      functions.logger.error(
        `twilioCallStatusCallback: call_analysis update failed for ${conversationId}: ${err.message}`,
      );
    }

    return res.status(200).send(
      result.ok ? `closed ${conversationId}` : `close-failed ${result.status}`,
    );
  });
