# Sofia AI — WhatsApp Architecture (canonical)

**Locked:** 2026-05-05 (replaces all prior ManyChat-based descriptions)
**Owner:** Claude reads on every Sofia/WhatsApp-touching session
**Authority:** Live code at `website/functions/whatsappAIResponder.js` + `website/functions/whatsappCloudInbound.js` + `website/functions/sofiaConversationAudit.js` (commit `dcd68b73`, 2026-05-05) — this doc tracks reality, not legacy.

---

## 🟥 ManyChat is DEAD (killed 2026-05-05)

If you read anywhere — old skill docs, `CLAUDE.md` history, BLUEPRINT references — that Sofia "runs on ManyChat" or that we have a "ManyChat flow", **that is stale**. The Lead Supply Recovery agent caught this drift on 2026-05-05 when Claude proposed building a "missing ManyChat webhook mirror" because docs hadn't been refreshed in weeks. This doc is the fix.

See [`CLAUDE.md §Deprecated: ManyChat`](../../CLAUDE.md), [`DEPRECATED.md §ManyChat funnel`](../../DEPRECATED.md), [`BUSINESS.md §WhatsApp + Instagram Funnel`](../../BUSINESS.md), [`skills_patches/manychat-sofia_v2.md`](../../skills_patches/manychat-sofia_v2.md).

---

## 🎯 Real architecture — TWO live paths

Sofia runs on two Cloud Function paths, both calling Gemini 2.5 Flash with Firestore-backed multi-tenant prompts:

### Path 1 — Twilio WhatsApp (multi-tenant: JegoDigital + Flamingo + clients)

| Element | Value |
|---|---|
| Cloud Function | `website/functions/whatsappAIResponder.js` |
| Webhook URL | `https://us-central1-jegodigital-e02fb.cloudfunctions.net/whatsappAIResponder` |
| Inbound source | Twilio WhatsApp webhook |
| System prompt source | Firestore `wa_clients/{toNumber}.systemPrompt` |
| Conversation store | **`wa_conversations/{toNumber}_{leadPhone}`** with `messages: [...]` + `updated_at` |
| Lead extraction | Firestore `wa_leads/{leadId}` |
| Outbound | Twilio WhatsApp API |
| Required env | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |

### Path 2 — Meta WhatsApp Cloud API (JegoDigital's own number)

| Element | Value |
|---|---|
| Cloud Function | `website/functions/whatsappCloudInbound.js` |
| Webhook URL | `https://us-central1-jegodigital-e02fb.cloudfunctions.net/whatsappCloudInbound` |
| Phone | **+1 978 396 7234** |
| Phone Number ID | `1044375245434120` |
| WABA ID | `1520533496454283` |
| Verify token env | `WA_CLOUD_VERIFY_TOKEN` (default `jego_wa_cloud_verify_2026`) |
| System prompt source | Firestore `wa_clients/{wa_number}.systemPrompt` (same store as Path 1) |
| Conversation store | **`wa_cloud_conversations/{from}`** with `messages: [...]` + `updated_at` |
| Outbound | `whatsappCloudSend.sendText(to, body)` |
| Required env | `WA_CLOUD_ACCESS_TOKEN`, `WA_CLOUD_PHONE_NUMBER_ID`, `WA_CLOUD_VERIFY_TOKEN`, `GEMINI_API_KEY`, `NOTION_API_KEY` |

### Audit cron (UNIONs both)

`website/functions/sofiaConversationAudit.js` runs nightly 23:00 CDMX. Per the comment block at line 53 (added by the Lead Supply Recovery fix, commit `dcd68b73`):

> ManyChat is no longer the WhatsApp source. Sofia now runs on Twilio (`whatsappAIResponder.js` → `wa_conversations`) + Meta WhatsApp Cloud API (`whatsappCloudInbound.js` → `wa_cloud_conversations`). The audit reads directly from both Firestore collections — no external API call needed.

The audit grades each conversation on the 11-point rubric (greeted / collected_goal / offered_audit / pushed_calendly / mentioned_proof / collected_website / no_pricing_leak / no_tool_name_leak), flags <7/11 to Telegram, optionally LLM-grades via Anthropic API, writes to `sofia_audits/{date}`.

---

## 🧠 Sofia behavioral rules (still valid — these survive the platform change)

The persona, qualifying flow, intro line, collaboration tone, and escalation logic are platform-agnostic. They live in:

- `skills_patches/manychat-sofia_v2.md` (header marked DEPRECATED 2026-05-05 but body content is still the canonical Sofia voice)
- The fallback prompt embedded in `whatsappCloudInbound.js` lines 53-79 (3-question qualifying flow, ≥2 strong signals → `qualified=true` → escalate to Alex personal WA + Calendly)
- `SOFIA_PILOT_DELIVERY_PLAYBOOK.md`

Key invariants (do not violate):
1. NEVER quote price — push to live Calendly call with Alex
2. Standard intro line per HR-19: *"Soy Sofía de **JegoDigital** — agencia de marketing con IA para inmobiliarias, agencias y desarrolladores."*
3. ≥2 strong signals (timeline <90d, volume ≥10 props/mo, intent claro) → mark `qualified=true` and hand over Alex's WhatsApp `+52 998 202 3263` + Calendly link in next message
4. Hot lead ("ya quiero", "urgente", "esta semana", "decidido") → `escalate=true` (lead_score 8-10) + Telegram alert
5. Output `<META>{...}</META>` invisible block at end of every reply for downstream extraction

---

## 🚫 Things that no longer exist (do not reference)

- `app.manychat.com/fb4452446` — flow URL, dead
- ManyChat ice breakers (3 of them, all retired)
- ManyChat custom fields and tags
- `MANYCHAT_API_KEY` — kept in GH Secrets for now but no live code path consumes it (ACCESS.md row 26 marked deprecated 2026-05-05; remove at next rotation)
- `tools/manychat-mcp/` folder — kept on disk for historical record, never invoked
- "ManyChat webhook mirror" idea — Lead Supply Recovery agent caught the proposal 2026-05-05; was based on stale docs

---

## 🔐 Source-of-truth ordering when investigating Sofia behavior

1. **Live code** — `website/functions/whatsappAIResponder.js` + `whatsappCloudInbound.js` + `sofiaConversationAudit.js`
2. **This doc** — `agent/memory/sofia_ai_whatsapp.md`
3. **Architecture truth** — `agent/memory/wa_architecture_truth_2026-05-05.md`
4. **Sofia persona** — `skills_patches/manychat-sofia_v2.md` (header notes platform deprecation but body is still the canonical voice)
5. **Funnel narrative** — `BUSINESS.md §WhatsApp + Instagram Funnel`

Never trust an older doc that contradicts the live code.
