# 📡 WhatsApp Architecture — Truth Document (2026-05-05)

**Generated:** 2026-05-05 PM by Claude as part of the Rule 17 documentation cleanup
**Supersedes:** `outputs/archive/2026-05-04/wa_architecture_truth_2026-05-04.md` (archived; content still valid for the Meta+Twilio subscribed-app evidence trail)
**Authority:** Live code at `website/functions/whatsappAIResponder.js` + `website/functions/whatsappCloudInbound.js` + `website/functions/sofiaConversationAudit.js` — this doc tracks reality, not legacy.

---

## 🪦 What changed since 2026-05-04

The 2026-05-04 doc focused on the Meta-direct vs Twilio-BSP question and the System User token-scope bug. That investigation is still accurate. **What this 2026-05-05 doc adds is the formal kill of ManyChat from the architecture story.** The Lead Supply Recovery agent on 2026-05-05 caught Claude proposing to "build the missing ManyChat webhook mirror" because CLAUDE.md and the `manychat-sofia` skill description still framed ManyChat as the WhatsApp architecture. That framing was 2026-04-vintage and no longer matched live code. This doc — together with the 2026-05-05 sweep of CLAUDE.md / BUSINESS.md / PLAYBOOKS.md / ACCESS.md / DEPRECATED.md / `sofia_ai_whatsapp.md` / `manychat-sofia_v2.md` — closes that drift.

---

## 🎯 Bottom line — the only architecture that exists today

| Direction | API used | Cloud Function | Firestore store | Phone |
|---|---|---|---|---|
| Inbound WhatsApp (multi-tenant: JegoDigital + Flamingo + clients via Twilio account) | **Twilio WA inbound** | `whatsappAIResponder.js` | `wa_conversations/{toNumber}_{leadPhone}` | Whatever Twilio number is configured per client |
| Inbound WhatsApp (JegoDigital own number, Meta direct) | **Meta WhatsApp Cloud API** | `whatsappCloudInbound.js` | `wa_cloud_conversations/{from}` | `+1 978 396 7234` (PNID `1044375245434120`, WABA `1520533496454283`) |
| Outbound WhatsApp (JegoDigital own number) | **Meta WhatsApp Cloud API** | `whatsappCloudSend.js → sendText()` | — | Same `+1 978 396 7234` |
| Outbound WhatsApp (multi-tenant client replies) | **Twilio WhatsApp** | `whatsappAIResponder.js` reply | — | Same Twilio per-client numbers |
| Cold-call follow-up WA | Twilio deep link → Alex's iPhone | manual | — | `wa.me/<lead>` opens Alex's WhatsApp |
| Voice cold calls (Sofia) | Twilio + ElevenLabs Conversational AI | `elevenlabs_trigger_call.cjs` | `cold_calls/*` | `+52 998 387 1618` Twilio MX (3-number round-robin per Apr 27 commit `aeb43e9`) |
| SMS reminders (Calendly) | Twilio | `sendT24hReminders` / `sendT1hReminders` | `calendly_events/*` | Same Twilio MX |

**Sofia conversation audit cron** (nightly 23:00 CDMX) — `sofiaConversationAudit.js` — UNIONs both `wa_conversations/*` and `wa_cloud_conversations/*` for the 24h sample, grades on the 11-point rubric, flags <7/11 to Telegram, writes to `sofia_audits/{date}`.

---

## 🚫 Things that ARE NOT the architecture

- **NOT ManyChat.** `app.manychat.com/fb4452446` is dead. The 3 ice breakers, the AI Step routing, the `MANYCHAT_API_KEY` consumption — all dormant. See `DEPRECATED.md §ManyChat funnel`.
- **NOT n8n.** Public API blocked since 2026-04-07 (free trial, /settings/api gated).
- **NOT a third "ManyChat webhook mirror" path.** The Lead Supply Recovery agent specifically caught Claude proposing to build this; it's not needed because both Twilio and Meta WA Cloud paths already write to Firestore directly.

---

## 🔐 Required env vars (per `whatsappAIResponder.js` + `whatsappCloudInbound.js`)

### Twilio path
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `GEMINI_API_KEY` (Gemini 2.5 Flash)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (hot-lead alerts)

### Meta WA Cloud path
- `WA_CLOUD_ACCESS_TOKEN` (canonical name `META_WA_CLOUD_TOKEN` — see ACCESS.md / `access_truth_jegodigital.md`)
- `WA_CLOUD_PHONE_NUMBER_ID` = `1044375245434120`
- `WA_CLOUD_VERIFY_TOKEN` (default `jego_wa_cloud_verify_2026`)
- `GEMINI_API_KEY`
- `NOTION_API_KEY` (for CRM upsert)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

If `tokenWatchdog` reports `META_WA_CLOUD_TOKEN not set` again — the alarm text is a SYMPTOM, not ground truth. Read `ACCESS.md` and hit the GH Secrets API directly per the 4-step algorithm in `mistakes_ledger.md` (2026-05-05 PM entry).

---

## 🧠 Memory cross-references

- `agent/memory/sofia_ai_whatsapp.md` — Sofia behavioral rules + persona invariants (also updated 2026-05-05)
- `agent/memory/access_truth_jegodigital.md` — credential canonical-name → actual-name table
- `agent/memory/mistakes_ledger.md` — append entry on stale-doc ManyChat reference (this cleanup)
- `outputs/archive/2026-05-04/wa_architecture_truth_2026-05-04.md` — archived predecessor (Meta+Twilio subscribed-apps evidence still valid)

---

**Rule:** if any future doc, agent, or skill description claims Sofia runs on ManyChat, treat that as **stale** and point the source author to this file. Do not let drift recur.
